# Run Thumbnail Pipeline — Design Memo

**Row:** SP1 (`docs/PLAN.md` Phase 6)
**Partner row:** B23 (`renewable_energy/docs/initiatives/post-parity-v2-backend-plan.md`, committed at `555890e` on `post-parity-v2-backend`)
**Source:** SMOKE-LOG `S1-06` (Session 1, 2026-04-30 — run gallery cards render empty thumbnail placeholders)
**Tier:** T3 (cross-repo design memo)
**Author:** FE session, 2026-04-30
**Status:** **v2 — Path A locked, §14 added for SP4 (project card thumbnails)**

**Revision history:**
- **v1 (2026-04-30):** initial draft locking format/dimensions/render strategy/storage. Recommended Path B (explicit `Run.thumbnailBlobUrl` column + PATCH register endpoint) for the B7-mint-vs-S3-PUT sequence question.
- **v2 (2026-04-30):** flipped to **Path A** (deterministic-key approach, no DB column) per backend's pushback — cleaner overall, same edge-case shape but handled entirely by `<img onError>` instead of via DB null checks. Added **§14 — Project card thumbnails (SP4)** covering the RecentsView surface that leverages the same per-run thumbnail asset via a B10 projection extension.

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
| **Wire shape** | `RunDetailV2Wire.thumbnailBlobUrl: string \| null` (presigned-GET, 1h TTL, mirrors `layoutResultBlobUrl`) | Backend's preliminary B23 scope. URL is **derived** from the deterministic key `projects/<userId>/<projectId>/runs/<runId>/thumbnail.webp` — backend signs it on every B17 call regardless of whether the S3 PUT actually succeeded. Null for **pre-SP1 runs** only (when SP1 ships, every new run gets a deterministic-key URL signed; PUT failures are masked behind the `<img onError>` fallback at render time). |
| **Persistence model — Path A** | **No `Run.thumbnailBlobUrl` column.** Thumbnail key is content-addressed by `runId` (deterministic). Backend mints presigned-GET on every B17 call against the derived key path. | Cleaner than Path B (explicit DB column + PATCH register endpoint). Saves an extra round-trip on every Generate, eliminates a schema migration, eliminates a register endpoint. Edge case (S3 PUT failed → presigned-GET 404s) is naturally handled by `<img onError>` falling back to placeholder. The orphan-blob risk is symmetric: under Path B the DB column would point to a non-existent key; under Path A the URL signs but 404s. Path A's failure mode is invisible to users via the `<img>` fallback. |
| **Backwards compat** | Pre-SP1 runs: backend explicitly returns `null` (since no PUT happened, the deterministic URL would 404 on every load). Post-SP1 runs: deterministic URL signed; `<img onError>` falls back if the PUT didn't land. | No migration data move. **Path A bonus:** if we later want retroactive thumbnails for legacy runs, a one-shot batch job (re-render from each run's stored `layoutResultBlobUrl`) just PUTs into the deterministic keys — no DB column to update, no register call to make. Cleanest possible backfill story. |

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

## 4. Backend scope (B23 expansion) — Path A (deterministic key)

Backend's preliminary B23 scope at `555890e` is the right shape; this memo locks the open sub-decisions per Path A (no DB column, deterministic key construction).

### No schema migration

**No `Run.thumbnailBlobUrl` column needed.** The thumbnail S3 key is fully derivable from `(userId, projectId, runId)` via the deterministic template:

```
projects/<userId>/<projectId>/runs/<runId>/thumbnail.webp
```

B17 mints a presigned-GET against this key on every call. Whether the S3 PUT actually landed is determined at render time on the desktop side via `<img onError>`.

**Path A trade-off:** the URL is signed even when the blob doesn't exist (pre-SP1 runs, failed PUTs). The desktop's `<img onError>` fallback handles 404 cleanly. Symmetric failure-mode coverage to Path B but without the migration / register-endpoint cost.

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

`null` is returned for **pre-SP1 runs only** (runs created before this row ships — backend can detect via `Run.createdAt < SP1_DEPLOY_TIMESTAMP` or by checking whether `RUN_RESULT_SPEC.thumbnail` was a known type at creation time). Post-SP1 runs always get a signed URL even if the underlying PUT 404s; that fallback path is owned by the desktop's `<img onError>`.

### B17 endpoint (`mvp_api/src/modules/runs/runs.service.ts` `getRunDetail`)

