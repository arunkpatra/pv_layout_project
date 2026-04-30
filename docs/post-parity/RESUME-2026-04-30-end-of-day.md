# Resume prompt — post-compaction handoff (end of day, 2026-04-30)

Copy the block between `--- BEGIN PROMPT ---` markers as the first
message in the resumed session. Reads in ~3 minutes.

---

--- BEGIN PROMPT ---

# Resuming post-parity desktop work — end of day 2026-04-30

You're resuming a multi-week post-parity build on the
`pv_layout_project` repo. Today closed Phase 6 of `docs/PLAN.md`
(SP1+SP3+SP4+SP6 all live-verified end-to-end + SMOKE-LOG Session 2
formally closed). Branch is in good shape; PRO_PLUS user is slate-
clean for a Prasanta demo that's about to happen.

## Branch state

Working directory: `/Users/arunkpatra/codebase/pv_layout_project`.
Branch: `post-parity-v1-desktop` (DO NOT push to main).
HEAD: `c0017f3 docs(smoke): Session 2 final closeout — Phase 6
row outcomes table + carry-forward` (pushed; origin tracking).

Plan status: **23 / 57 rows done** in [docs/PLAN.md](docs/PLAN.md).

Recent commits (newest first):

```
c0017f3 docs(smoke): Session 2 final closeout — Phase 6 row outcomes
0da04a6 fix(ui): TopBar breadcrumb + MapCanvas scale-bar polish
f549f58 fix: SP6 — normalize boundary coords to 0..1000 viewBox
0d937ea feat: SP6 — boundary GeoJSON fallback
67e12ed docs: SP1 + SP4 closed; SP6 row added (B26 inbound)
0b834a7 fix(cache): invalidate ['projects', key] from 3 mutations
7bce97c feat: SP1+SP4 desktop adapter — thumbnail render + surfaces
4953e13 docs(plan): log SP5 — dark-theme thumbnail polish (deferred)
4859a3f feat: SP1 — sidecar /layout/thumbnail (matplotlib + Pillow)
a32353e fix(recents): bleed card-footer separator + tighten bar
7e78d3b feat: SP3 polish — icons, type-to-confirm, stopPropagation
2d38d97 feat: SP3 — project rename/delete proper UX
e162731 docs(plan): expand SP3 + close Session 2 inconclusive
e45c253 docs(memo): SP1 memo v3 — lock all §10 answers
```

## Phase 6 (smoke-derived polish) — final outcomes

| Row | Status |
|---|---|
| **SP1** — Run gallery thumbnails (server-side pipeline) | **done** |
| **SP2** — In-place run-switch loading feedback | **todo** (not started) |
| **SP3** — Project rename / delete proper UX | **done** |
| **SP4** — RecentsView project card thumbnails | **done** |
| **SP5** — Dark-theme thumbnail polish | deferred to S13.5 |
| **SP6** — Boundary GeoJSON fallback | **done** |

## Cross-repo backend partner SHAs (all on origin)

| Backend row | SHA | Surface |
|---|---|---|
| B23 | `649a5ff` | `RunDetailWire.thumbnailBlobUrl` + B17 deterministic-sign + RUN_RESULT_SPEC.thumbnail + B7 type=thumbnail |
| B24 | `a2339c9` | B10 `mostRecentRunThumbnailBlobUrl` projection |
| B25 | `98b5a75` | RunSummary `thumbnailBlobUrl` extension on B12's embedded runs[] + B15 |
| B26 | latest | Project `boundaryGeojson Json?` column + B11 accepts on create + B10/B12 emit |

Backend session is on `post-parity-v2-backend`. Cross-repo coordination
protocol locked at v2 in SMOKE-LOG.md "Cross-repo plan coordination".
Pattern: paste-block before either side commits a partner row; both
ack; both commit; both push.

## What's locked across the compact (do NOT relitigate)

**SP1 thumbnail design** (memo v3 at `docs/post-parity/findings/2026-04-30-001-run-thumbnail-pipeline.md`):
- WebP at q=85, 400×300px, on-Generate (always render, hidden behind solver latency)
- Path A deterministic key: `projects/<userId>/<projectId>/runs/<runId>/thumbnail.webp`
- Always-sign on every B17/B12/B10 call (no cutoff, no DB column for the URL)
- 50KB ceiling on the B7 PUT (RUN_RESULT_SPEC.thumbnail.maxBytes)
- No idempotency key on `/layout/thumbnail` render path (semantic determinism)
- Separate `/layout/thumbnail` endpoint (not multipart on `/layout`)

**SP3 rename/delete UX** (5 surfaces locked):
1. Recents card bottom-right `⋯` (lucide MoreHorizontal) → DropdownMenu → Rename + Delete
2. Tab right-click → Radix ContextMenu → same Rename + Delete
3. Cmd-K → Recents submenu (NAVIGATION ONLY; quick-switch projects)
4. REMOVED: Cmd-K "Rename project…" + "Delete project…" palette items (Cmd-K context is ambiguous)
5. Two shared Dialog modals: `RenameProjectDialog` + `DeleteProjectConfirmDialog` (type-to-confirm `delete` gate on the destructive one)

Post-delete tab cleanup folded INTO `useDeleteProject.onSuccess` BEFORE `clearAll()` (prevents post-delete 404 race).

**SP6 boundary fallback**:
- Backend stores `Project.boundaryGeojson` at create time (B11 accepts it from desktop, no server-side parsing).
- Desktop sends parsed boundary on B11 (already in memory post-`sidecar.parseKmz`).
- ProjectCardThumbnail render priority: real run thumbnail → BoundarySvg → muted placeholder.
- BoundarySvg normalizes lon/lat to 0..1000 viewBox to dodge WebKit's SVG-precision threshold (tiny lon/lat spans of ~0.002 silently fail to render).

