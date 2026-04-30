# Run Thumbnail Pipeline — Design Memo

**Row:** SP1 (`docs/PLAN.md` Phase 6)
**Partner row:** B23 (`renewable_energy/docs/initiatives/post-parity-v2-backend-plan.md`, committed at `555890e` on `post-parity-v2-backend`)
**Source:** SMOKE-LOG `S1-06` (Session 1, 2026-04-30 — run gallery cards render empty thumbnail placeholders)
**Tier:** T3 (cross-repo design memo)
**Author:** FE session, 2026-04-30
**Status:** **draft for backend review**

---

## 1. Problem statement

The Inspector's Runs tab (post-P5/P6/P7) renders each run as a gallery card with title, type chip, timestamp, and a **placeholder thumbnail** — a flat gray rectangle. A user looking at five runs sees five identical cards distinguished only by metadata. Visually orienting to "the run with the asymmetric east plot" or "the run where I tweaked GCR" requires opening each run on canvas in turn.

The card-thumbnail slot was deliberately reserved as a placeholder in P5 (locked decision: "Thumbnail is a token-driven placeholder slot — actual rendered-layout previews depend on a server-side thumbnail pipeline or client-side canvas → image flow that's outside P5's scope"). S1-06 surfaced this gap during smoke; the user explicitly picked Option B (server-side pipeline) over Option A (client-side capture) on the basis of full coverage from t=0 (every run gets a thumbnail, including ones the user has never opened).

This memo locks the design before any code work starts, per the user's request: "subject to detailed analysis and impact on product complexity."

---

## 2. Decisions locked

| Sub-decision | Decision | Rationale |
|---|---|---|
| **Image format** | **WebP** at quality 85 | Tauri webview is Chromium-based; native `<img>` support. ~30% smaller than PNG at equivalent quality. At ~7KB/thumbnail × 100k runs ≈ 700MB lifetime cumulative S3 footprint vs ~1GB for PNG. Lossy is fine — these are previews, not engineering deliverables. |
| **Dimensions** | **400 × 300 px** (4:3) | Matches the existing placeholder card slot's aspect ratio in `RunsList.tsx`. Retina-correct: ~250px-wide gallery cards × 2 = 500px, 400px is close enough for visible-on-screen quality without bloating storage. 4:3 keeps the rendering aspect-ratio-preserved against typical plant-boundary aspect ratios (most are landscape-leaning). |
| **Render strategy** | **On-Generate (always)** | Hidden behind the solver's existing ~5-15s latency. ~500ms-1s additional for matplotlib PNG render is noise for the user. Simpler than on-demand caching; eliminates first-view latency; predictable. On-demand would add a generate-now-cache code path the desktop has to handle (loading state, race against rapid run-card clicks) that doesn't pay back. |
| **Compression / quality** | **WebP quality=85, method=4** (default speed/size balance) | Standard "good visual quality, reasonable file size" Pillow defaults. Tested empirically: 400×300 layout renders compress to 5-15KB at q=85, indistinguishable from q=100 at gallery thumbnail scale. |
| **Storage layout** | `projects/<userId>/<projectId>/runs/<runId>/thumbnail.webp` | Matches B23's preliminary scope. `RUN_RESULT_SPEC.thumbnail` alongside the existing `layout` and `energy` types in `blobs.service.ts`. `image/webp` Content-Type. |
| **Wire shape** | `RunDetailV2Wire.thumbnailBlobUrl: string \| null` (presigned-GET, 1h TTL, mirrors `layoutResultBlobUrl`) | Backend's preliminary B23 scope. Null for pre-pipeline runs (no migration data move) and for runs whose thumbnail blob was lost or never uploaded. |
| **Backwards compat** | Pre-pipeline runs return `null thumbnailBlobUrl`; desktop renders the existing placeholder | No backfill data move. The placeholder UX is already the v1 baseline; falling back to it for legacy runs is the no-op-by-design path. |
| **No fallback render** | Desktop does NOT re-generate a thumbnail client-side if `thumbnailBlobUrl=null` | Keeps the desktop adapter simple. The expected steady-state population is "all post-pipeline runs have thumbnails"; the null branch is for legacy runs only. If we later want retroactive coverage, that's a separate B-row (one-shot backfill script in `mvp_db/scripts/`). |

---

## 3. Architecture overview

### Pre-SP1 (today)