```ts
const thumbnailKey = isPreSP1(run)
  ? null
  : `projects/${run.userId}/${run.projectId}/runs/${run.id}/thumbnail.webp`
const thumbnailBlobUrl = thumbnailKey
  ? await getPresignedDownloadUrl({
      bucket: env.S3_BUCKET,
      key: thumbnailKey,
      expiresIn: 3600,
    })
  : null

return {
  ...existingFields,
  thumbnailBlobUrl,
}
```

`isPreSP1(run)` is the backend-side determinism choice — could be a `createdAt` timestamp comparison against the deploy time, or a simpler "always sign post-deploy, null pre-deploy" cutoff. **Open question for backend (§10 Q1):** does the backend prefer to sign-and-let-onError-fallback for ALL runs (simplest, most uniform), or carry a cutoff timestamp / feature flag?

### B7 endpoint (`mvp_api/src/modules/blobs/blobs.service.ts` `RUN_RESULT_SPEC`)

Extend `RUN_RESULT_SPEC` with the thumbnail type:

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

`B7 mintRunResultUploadUrl({ type: "thumbnail", projectId, runId, sizeBytes })` returns the presigned-PUT URL.

**No PATCH register endpoint needed** under Path A — the desktop just PUTs the bytes; backend reads the deterministic key on the next B17. Net: one fewer endpoint, one fewer round-trip per Generate.

### Migration sequence (Path A)

1. **Wire shape** lands first — extend `RunDetailWire` with `thumbnailBlobUrl: string | null` in `packages/shared`. Returns null for all runs initially since `RUN_RESULT_SPEC.thumbnail` doesn't exist yet.
2. **`RUN_RESULT_SPEC.thumbnail`** lands — adds the type to the spec map.
3. **B17** starts signing the deterministic URL for post-deploy runs (or for all runs uniformly, per §10 Q1).
4. **B7** mints upload URLs for `type: "thumbnail"`.

That's it. No migration, no register endpoint. **Two fewer steps than the original Path B sequence.**

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
// NEW (SP1, Path A — no register call):
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
// 3. PUT to S3 (deterministic key — backend reads it on next B17 via the
//    same key template; no register call needed under Path A)
await putToS3({
  url: thumbnailUpload.uploadUrl,
  bytes: thumbnailBytes,
  contentType: "image/webp",
  fetchImpl: opts.fetchImpl,
})
```

The same idempotency key threads through. If the thumbnail PUT fails (transient): backend has already created the Run row (via B16) with the deterministic key implicitly known; B17 will sign a URL that 404s on GET; `<img onError>` falls back to placeholder on the desktop. User can re-Generate (idempotency replay re-runs the chain — sidecar render is deterministic over the same LayoutResult, fresh B7 mint, fresh PUT, this time it lands). **No half-state bookkeeping needed.**

**Failure-handling decision: thumbnail PUT failure does NOT fail the whole Generate mutation.** The user got their layout; the thumbnail is a polish surface. If the PUT errors, log + swallow (or surface a non-blocking warning toast in a future SP-row); the existing placeholder takes over visually. This differs from the layout-result PUT (which DOES fail the mutation since canvas hydration depends on it).

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

## 9. Migration path (Path A)

```
[Backend ships first, unblocked]

1. Wire shape: extend RunDetailWire in packages/shared with
   thumbnailBlobUrl: string | null (~1h end-to-end)
2. RUN_RESULT_SPEC.thumbnail extension in blobs.service.ts (~1h)
3. B17 signs deterministic URL via existing getPresignedDownloadUrl
   helper (~2h)
4. B7 mints upload URLs for type=thumbnail (~2h)

[Sidecar ships second, blocked on backend wire shape only for desktop integration tests]

5. /layout/thumbnail endpoint + matplotlib reuse (~4h)
6. WebP encoding via Pillow (~1h)
7. Sidecar unit test (~1h)

[Desktop ships third, fully gated on backend + sidecar]

8. types-v2.ts schema mirror (~30min)
9. sidecar-client.renderLayoutThumbnail (~1h)
10. useGenerateLayout extension — sidecar render + B7 thumb mint
    + S3 PUT (Path A — no register call) (~1.5h)
11. RunsList card render swap from placeholder div → img with
    onError fallback (~1.5h)