**Cache invalidation policy**: four mutations invalidate `["projects", licenseKey]` —
`useCreateProject`, `useRenameProject`, `useDeleteProject`, `useGenerateLayout`,
`useDeleteRun`, `useAutoSaveProject`. (Six total now; the latter three were
fixed in `0b834a7` after the user observed live "run had occurred but
homepage showed 'No runs yet'".)

**Other locked decisions** (carried from prior sessions):
- Cloud-first; no internet → no app
- TS-extension architecture for V2 client (no separate Rust crate)
- License-key bearer auth (`sl_live_*`); never Clerk on desktop
- AWS S3 ap-south-1 (account 378240665051); buckets `solarlayout-{local,dev,prod}-projects`
- V2 envelope `{success, data | error}`
- V2ErrorCode union (locked exhaustive)
- Multi-tab metadata-only model; ONE project's state in memory at a time
- HMR doesn't restart Python sidecar; full Tauri restart for sidecar code changes
- Tauri 2 webview suppresses `window.prompt` (lesson from S2-02)

## Pre-demo state

Just before this compact: cleaned up PRO_PLUS via direct B14 curl loop.
Final state: PRO_PLUS user has only the B7 fixture project (preserved
per Session 2 guardrails — fixture-session sweep depends on its
stable IDs `prj_b7fixturePROPLUS…` / `run_b7fixturePROPLUS…`).

If user is back on the app post-compact, the running TanStack Query
cache may show stale projects until `useProjectsListQuery`'s 30s
staleTime expires or they trigger a refresh. Cmd+R or click
"Projects" tab away/back to force a re-mount.

**Demo flow recipe** (showcases SP1+SP3+SP4+SP6 in one continuous pass):

1. Open Recents → only B7 fixture visible
2. Click `+ New project` → pick `phaseboundary2.kmz` → canvas + inspector load
3. Click "Projects" tab → **card shows boundary outline** (SP6, zero runs)
4. Open the project, click Generate → run lands + thumbnail uploads in background
5. Click "Projects" tab → **card now shows real layout thumbnail** (SP4)
6. Open the project → Inspector Runs tab → **gallery card also shows thumbnail** (SP1)
7. Right-click open tab → ContextMenu → Rename / Delete (SP3)
8. Hover Recents card → ⋯ menu → same Rename / Delete (SP3)

## What's likely next

User is going to demo to Prasanta. Most likely follow-ups post-demo:
- More UI polish requests from Prasanta's feedback (similar cadence to today's TopBar/scale-bar/footer fixes)
- Possibly start SP2 (in-place run-switch loading feedback — T1, desktop-only, touches `RunsList` + `App.tsx` StatusBar leftMeta per the SP2 row)
- Eventually a Session 3 smoke pass: S2-01 calc-pill MULTI revisit + tier-switching across 8 keys + S1 regression sweep

## Test totals

- 363 desktop + 36 ui + 176 entitlements-client = 575 across 3 TS packages
- 123 sidecar passed + 6 skipped (Python pytest)
- All four gates green every commit

## Active artifacts (re-read as needed)

- [docs/PLAN.md](docs/PLAN.md) — active backlog. Phase 6 mostly closed. Read header status + Phase 6 rows.
- [docs/post-parity/SMOKE-LOG.md](docs/post-parity/SMOKE-LOG.md) — Session 1 + Session 2 both closed. Session 2 final closeout block has the row-outcomes table + carry-forward list for Session 3.
- [docs/post-parity/findings/2026-04-30-001-run-thumbnail-pipeline.md](docs/post-parity/findings/2026-04-30-001-run-thumbnail-pipeline.md) — SP1 design memo v3 (locked, ~580 lines).
- `apps/desktop/src/recents/RecentsView.tsx` — ProjectCardThumbnail + BoundarySvg + ⋯ menu + dialogs.
- `apps/desktop/src/runs/RunsList.tsx` — RunThumbnail.
- `apps/desktop/src/auth/useGenerateLayout.ts` — Stage 4 best-effort thumbnail upload chain.
- `python/pvlayout_engine/pvlayout_engine/thumbnail.py` — SP1 sidecar renderer.
- `packages/entitlements-client/src/types-v2.ts` — schema mirrors for B23/B24/B25/B26.

## Process discipline reminders

- Backlog-driven per CLAUDE.md §2 — pick top `todo` row; flip to `done` on Acceptance.
- Tiered process per row (T1 / T2 / T3) — don't lighten or heavyen mid-row.
- Scope-tight; don't add features beyond row notes (working-style memo).
- Push after every commit; backend session pulls to read.
- HMR limitation — patches touching sidecar Python or `@tauri-apps/api/event` listeners need full Tauri dev restart.
- Bite-sized verification chunks during smoke — one check per prompt, wait for response.
- Preview-mode license keys exist; production keys start with `sl_live_`.
- Velocity mode (today's pattern): on-the-fly live testing replaces formal smoke sessions; SP-row close-outs still go through PLAN.md + SMOKE-LOG.

## Standing by

Most likely first move post-compact: relay user's report from the
Prasanta demo (positive feedback or polish requests). Treat any
new polish as a small `fix:` or `feat:` commit on this branch
unless it warrants a new PLAN.md row. If a polish item touches
something locked (SP1 memo decisions, SP3 5-surface design, etc.),
surface that before changing.

--- END PROMPT ---