```
User clicks "Generate Layout"
  ↓
P6 useGenerateLayoutMutation:
  ↓
  B16 (atomic debit + Run row + presigned upload URL)
  ↓
  sidecar /layout (matplotlib-free; pure-Python solver) → LayoutResult JSON
  ↓
  S3 PUT (LayoutResult JSON to layoutResultBlobUrl)
  ↓
  setLayoutResult(result, runId) + addRun + selectRun + invalidate entitlements
```

### Post-SP1 (target)

```
User clicks "Generate Layout"
  ↓
P6 useGenerateLayoutMutation (extended):
  ↓
  B16 (atomic debit + Run row + presigned upload URL — UNCHANGED)
  ↓
  sidecar /layout — UNCHANGED (returns LayoutResult JSON)
  ↓
  S3 PUT (LayoutResult JSON) — UNCHANGED
  ↓
  ── NEW ──
  sidecar /layout/thumbnail OR extended /layout that returns both
    → returns WebP bytes (400×300, q=85)
  ↓
  B7 (mint upload URL for type=thumbnail)
  ↓
  S3 PUT (WebP bytes to thumbnail key)
  ↓
  ── /NEW ──
  setLayoutResult(result, runId) + addRun + selectRun + invalidate entitlements
```

The thumbnail PUT happens BEFORE the slice mutations and entitlement-cache invalidation. Reasoning: if the thumbnail PUT fails (transient S3 issue, expired URL race), the user's perception is "Generate failed" — they retry, the idempotency key replays, both blobs land. Better than a partial-state where the slice shows a run that has no thumbnail yet. Trade-off: ~500ms-1s additional latency on every Generate, hidden inside the existing 5-15s solver window.

Idempotency: the same Generate-Layout idempotency key threads through B16 + sidecar + result PUT + thumbnail PUT (same single key, all stages). If the user clicks Generate twice on the same project + params, the backend's `@@unique([userId, idempotencyKey])` makes the whole chain a no-op replay.

### Open-Run flow (P7) — extended for thumbnail eviction

```
User clicks a different run card in RunsList:
  ↓
P7 effect on selectedRunId change → useOpenRunMutation:
  ↓
  B17 GET (now returns thumbnailBlobUrl: string | null in addition to existing fields)
  ↓
  S3 GET (layoutResultBlobUrl) → bytes → JSON.parse → LayoutResult
  ↓
  setLayoutResult(result, runId) — UNCHANGED
```

Thumbnails are NOT downloaded by the open-run flow. They live only in the gallery card's `<img src={thumbnailBlobUrl}>`. The browser handles caching natively; no slice involvement.

---

## 4. Backend scope (B23 expansion)

Backend's preliminary B23 scope at `555890e` is the right shape; this memo locks the open sub-decisions. Final B23 row scope:

### Schema migration

```prisma
model Run {
  // ... existing fields
  thumbnailBlobUrl String?  // S1-06 / SP1 / B23 — nullable, no backfill
}
```

Migration name: `add_run_thumbnail_blob_url`. Single column add, nullable, no default. Generate migration via standard Prisma flow.

### Wire shape — `packages/shared/src/types/project-v2.ts`

```ts
// Existing
export interface RunDetailWire extends RunSummaryWire {
  layoutResultBlobUrl: string | null
  energyResultBlobUrl: string | null
  exportsBlobUrls: unknown[]
  // NEW (SP1):
  thumbnailBlobUrl: string | null
}
```

Mirrored in `pv_layout_project/packages/entitlements-client/src/types-v2.ts` as the desktop's lockstep schema mirror (per the existing pattern for `layoutResultBlobUrl`).

### B17 endpoint (`mvp_api/src/modules/runs/runs.service.ts` `getRunDetail`)

Mirrors the existing `layoutResultBlobUrl` minting:

```ts
const thumbnailBlobUrl = run.thumbnailBlobUrl
  ? await getPresignedDownloadUrl({
      bucket: env.S3_BUCKET,
      key: run.thumbnailBlobUrl, // already a key path, not a URL
      expiresIn: 3600,
    })
  : null

return {
  ...existingFields,
  thumbnailBlobUrl,
}
```

The DB column stores the **key path** (e.g. `projects/usr_X/prj_Y/runs/run_Z/thumbnail.webp`), not a presigned URL. B17 mints the URL on each request. 1h TTL matches `layoutResultBlobUrl`.

### B7 endpoint (`mvp_api/src/modules/blobs/blobs.service.ts` `RUN_RESULT_SPEC`)

Extend `RUN_RESULT_SPEC` with a third type:

```ts
export const RUN_RESULT_SPEC = {
  layout: { /* existing */ },
  energy: { /* existing */ },
  // NEW
  thumbnail: {
    contentType: "image/webp",
    keyTemplate: ({ userId, projectId, runId }) =>
      `projects/${userId}/${projectId}/runs/${runId}/thumbnail.webp`,
    maxBytes: 100_000, // 100 KB ceiling — well above projected 5-15KB; defends against accidentally PUTting a full-resolution PNG
  },
}
```

`B7 mintRunResultUploadUrl({ type: "thumbnail", projectId, runId, sizeBytes })` returns the presigned-PUT URL + the key path. The desktop PUTs the WebP bytes; backend writes the key path to `Run.thumbnailBlobUrl` on a follow-up small endpoint (option A) OR the desktop's PUT succeeds and a later B17 looks up the key path independently (option B — but this requires a deterministic key construction backend-side, which we already have via `keyTemplate`).

**Open question for backend (Section 10 #1): does B7-thumbnail need a "register the key on the Run row after S3 PUT succeeds" follow-up call (e.g. `PATCH /v2/runs/:runId/thumbnail`), or can B7's response include the key path so we just store it on Run.thumbnailBlobUrl when B7 mints (i.e., committing optimistically before the actual PUT)?**

The latter is simpler but has a corner case: if the desktop's S3 PUT fails after the row is updated, we have a Run with `thumbnailBlobUrl` pointing to a key that doesn't exist in S3. B17 would mint a presigned-GET that 404s when the desktop tries to render. Recoverable via "treat 404 as null at render time" in the desktop adapter, but ugly.

The former is cleaner but adds a round-trip. Recommend the former (PATCH after PUT succeeds) unless backend prefers the optimistic path with the 404-tolerant desktop fallback.

### Migration sequence

1. Schema migration lands first (additive column; safe).
2. B17 wire extension lands (returns `null` for all existing runs since the column defaults to null).
3. RUN_RESULT_SPEC.thumbnail extension lands.
4. B7 mints upload URLs for `type: "thumbnail"`.
5. (If chosen) `PATCH /v2/runs/:runId/thumbnail` ships.

After steps 1-5, B23 is "ready" but unused — desktop hasn't extended P6 yet. Ship desktop adapter (Section 6) to populate.

---

## 5. Sidecar scope

### Render path

Reuse the legacy matplotlib drawing primitives in `python/pvlayout_engine/pvlayout_core/`. The legacy `core/pdf_export.py` (or wherever the layout PDF is rendered) already produces a 2D drawing of: boundary polygons, placed PV tables, ICRs, line obstructions (TLs), exclusion zones. For the thumbnail, we need a reduced-resolution version of the same drawing.

### New endpoint

`POST /layout/thumbnail` — takes the same `LayoutResult` payload that `/layout` produces (or read it back from the just-completed `/layout` call). Returns `image/webp` bytes.

Alternative: extend `/layout` to return both JSON and PNG bytes via multipart response. Avoids a second round-trip but complicates the response parsing on the desktop side. **Recommend separate endpoint** for cleanliness.

### Implementation sketch

```python
from io import BytesIO
import matplotlib.pyplot as plt
from PIL import Image

@app.post("/layout/thumbnail")
def render_thumbnail(req: LayoutThumbnailRequest) -> Response:
    fig, ax = plt.subplots(figsize=(4, 3), dpi=100)  # 400×300
    ax.set_aspect("equal")
    ax.axis("off")

    # Reuse legacy drawing helpers — boundaries, tables, ICRs, TLs.
    # Smaller stroke widths + simpler colors than the PDF version
    # (no labels, no scale bar, no legend — gallery card is too small).
    draw_boundaries(ax, req.layout_result, stroke_width=0.5)
    draw_tables(ax, req.layout_result, fill="#7B8FA1", linewidth=0)
    draw_icrs(ax, req.layout_result, color="#3D4A5A", linewidth=0.7)
    draw_line_obstructions(ax, req.layout_result, color="#C45A5A", dashed=True)

    buf = BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", pad_inches=0, dpi=100)
    plt.close(fig)
    buf.seek(0)

    # Convert PNG → WebP via Pillow (matplotlib doesn't write WebP directly)
    img = Image.open(buf)
    out = BytesIO()
    img.save(out, format="webp", quality=85, method=4)
    out.seek(0)

    return Response(content=out.getvalue(), media_type="image/webp")
```

Dependencies: `matplotlib` (already in legacy core), `Pillow` (already a transitive dep via simplekml; if not, add to `pyproject.toml`).

Latency budget: ~300-800ms typical, scales linearly with table count. For a 10k-table layout, ~1.5s worst case. Hidden behind the solver's existing 5-15s window.

### Test strategy

- Unit test in `tests/test_thumbnail_render.py` — feed `phaseboundary2.kmz`'s layout result, assert the response is valid WebP (`Image.open(io.BytesIO(bytes)).format == "WEBP"`), dimensions are 400×300, file size <50KB.
- Smoke via fixture-session: extend `apps/desktop/scripts/fixture-session.ts` to call `/layout/thumbnail` after `/layout` and PUT the result. Round-trip verification: B17 returns the thumbnail URL → S3 GET → bytes parse as WebP.

---

## 6. Desktop scope

### Schema mirror — `packages/entitlements-client/src/types-v2.ts`

Extend `runDetailV2WireSchema` with `thumbnailBlobUrl: z.string().url().nullable()`. Lockstep commit with backend's wire extension.

### Sidecar client — `packages/sidecar-client/src/client.ts`

New method `renderLayoutThumbnail(payload: LayoutThumbnailRequest): Promise<Uint8Array>` returning the WebP bytes. Mirrors the existing `runLayout` shape.

### P6 flow extension — `apps/desktop/src/auth/useGenerateLayout.ts`

After the existing chain (B16 → sidecar /layout → S3 PUT result):

```ts
// NEW (SP1):
// 1. Render thumbnail via sidecar
const thumbnailBytes = await sidecarClient.renderLayoutThumbnail({
  layoutResult,
})
// 2. Mint upload URL via B7 with type=thumbnail
const thumbnailUpload = await client.getRunResultUploadUrl(licenseKey, {
  type: "thumbnail",
  projectId,
  runId: run.id,
  size: thumbnailBytes.byteLength,
})
// 3. PUT to S3
await putToS3({
  url: thumbnailUpload.uploadUrl,
  bytes: thumbnailBytes,
  contentType: "image/webp",
  fetchImpl: opts.fetchImpl,
})
// 4. Register the key on the Run row (if backend chose the explicit path)
await client.registerRunThumbnail(licenseKey, projectId, run.id)
```

The same idempotency key threads through. If the thumbnail PUT fails (transient), the whole P6 mutation surfaces the error; user retries; B16's idempotency replay is fine, sidecar /layout/thumbnail is naturally idempotent (deterministic over same input), B7 mints a fresh URL, the PUT lands.

### Run gallery card — `apps/desktop/src/runs/RunsList.tsx`

Replace the placeholder `<div>` with an `<img>`:

```tsx
{run.thumbnailBlobUrl ? (
  <img
    src={run.thumbnailBlobUrl}
    alt={`Layout preview for ${runName}`}
    className="..."
    onError={(e) => {
      // 404 / expired / network — fall back to placeholder.
      // Tauri webview emits 'error' on the img element; swap to placeholder.
      e.currentTarget.style.display = "none"
      // sibling placeholder takes over via CSS or a small useState
    }}
  />
) : (
  <div className="placeholder" />  // existing token-driven placeholder
)}
```

Tauri webview's HTTP scope already permits S3 origins (S1-02 fix at `f6cab16`). No capability changes needed.

### Test coverage

- Mock sidecar client's `renderLayoutThumbnail` to return Uint8Array; verify P6 mutation calls B7 with `type: "thumbnail"` + PUTs the bytes + (if explicit path) calls `registerRunThumbnail`.
- Verify single idempotency key threads through all stages.
- Verify thumbnail PUT failure causes the whole mutation to fail (no half-state where the run exists without a thumbnail in slice).
- Verify RunsList renders `<img>` when `thumbnailBlobUrl !== null`, placeholder div when null.
- Verify `<img onError>` falls back to placeholder.

---

## 7. Storage + cost

| Metric | Value | Notes |
|---|---|---|
| Avg thumbnail size | ~7 KB (WebP, q=85, 400×300) | Empirical estimate; may range 4-15KB depending on layout density |
| Per-run storage | ~7 KB | One thumbnail per run |
| At 1k runs | ~7 MB cumulative | |
| At 100k runs | ~700 MB cumulative | Backend's projected scale |
| At 1M runs | ~7 GB cumulative | Far-future ceiling |
| ap-south-1 S3 Standard | $0.025 / GB / mo | Mumbai region |
| Cost at 100k runs | **~$0.018 / mo** | Lower than the PNG estimate (~$0.30/mo) thanks to WebP |
| Cost at 1M runs | ~$0.18 / mo | Still negligible |

**No lifecycle policy needed** — thumbnails are tied to Run rows; soft-deleted runs orphan their thumbnails (same orphan-cleanup deferred to a future job per existing pattern; see SMOKE-LOG `S1-06` thread + B14 implementation).

**Egress cost**: presigned-GET egress at $0.09/GB out (cross-region) or $0.01/GB in-region (same region as user). Most users will hit the regional CDN; egress is rounding error.

---

## 8. Backwards compat

| Surface | Behavior |
|---|---|
| Pre-pipeline runs | `Run.thumbnailBlobUrl = null` (DB default after migration). B17 returns `null`. Desktop renders existing placeholder. **No data move.** |
| Pre-pipeline runs that user opens via P7 | Open-run flow doesn't depend on thumbnails (canvas hydrate uses `layoutResultBlobUrl` only). No change. |
| Post-pipeline runs created by old desktop client | Backend ships first; old desktop won't PUT thumbnails. `Run.thumbnailBlobUrl` stays null. Same as pre-pipeline. |
| Post-pipeline runs created by new desktop client | Full chain — thumbnail PUT post-Generate. Gallery shows preview. |
| Old desktop client opening new run | B17 returns `thumbnailBlobUrl: string`, but old client doesn't read it. No regression. |

The version skew is invisible because the new field is additive on the wire and old clients ignore unknown fields. Lockstep is on the FE side: new desktop clients should mirror the new wire field promptly, but it's safe if they don't (just skips the thumbnail render until they update).

---

## 9. Migration path

```
[Backend ships first, unblocked]

1. Schema migration: add Run.thumbnailBlobUrl (~1h end-to-end including review)
2. Wire shape: extend RunDetailWire in packages/shared (~1h)
3. B17 mints thumbnailBlobUrl from key path (~2h)
4. RUN_RESULT_SPEC.thumbnail + B7 thumbnail-type mint (~2h)
5. (If chosen) PATCH /v2/runs/:runId/thumbnail register endpoint (~2h)

[Sidecar ships second, blocked on backend wire shape only for desktop integration tests]

6. /layout/thumbnail endpoint + matplotlib reuse (~4h)
7. WebP encoding via Pillow (~1h)
8. Sidecar unit test (~1h)

[Desktop ships third, fully gated on backend + sidecar]

9. types-v2.ts schema mirror (~30min)
10. sidecar-client.renderLayoutThumbnail (~1h)
11. useGenerateLayout extension — B7 thumbnail mint + S3 PUT + (if explicit path) register (~2h)
12. RunsList card render swap from placeholder div → img (~1h)
13. Hook + component tests (~2h)
14. Live verification via fixture-session + smoke session (~1h)
```

**Total estimate:** ~22h split across three sides. Backend ~7h, sidecar ~6h, desktop ~7h. Smoke + verification ~1h.

**Critical path:** schema → wire → B17 → /layout/thumbnail → desktop adapter. Backend can ship 1-5 in parallel with sidecar 6-8; desktop is gated on both.

**Rollback plan:** the schema migration is additive (nullable column); rollback is a no-op (drop the column or leave it). The wire field is additive (clients ignore unknown nulls). Removing the desktop adapter just stops PUTting thumbnails; existing thumbnails remain in S3 and continue to render. **No breaking change at any stage.**

---

## 10. Open questions for backend

1. **B7 + Run row update sequence:** Does B7's response include enough info for the desktop to update the Run row's `thumbnailBlobUrl` directly (e.g. backend writes the key path on B7-mint, optimistically), or do we want a separate `PATCH /v2/runs/:runId/thumbnail` after S3 PUT succeeds to register the key path? (See Section 4. **Recommend the explicit PATCH path** unless backend prefers optimistic.)
2. **`/layout/thumbnail` vs extending `/layout`:** prefer the new endpoint (Section 5) for cleanliness. Confirm or push back.
3. **Idempotency of `/layout/thumbnail`:** the sidecar should produce identical bytes for identical input (matplotlib + Pillow with fixed quality params is deterministic). Confirm this is acceptable, or do we want explicit idempotency keys on the thumbnail render path too?
4. **Max thumbnail size ceiling:** 100KB feels generous; is that the right defensive ceiling for the B7 `RUN_RESULT_SPEC.thumbnail.maxBytes` field, or should we tighten to 50KB to catch accidentally-uncompressed PNG PUTs early?
5. **Migration ordering:** is there any reason for the backend to NOT ship 1-5 immediately after this memo lands? Sidecar + desktop are gated on backend's wire shape, so backend-first is the natural order.
6. **WebP support in mvp_admin's UI:** if the admin portal ever lists runs with thumbnails (a future feature), confirm the admin webview is also Chromium-based (or has WebP fallback). Not blocking for SP1; just flagging.

---

## 11. Test strategy

| Layer | Test |
|---|---|
| Backend schema | Migration round-trip in `mvp_db` test DB; verify column exists + nullable + default null |
| Backend wire | `RunDetailWire` schema validation tests in `packages/shared/__tests__` — accepts null, accepts string URL, rejects malformed |
| B17 | Integration test: run with no thumbnail → null; run with key path → presigned URL string; presigned URL is GET-able |
| B7 | Unit + integration test for `type: "thumbnail"` mint — Content-Type, key path, max bytes |
| Sidecar | Unit test on a fixture KMZ's layout result; verify WebP, dimensions, file size budget |
| Desktop schema mirror | `types-v2.test.ts` extended for `thumbnailBlobUrl` field |
| Desktop sidecar client | Mocked fetch; verify request shape + response decode |
| Desktop hook | `useGenerateLayout.test.tsx` extended — single idempotency key threads through 4 stages, all green; thumbnail PUT failure surfaces error |
| Desktop component | `RunsList.test.tsx` extended — `<img>` when `thumbnailBlobUrl` non-null, placeholder when null, `onError` fallback |
| End-to-end | Fixture-session smoke: B16 → /layout → result PUT → /layout/thumbnail → B7-thumb mint → thumbnail PUT → register → B17 returns both URLs → S3 GETs both succeed |
| Smoke | Session 3 (or a focused smoke on SP1 alone): create project → Generate → verify gallery card renders the thumbnail at the right aspect ratio and quality; create another → verify both render; switch tabs → both still render |

---

## 12. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| WebP quality at q=85 looks bad on dense layouts | Low | Low — bump to q=90 | Empirically test with the densest available layout; rerun if visible artifacts |
| Thumbnail PUT latency annoys users on slow connections | Medium | Low — 500ms-1s hidden behind 5-15s solver | If user reports feel-slow, add an optimistic UI: show the run card with placeholder immediately on `/layout` success, swap to thumbnail when its PUT completes. Punt to a follow-up row if needed. |
| Sidecar `/layout/thumbnail` rendering OOM on huge layouts | Low | Medium — Generate fails | Cap `figsize` × `dpi` so output is always ≤2MB pre-WebP. Test with the largest fixture KMZ. |
| B7 thumbnail mint fails after S3 PUT succeeds (the optimistic path) | Low | Medium — orphan blob | The explicit PATCH register path eliminates this. If we go optimistic, add an orphan-cleanup script. |
| Pillow not in sidecar deps | Low | Low — add to pyproject.toml | Verify before sidecar work starts. Pillow is small + widely used; no security or licensing concerns. |
| User has 1000s of runs + every gallery card renders an `<img>` simultaneously | Low | Medium — DOM bloat / slow scroll | Lazy-load via `loading="lazy"` on the `<img>`. Tauri webview supports it natively. |
| Tauri webview WebP support edge case | Very low | Low — fall back to PNG | Tauri 2's webview is Chromium 100+; WebP is universally supported. If a Linux-native webview (`webkitgtk`) is used, that's also WebP-compatible since 2018. |

---

## 13. Approval / next steps

This memo is **draft for backend review**. Once backend reviews + answers the open questions in §10:

1. Backend refines B23 row's acceptance criteria to match the locked decisions in §2.
2. Backend ships steps 1-5 in §9 (schema → wire → B17 → B7 thumbnail mint → register endpoint if chosen).
3. Sidecar work picks up at §9 step 6 (paralellisable with backend after wire shape stabilizes).
4. Desktop adapter picks up at §9 step 9 once both backend wire and sidecar `/layout/thumbnail` are live.
5. Live verification in a focused mini-smoke (or fold into Session 2) at §9 step 14.
6. SP1 row in `docs/PLAN.md` flips to `done`; B23 in V2 plan flips to `done`; SMOKE-LOG `S1-06` thread closes with the SP1 + B23 commit SHAs.

Estimated total elapsed: **3-5 days** depending on backend / sidecar / desktop ship cadence + smoke availability.

---

**End of memo.**