12. Hook + component tests (~2h)
13. Live verification via fixture-session + smoke session (~1h)
```

**Total estimate:** ~19h split across three sides (was ~22h under Path B; saved ~3h: no migration step, no register endpoint, no register-call wiring on desktop). Backend ~6h, sidecar ~6h, desktop ~6h. Smoke + verification ~1h.

**Critical path:** wire → B17 → /layout/thumbnail → desktop adapter. Backend can ship 1-4 in parallel with sidecar 5-7; desktop is gated on both.

**Rollback plan:** all four backend steps are additive (no schema change → no migration to roll back; new wire field is additive; new RUN_RESULT_SPEC entry is additive). The wire field is additive (clients ignore unknown nulls). Removing the desktop adapter just stops PUTting thumbnails; existing thumbnails remain in S3, B17 keeps signing URLs that 404 on GET, `<img onError>` keeps falling back to placeholder. **No breaking change at any stage; rollback is purely a no-op.**

---

## 10. Open questions for backend

1. **Pre-SP1 run handling — null cutoff vs always-sign?** Under Path A, B17 signs a deterministic URL on every call. Two flavors:
   - **(a) Always sign** — even for pre-SP1 runs. URL 404s on GET; `<img onError>` falls back. Simplest backend-side; desktop already handles 404 fallback for post-SP1 runs that PUT-failed, so this is uniform.
   - **(b) Null cutoff** — backend returns `thumbnailBlobUrl: null` for runs created before SP1 ships, deterministic URL otherwise. Slightly more complex on the backend (needs a deploy-timestamp or feature-flag check) but slightly cleaner on the desktop (null → placeholder, never 404 → fallback).

   **Recommend (a) — always sign.** The desktop's `<img onError>` is already mandatory for the post-SP1 PUT-failure case; carrying the same fallback for pre-SP1 runs costs nothing and removes the cutoff tracking from the backend. Pre-SP1 runs render placeholder via 404 → onError → fallback, identical UX to post-SP1 PUT-failed runs.
2. **`/layout/thumbnail` vs extending `/layout`:** prefer the new endpoint (Section 5) for cleanliness. Confirm or push back.
3. **Idempotency of `/layout/thumbnail`:** the sidecar should produce identical bytes for identical input (matplotlib + Pillow with fixed quality params is deterministic). Confirm this is acceptable, or do we want explicit idempotency keys on the thumbnail render path too?
4. **Max thumbnail size ceiling:** 100KB feels generous; is that the right defensive ceiling for the B7 `RUN_RESULT_SPEC.thumbnail.maxBytes` field, or should we tighten to 50KB to catch accidentally-uncompressed PNG PUTs early?
5. **Migration ordering:** is there any reason for the backend to NOT ship Path A's 4 steps (wire shape → RUN_RESULT_SPEC.thumbnail → B17 → B7) immediately after this memo lands? Sidecar + desktop are gated on backend's wire shape, so backend-first is the natural order.
6. **WebP support in mvp_admin's UI:** if the admin portal ever lists runs with thumbnails (a future feature), confirm the admin webview is also Chromium-based (or has WebP fallback). Not blocking for SP1; just flagging.

---

## 11. Test strategy

| Layer | Test |
|---|---|
| Backend wire | `RunDetailWire` schema validation tests in `packages/shared/__tests__` — accepts null, accepts string URL, rejects malformed |
| B17 | Integration test: B17 returns a presigned URL with the deterministic key path; S3 GET of that URL returns 200 when the blob exists, 404 when it doesn't (both expected, neither is a backend bug) |
| B7 | Unit + integration test for `type: "thumbnail"` mint — Content-Type, deterministic key path, max bytes |
| Sidecar | Unit test on a fixture KMZ's layout result; verify WebP, dimensions, file size budget |
| Desktop schema mirror | `types-v2.test.ts` extended for `thumbnailBlobUrl` field |
| Desktop sidecar client | Mocked fetch; verify request shape + response decode |
| Desktop hook | `useGenerateLayout.test.tsx` extended — single idempotency key threads through B16 → sidecar layout → result PUT → sidecar thumbnail render → B7 thumb mint → thumbnail PUT, all green; thumbnail PUT failure does NOT fail the whole mutation (different from layout-result PUT failure); generate succeeds with placeholder showing |
| Desktop component | `RunsList.test.tsx` extended — `<img>` when `thumbnailBlobUrl` non-null; on `<img onError>` (404 / network), swap to placeholder; verify the `<img>` element renders with the correct `alt` text + `loading="lazy"` |
| End-to-end | Fixture-session smoke: B16 → /layout → result PUT → /layout/thumbnail → B7-thumb mint → thumbnail PUT → B17 returns thumbnail URL → S3 GET returns 200 + WebP bytes |
| Smoke | Session 3 (or a focused smoke on SP1 alone): create project → Generate → verify gallery card renders the thumbnail at the right aspect ratio and quality; create another → verify both render; switch tabs → both still render; force a thumbnail PUT failure (network throttle) → Generate succeeds anyway, gallery card renders placeholder |

---

## 12. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| WebP quality at q=85 looks bad on dense layouts | Low | Low — bump to q=90 | Empirically test with the densest available layout; rerun if visible artifacts |
| Thumbnail PUT latency annoys users on slow connections | Medium | Low — 500ms-1s hidden behind 5-15s solver | If user reports feel-slow, add an optimistic UI: show the run card with placeholder immediately on `/layout` success, swap to thumbnail when its PUT completes. Punt to a follow-up row if needed. |
| Sidecar `/layout/thumbnail` rendering OOM on huge layouts | Low | Medium — Generate fails | Cap `figsize` × `dpi` so output is always ≤2MB pre-WebP. Test with the largest fixture KMZ. |
| Thumbnail PUT fails (transient S3 / expired URL) | Medium | Low — placeholder renders, Generate still succeeds | Path A's `<img onError>` is naturally tolerant. User can re-Generate (idempotency replay) to retry the PUT. No half-state; no orphan-cleanup script needed since the failure is "no blob exists" rather than "DB column points to non-existent blob." |
| Pre-SP1 runs render placeholder forever (never get retroactive thumbnails) | High (deterministic) | Low — by design, acceptable | If user demand for retroactive coverage surfaces, a one-shot batch job re-renders from `layoutResultBlobUrl` and PUTs to the deterministic key. No DB updates needed under Path A. Punted as a separate follow-up row when/if asked. |
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

---

## 14. Project card thumbnails (SP4)

This section covers the **second visual surface** for the same SP1 thumbnail asset: the project cards on RecentsView. SP4 is a separate PLAN.md row but rides entirely on SP1's per-run thumbnail infrastructure — no new sidecar work, no new S3 layout, no new schema. The only addition is a backend B10 projection extension (B24) and a desktop schema mirror + RecentsView component edit.

### Trigger

S1-06 surfaced the run-gallery thumbnail gap. While drafting this memo, the user observed that **the same UX problem applies to RecentsView project cards** — every card looks identical, distinguished only by name and timestamp. A user with a dozen projects can't visually identify "the 89-acre site with the TL crossing" without opening each one.

The fix is the same shape: render a thumbnail. The strongest UX is a "30K-foot view" of the project's most recent layout (or its boundary if no runs exist).

### Decisions (delegated to §2)

All four sub-decisions from §2 apply verbatim — same image format (WebP q=85), same dimensions (400×300), same render strategy (the asset already exists from SP1's on-Generate render), same storage layout (deterministic key under the run that produced it).

**No second-dimension decision.** RecentsView project cards (`grid-cols-[repeat(auto-fill,minmax(260px,1fr))]` per [RecentsView.tsx](../../apps/desktop/src/recents/RecentsView.tsx)) are ~260–280px wide × ~150–180px tall — almost identical envelope to Inspector run gallery cards. The same 400×300 WebP renders cleanly on both surfaces via plain CSS sizing. **No sidecar variant needed; no per-variant storage scheme.**

This is the cleanest possible architecture: **one thumbnail asset per Run, two visual surfaces.**

### Architecture

**Project cards show the most-recent non-deleted Run's thumbnail.** Empty projects (zero runs) show the existing placeholder.

This means SP4 is purely:
- Backend B10 (`listProjects`) projection extension with `mostRecentRunThumbnailBlobUrl: string | null` (computed from a JOIN against the project's most-recent non-deleted Run, then signing the deterministic key per Path A).
- Desktop schema mirror in `entitlements-client/src/types-v2.ts`.
- Desktop component edit in `RecentsView.tsx`.

No backend schema changes, no new sidecar capability, no new S3 layout.

### Backend scope (B24)

B24's preliminary code at `dfd0c48` already implements the right shape:

```ts
// B10 listProjects extension (Path A — deterministic key)
const projects = await db.project.findMany({
  where: { userId, deletedAt: null },
  orderBy: { updatedAt: "desc" },
  take: LIST_CAP,
  include: {
    runs: {
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 1,
      select: { id: true },
    },
    _count: { runs: { where: { deletedAt: null } } },
  },
})

const bucket = env.MVP_S3_PROJECTS_BUCKET
return Promise.all(projects.map(async (p) => {
  const latestRun = p.runs[0]
  const thumbnailKey = latestRun
    ? `projects/${userId}/${p.id}/runs/${latestRun.id}/thumbnail.webp`
    : null
  const mostRecentRunThumbnailBlobUrl =
    thumbnailKey && bucket
      ? await getPresignedDownloadUrl(thumbnailKey, "thumbnail.webp", 3600, bucket)
      : null
  return { /* existing fields */, mostRecentRunThumbnailBlobUrl }
}))
```

**Sign cost is fine:** up to 100 projects × 1 SigV4 sign per request = ~100 microsecond CPU operations, low-single-digit ms total latency. Backend confirmed this is acceptable.

**Failure-mode coverage:** same as SP1 Path A. When a project's most-recent run has no thumbnail blob (PUT failed, pre-SP1 run, etc.), the URL signs but the GET 404s — desktop's `<img onError>` falls back to placeholder. Symmetric handling.

### Desktop scope (SP4)

Three small surfaces:

#### Schema mirror — `packages/entitlements-client/src/types-v2.ts`

Extend `projectSummaryListRowV2Schema` with `mostRecentRunThumbnailBlobUrl: z.string().url().nullable()`. Lockstep commit with backend's B10 extension.

#### Hook — `apps/desktop/src/auth/useProjectsList.ts`

No code change — the hook already returns `ProjectSummary[]` verbatim from B10; the new field rides through the schema.

#### Component — `apps/desktop/src/recents/RecentsView.tsx`

Replace the placeholder thumbnail slot with an `<img>`:

```tsx
{project.mostRecentRunThumbnailBlobUrl ? (
  <img
    src={project.mostRecentRunThumbnailBlobUrl}
    alt={`${project.name} most recent layout preview`}
    loading="lazy"
    className="..."  // sized to match the existing placeholder slot
    onError={(e) => {
      e.currentTarget.style.display = "none"
      // sibling placeholder takes over via CSS or a small useState
    }}
  />
) : (
  <div className="placeholder" />  // existing token-driven placeholder
)}
```

`loading="lazy"` is critical here — RecentsView can render dozens of cards on a single load; lazy-load defers below-the-fold thumbnails until scroll.

### Test coverage (SP4)

- Backend: extend B10 integration test to verify the new field — null when project has 0 runs, deterministic URL when project has runs.
- Desktop: extend `useProjectsList.test.ts` for the new field + extend `RecentsView.test.tsx` for the conditional render + `onError` fallback (mirrors SP1's `RunsList.test.tsx` pattern).

### Migration path (SP4)

SP4 strictly depends on SP1. Until SP1 ships, B10 returns `mostRecentRunThumbnailBlobUrl: null` for everyone (because no run has a thumbnail blob in S3), and RecentsView shows placeholders everywhere. **No user-visible improvement until SP1 lands.** So:

```
[SP1 ships first per §9 sequence]

[Backend ships B24 second]
1. Extend B10 projection with mostRecentRunThumbnailBlobUrl (~2h)
2. Integration test for the new field (~1h)

[Desktop ships SP4 third, in parallel with backend B24 once wire stabilizes]
3. types-v2.ts schema mirror for projectSummaryListRowV2Schema (~30min)
4. RecentsView card render swap (~1h)
5. Component test extension (~1h)
6. Live verification — open RecentsView with multiple projects, verify thumbnails on the ones with runs, placeholders on empty projects (~30min)
```

**SP4 estimate:** ~6h total. Backend ~3h, desktop ~3h.

### Combined SP1 + SP4 plan

If SP1 ships completely (backend + sidecar + desktop) before SP4 begins, SP4's ~6h is purely additive. If SP4 backend (B24) ships in parallel with SP1's later steps (after wire shape stabilizes), the total cross-repo elapsed shrinks slightly. Either way, total cross-repo cost: **~25h** for both rows together.

### Empty-project fallback (future)

If user demand surfaces for a non-placeholder visual on empty projects (just-created, no runs yet), the cleanest follow-up is a **client-side boundary-only SVG render** — no server work, no new asset. The desktop already has the parsed KMZ in its slice; rendering a small SVG of the boundary outline is trivial. Not in scope for SP4; logged here as a "if asked" follow-up.

### Approval

§14 is **draft for backend review** alongside the rest of memo v2. No new open questions on the SP4 surface specifically; backend's B24 preview at `dfd0c48` is the right implementation under Path A.

---

**End of memo.**
