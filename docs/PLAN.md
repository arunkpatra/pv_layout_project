# pv_layout_project — Post-Parity Plan

**Mission:** ship the new SolarLayout desktop app for PVLayout — full functional coverage of legacy PyQt5 capabilities + project/run/multi-tab architecture + V2 backend integration. Match Claude-Desktop quality bar throughout.
**Last updated:** 2026-04-30
**Status:** 8 / 52 done. (53 total rows; X5 telemetry deferred.)

This file replaces the parity-era `docs/PLAN.md` (closed 12/12 done on 2026-04-29; archived at [docs/historical/PLAN-parity-v1.md](./historical/PLAN-parity-v1.md)).

---

## Context (locked decisions — do not relitigate)

- **Cloud-first.** No internet → no app. Project state in Postgres + blob storage; local KMZ cache as input asset only.
- **API caller is the Tauri Rust shell.** Existing `/session` push pattern extends — Rust fetches `/v2/entitlements` at startup, pushes to React (UI gating) + sidecar (compute gating). One source of truth, two consumers.
- **PVLayout is commercially standalone.** No multi-product shell, no product-switcher UI, no namespaced feature keys. PVLayout is *the* app.
- **Project = site.** Each project = one KMZ + edits + N runs. No legacy StartupDialog. New tab → recents view OR new-project KMZ picker.
- **Run = persisted artifact.** Each "Generate Layout" = 1 calc-debit + 1 Run row. Compare = split-view of 2 runs in same project.
- **PAYG-only commercial surface.** Free / Basic ($1.99/5) / Pro ($4.99/10) / Pro Plus ($14.99/50). Tier-gated features computed as `availableFeatures` union across active+remaining entitlements.
- **Concurrent project quotas per tier.** Effective quota = max across active+non-exhausted entitlements. Over-quota projects become read-only when ceiling drops.
- **V2 backend is a hard dependency.** Most rows here consume V2 endpoints from the `renewable_energy` repo. Active backend plan: [`renewable_energy/docs/initiatives/post-parity-v2-backend-plan.md`](file:///Users/arunkpatra/codebase/renewable_energy/docs/initiatives/post-parity-v2-backend-plan.md), executed in a dedicated Claude Code session on that repo (branch `post-parity-v2-backend`). The earlier draft at [`docs/post-parity/PLAN-backend.md`](./post-parity/PLAN-backend.md) is **superseded** but kept as scoping-history reference. Sequencing: backend rows that a desktop row depends on must be `done` first. Marked in the `Depends` column.
- **Auth scheme is `sl_live_*` license-key bearer**, not Clerk JWT. Format locked since mvp-spike6 in `renewable_energy`. Stored in OS keychain by Tauri Rust shell; sent as `Authorization: Bearer sl_live_...` on every backend call. Validated by existing `licenseKeyAuth` middleware on the backend.
- **Blob storage = AWS S3** (`ap-south-1`, account `378240665051`, IAM user `renewable-energy-app`). Pre-signed PUT URLs are minted by V2 backend rows B6/B7; desktop's Rust shell does the actual upload. Existing presigned-GET pattern at `renewable_energy/apps/mvp_api/src/lib/s3.ts` is the template. Vercel Blob and Cloudflare R2 are **not** under consideration.
- **Legacy retirement** = "new app + backend working end-to-end." Not 100% line-by-line parity on every legacy decision. Bugs in legacy don't replicate.

---

## Tier policy

- **T1 — build + test.** Implement → run sidecar/desktop tests → commit. Audit trail = green tests.
- **T2 — build + integration test.** T1 plus an integration test exercising desktop ↔ sidecar ↔ backend (or desktop ↔ V2 backend directly for Rust-shell rows).
- **T3 — build + decision memo.** T1 plus a short memo at `docs/post-parity/findings/YYYY-MM-DD-NNN-<slug>.md` for solar-domain decisions or non-obvious architectural calls. Per Prasanta's directive, free hand on solar-domain calls supported by industry standards — document the decision + cite source.

Atomic commit per row: `feat: <feature name>`. Intra-row checkpoints use `wip: <summary>`.

---

## Backlog

Phase-grouped; within a phase, dependency-ordered. `Depends` column references rows in this plan or the backend plan (`B<n>`).

### Phase 1 — Foundation (backend integration + state primitives)

| # | Feature | Tier | Source / Notes | Depends | Acceptance | Status |
|---|---|---|---|---|---|---|
| F1 | Sign-in flow (license key entry, OS-keychain storage) | T2 | Implementation pre-existed from parity-era S7: Rust `keyring` crate (`apps/desktop/src-tauri/src/keyring.rs`) with three Tauri commands (`get_license`, `save_license`, `clear_license`); TS wrapper `apps/desktop/src/auth/licenseKey.ts` with preview-mode fallback; `apps/desktop/src/dialogs/LicenseKeyDialog.tsx` (first-launch + change modes); state machine in `App.tsx`. F1 row delivered the missing **test coverage**: `licenseKey.test.ts` (preview + Tauri-mocked roundtrip, 11 cases) + `LicenseKeyDialog.test.tsx` (RTL render/validation/submit/error, 9 cases). License key is the *only* auth artifact — no Clerk on the desktop. **V1 swap note:** verification currently calls V1 `/entitlements`; F2 swaps to `/v2/entitlements` when backend B8 lands. | — | Key stored in keychain; restart → key recovered (verified live in S7 Human Gate); invalid key shows clear error (V1 today; V2 in F2). All 20 new test cases green. | **done** |
| F2 | V2 entitlements client | T2 | Implemented as a TS-extension of `@solarlayout/entitlements-client` (not a separate Rust crate — the existing Tauri-fetch transport satisfies the "single fetcher distributes to React + sidecar" intent of the locked decision). Mirrors `EntitlementSummaryV2`, `V2ApiEnvelope<T>`, `V2ErrorCode` from `renewable_energy/packages/shared` into a new `types-v2.ts`. New `client.getEntitlementsV2(key)` hits `GET /v2/entitlements`, parses the V2 success envelope, and throws an `EntitlementsError` with typed `code` on V2-shaped errors (V1 fallback for legacy paths). `EntitlementsError` extended with optional `code: V2ErrorCode`. `useEntitlementsQuery` now dispatches to V2; preview entitlements (Basic/Pro/Pro Plus) extended with the V2 quota fields per the locked Free=3/Basic=5/Pro=10/Pro Plus=15 decision. `EntitlementsProvider` context type bumped to `EntitlementSummaryV2` (V1 consumers stay sub-type-compatible). Sidecar push (`useSyncEntitlementsToSidecar`) consumes the V2 type unchanged in shape. | F1, B8 | `getEntitlementsV2` covered by 11 cases (envelope happy path, V2 error code mapping for UNAUTHORIZED + PAYMENT_REQUIRED, V1 error fallback, schema-validation guard, network 0-status, base-URL routing, bearer-auth header). V2 type schemas covered by 15 cases. `useEntitlementsQuery` regression: dispatches to V2 not V1; preview keys still hit cached preview entitlements. Total 208 tests across all packages green. | **done** |
| F3 | Idempotency-key helper + retry policy for usage/report | T1 | Implemented as a TS-extension layered on the F2 V2 client surface (matches the F5 architecture call — caller is the existing Tauri-fetch transport, not a separate Rust crate). Three pieces: (a) `entitlements-client.reportUsageV2(licenseKey, feature, idempotencyKey)` with V2 envelope unwrap + V2 error code mapping; (b) `apps/desktop/src/auth/idempotency.ts` exporting `generateIdempotencyKey()` (UUID v4 via `crypto.randomUUID()`), `isTransientError()` (network 0 + 409 CONFLICT + 5xx → retry; 401 / 402 / 400 / 404 / non-EntitlementsError → fail fast), and `withIdempotentRetry()` (max-attempts + exponential-backoff caps + injectable sleep); (c) `useReportUsageMutation(licenseKey, client, opts?)` hook that generates one fresh key per `mutate()`, threads the SAME key through every retry, and hydrates the entitlements query cache with refreshed `availableFeatures` + `remainingCalculations` on success (saves a /v2/entitlements round-trip per debit). Preview-license-key short-circuit decrements cached preview entitlements without hitting the network. | F2, B9 | Network blip during /v2/usage/report doesn't double-debit (covered by 9 hook tests + 17 idempotency-helper tests + 8 client-method tests). Same idempotencyKey threaded across retries; permanent errors fail fast; preview keys never hit the network. Total 34 new test cases green; 242 total tests across all packages. | **done** |
| F4 | Project + Run state in Zustand | T1 | Slice at `apps/desktop/src/state/project.ts` per ADR-0003. Holds `currentProject`, `runs[]`, `selectedRunId`. Plus `useProjectQuery` (TanStack Query) for server state. Project IDs use semantic-ID prefix `prj_`, Runs use `run_` (minted server-side; client treats as opaque strings). | — | State sliced cleanly; cross-component consumers work; type-safe. | **done** |
| F5 | V2 backend HTTP client foundation | T2 | **Architecture call (locked across F2/F3/F6):** TS-extension of `@solarlayout/entitlements-client` rather than a separate Rust crate. Tauri's `@tauri-apps/plugin-http` fetch delegates to native Rust HTTP under the hood — no CORS preflight, no browser limitations, full streaming for the 50MB blob ceiling — so the "single fetcher distributes to React + sidecar" intent of the locked design is satisfied without a parallel Rust client. F5's foundation: V2 wire-shape mirrors (`types-v2.ts`), V2 envelope unwrap + error parser (extends V1 fallback), `EntitlementsError.code: V2ErrorCode` for type-safe error branching, idempotency helpers (UUID v4 + transient-retry), S3 PUT helper with status-code-mapped errors. **Scope clarification:** F5's original "all B10–B18 endpoints" framing was too broad — V2 method additions accumulate row-by-row as their P-row consumers need them (F2 → B8; F3 → B9; F6 → B6+B7; subsequent P-rows → B10/B11/B12/B13/B14/B15/B16/B17/B18). The foundation is shipped; per-endpoint accretion is normal cadence. | F2 | V2 envelope handling validated by 18 schema-validation cases (`types-v2.test.ts`) + 35 client-method cases across B6/B7/B8/B9 (`client.test.ts`). Idempotency + retry policy validated by 17 cases (`idempotency.test.ts`). S3 upload helper validated by 17 cases (`s3upload.test.ts`). Total V2-client foundation surface: 87 tests green; 268 across the repo. | **done** |
| F6 | Blob upload helper (AWS S3) | T2 | Implemented as TS-extension (same architecture call as F2/F3 — `tauri-plugin-http` fetch delegates to native Rust HTTP under the hood, no Cargo changes, no CORS). Three pieces: (a) `entitlements-client.getKmzUploadUrl(licenseKey, sha256, size)` for B6 + `getRunResultUploadUrl(licenseKey, {type, projectId, runId, size})` for B7 with V2 envelope unwrap + V2 error code mapping (incl. NOT_FOUND for B7's ownership rule); (b) `apps/desktop/src/auth/s3upload.ts` with `putToS3()` (status-code mapping per the backend's S3 error matrix: 403 → EXPIRED_URL → re-request; 400/412 → CONTENT_MISMATCH → retry; 5xx → TRANSIENT → retry; throw → NETWORK), plus `sha256Hex()` (Web Crypto Subtle) and `S3UploadError` typed by `kind`; (c) end-to-end orchestrators `uploadKmzToS3({client, licenseKey, bytes})` and `uploadRunResultToS3({client, licenseKey, type, projectId, runId, bytes})` that hash → mint → PUT and return the `blobUrl` + `kmzSha256` ready for B11 / per-type B7 follow-ups. **Two deferrals captured in F6:** (1) granular upload-progress events via Tauri are deferred to a follow-up polish row (50MB max → ~8s on broadband, spinner is sufficient at v1); (2) end-to-end runtime verification against real `mvp_api` + S3 buckets folds into the P1 fixture-running session already agreed with the backend session. | F5, B6, B7 | All static-verifiable contract surfaces covered by 26 new test cases (9 client-method tests for B6/B7 — envelope happy path, 400/404/503 + schema guard; 17 helper tests — sha256 sanity, putToS3 status-code matrix, uploadKmz/uploadRunResult orchestrators incl. error propagation through both stages, Blob + Uint8Array inputs, per-type Content-Type for DXF/PDF/KMZ exports). 268 total tests across packages green. End-to-end runtime verification deferred to P1 fixture session. | **done** (with two deferrals noted) |

### Phase 2 — App shell (chrome, navigation, multi-tab)

| # | Feature | Tier | Source / Notes | Depends | Acceptance | Status |
|---|---|---|---|---|---|---|
| S1 | Window chrome (Claude-Desktop-style header) | T1 | Implementation pre-existed from parity-era: `packages/ui/src/compositions/TopBar.tsx` (wordmark + breadcrumb + chip + Cmd+K palette + ToolRail/Inspector toggles + account dropdown), with macOS overlay-titlebar inset (80px for traffic lights), `data-tauri-drag-region` on draggable surfaces, full token-driven theming. Tauri config (`tauri.conf.json`) sets `titleBarStyle: "Overlay"` + `hiddenTitle: true`. S1 row delivered the missing **test coverage**: `packages/ui/src/compositions/TopBar.test.tsx` (RTL, 14 cases — wordmark, breadcrumb, chip, palette, toggles, account dropdown contents + handlers, drag-region attribute). | — | Visual match to reference screenshots at `reference_screenshots_for_UX_dsktop/` (already verified during parity design review); all 14 component-contract tests green. | **done** |
| S2 | Multi-tab top bar | T2 | Each tab = one project. New-tab button. Tab close (with unsaved-changes warning). Cmd-T / Cmd-W shortcuts. Single-project-per-tab enforcement (cannot open same project in two tabs). | F4 | Tabs scrollable; tab switch loads correct project state; single-tab-per-project enforced. | todo |
| S3 | Recents view (default startup screen) | T2 | New-tab default content. Grid of recent projects (thumbnail + name + last-modified). Click → opens project. "+ New project" tile. Empty state for new users. | F5, B10 | Recents fetched from backend; click opens project in current tab; visual quality matches reference screenshots. | todo |
| S4 | Account menu (license, sign-out, quota indicator) | T1 | Top-right menu. Shows masked license key, plan summary (calcs/projects remaining), sign-out button. Click "Buy more" → opens marketing site checkout in browser. | F2 | Menu visible; quota numbers accurate; sign-out clears keychain + reloads to F1 sign-in. | todo |

### Phase 3 — Project lifecycle (CRUD, runs, compare)

| # | Feature | Tier | Source / Notes | Depends | Acceptance | Status |
|---|---|---|---|---|---|---|
| P1 | New-project flow (KMZ picker → upload → create) | T2 | First B11 consumer per F5's per-endpoint accretion. Three-piece wiring: (a) `entitlements-client.createProjectV2(key, body)` — POST `/v2/projects`, V2 envelope unwrap + V2 error code mapping (incl. PAYMENT_REQUIRED for quota); new `projectV2WireSchema` + `createProjectV2RequestSchema` mirror the backend's `ProjectWire` / `CreateProjectSchema` exactly (200-char `name`, 64-char-hex `kmzSha256`, opaque `edits`). `PersistedProject` is now a type-alias of `ProjectV2Wire` so the slice stores the wire row verbatim — no adapter, drift impossible. (b) `apps/desktop/src/auth/useCreateProject.ts` — TanStack Query mutation chaining `uploadKmzToS3` (B6 mint + S3 PUT) → `createProjectV2` (B11) in a single user-facing intent. Single-attempt (B11 has no idempotency key — a duplicate create would burn an extra quota slot). On success: invalidate `["entitlements", key]` so `projectsActive`/`projectsRemaining` refresh. On 402: error propagates with `code: "PAYMENT_REQUIRED"` populated, cache stays untouched. Preview-license-key short-circuit synthesises a `prj_*` ID and decrements cached preview projectsRemaining (mirrors the F3 hook pattern). (c) App.tsx wiring: `openAndParseKmz` extended to return raw `bytes` alongside `parsed` so the upload step doesn't re-read the file. After the mutation succeeds, `setCurrentProject(persisted)` AND `setProject(...)` (parity-era slice) — order is "B11 first, then canvas" so a 402 leaves the canvas in its prior state (no half-loaded ghost project). 402 swaps the generic error overlay for a new `UpsellOverlay` showing the backend's quota detail string ("Project quota exhausted (3/3). …"). Project name auto-derived from KMZ filename (extension stripped); user-controlled rename lands later in P3/P4. **Locked decision:** `projectV2WireSchema.edits` uses `z.unknown()` (Zod-quirk: marks the property optional in inferred TS); `PersistedProject` mirrors via `type alias = ProjectV2Wire` to keep the wire-shape parity strict. **Deferral:** end-to-end runtime against real `mvp_api` + S3 buckets folds into the manual fixture session already agreed with the backend — drives all 8 fixture license keys including the QUOTA_EDGE 402 path. | F6, B11, B6 | All static-verifiable contracts covered: 12 new schema tests (`projectV2WireSchema` + `createProjectV2RequestSchema` + envelope guard) + 7 new client-method tests (happy path + edits passthrough + Bearer + 401/402/400 V2 envelope mapping + schema guard) + 9 new hook tests (orchestration, cache invalidation, name passthrough, 402 → no invalidation, S3UploadError propagation, null-key guard, preview short-circuit + decrement). Total 297 tests across 3 packages green (82 entitlements-client + 28 ui + 187 desktop). All four gates green. End-to-end runtime verification rolls into the P1 fixture session. | **done** |
| P2 | Open-existing-project | T1 | Recents click or Cmd-O → opens project. Loads project state from B12; KMZ cached locally; runs[] populated. | F5, B12 | Project loads in <2s for typical KMZ; subsequent opens use local cache. | todo |
| P3 | Project header (name edit, delete, archive) | T1 | Top of project view. Inline-rename. Delete with confirm modal. | F5, B13, B14 | Rename persists; delete removes from recents + frees quota. | todo |
| P4 | Auto-save edits (debounced) | T2 | User edits (drawn obstructions, ICR overrides, etc.) auto-save to backend after 2s of idle. Visible save indicator. | F5, B13 | Edits persist across reload; save indicator accurate; failure surfaces toast. | todo |
| P5 | Runs list view (gallery + list toggle) | T2 | Inside project, "Runs" tab. Grid of run thumbnails by default; list-view toggle for density. Each tile: thumb + design type + design mode + key metrics + timestamp. Multi-select checkboxes. | F4, B15 | Runs render; toggle works; selection state persists across tab switches. | todo |
| P6 | Run creation flow ("Generate Layout" button) | T2 | Click → Rust shell generates idempotencyKey → POST /v2/projects/:id/runs (B16) which atomically debits + creates run → sidecar runs `/layout` against the project KMZ + params → result uploaded to blob → run row updated. | F3, F6, B16, B7 | One click = 1 calc debit + 1 run created; failure modes handled (402, sidecar error, blob upload error). | todo |
| P7 | Run detail view (single run on canvas) | T1 | Click a run in list → loads onto canvas. Becomes "active run." | C1, F4 | Click loads run blob from B17; renders within 2s; active-run indicator visible in list. | todo |
| P8 | Compare-2-runs view | T2 | Select 2 runs → "Compare" button enables → split-canvas (synced pan/zoom by default; decouple toggle) + delta table. Cap at 2 runs. | P7, R1 | Two runs render side-by-side; delta table shows all key metrics with color-coded deltas. | todo |
| P9 | Delete run (soft-delete) | T1 | Right-click on run / select + Delete button → confirm modal → B18. | B18 | Run hidden from list; calc count unchanged. | todo |
| P10 | Quota indicator + upsell banner | T1 | Persistent banner / chip showing "X calcs remaining, Y projects remaining." Click → marketing site upgrade page. | F2 | Numbers accurate; banner appears in account menu + project header. | todo |

### Phase 4 — Legacy GUI parity (the big bucket)

Reference: [`docs/post-parity/discovery/2026-04-29-001-legacy-app-capability-audit.md`](./post-parity/discovery/2026-04-29-001-legacy-app-capability-audit.md). Each row in this phase ports a legacy capability into the new project/run model.

> **Phase 4 scope reality:** most rows here have parity-era React components already shipping (`MapCanvas`, `SummaryPanel`, `LayoutPanel`, `VisibilitySection`, drawing toolbar, dialogs). They currently wire to the parity-era `useProjectStore.project` shape. **Per-row scope is therefore: (a) wire to the post-parity `currentProject` / `runs[selectedRunId]` model from F4, (b) add post-parity test coverage where missing, (c) verify acceptance against the new state.** Genuine net-new builds in this phase: **D1–D7** drawing tools (partial scaffolding only), **L1** analysis overlay, **C8** click-selection inspector. The `Source / Notes` for each row reads as "build this"; expect the real diff to be smaller than the prose suggests once we get here.

#### Input panel (left side)

| # | Feature | Tier | Source / Notes | Depends | Acceptance | Status |
|---|---|---|---|---|---|---|
| G1 | Left panel scaffold | T1 | Collapsible sidebar; scrollable; sectioned (Project / Module / Inverter / Layout / Energy). Token-driven theming. | — | Sidebar collapses; sections expand/collapse; visual match to reference screenshots. | todo |
| G2 | Project parameters form | T2 | Maps to legacy `InputPanel.py` Project section: panel size, GCR, modules-per-row, row-spacing, etc. react-hook-form + zod. Auto-saves via P4. | G1, P4 | Parity test: same params → same `LayoutParameters` body to /layout endpoint. | todo |
| G3 | Module spec input (manual + PAN file load) | T2 | Manual fields + PAN file upload (parsed by sidecar). | G1, G2 | Manual entry + PAN load both produce same downstream behavior; parity test. | todo |
| G4 | Inverter spec input (string vs central + OND load) | T2 | DesignMode toggle (String / Central). OND file load. Affects which fields are visible. | G1, G2 | Toggle shows/hides correct fields; OND load populates inverter specs. | todo |
| G5 | Energy yield params (PVGIS / file toggle) | T2 | Irradiance source toggle. PVGIS file upload (parsed sidecar-side). Visible only at Pro Plus tier. | G1, F2 | Toggle works; PVGIS file load populates GHI series; tier-gated correctly. | todo |

#### Right canvas

| # | Feature | Tier | Source / Notes | Depends | Acceptance | Status |
|---|---|---|---|---|---|---|
| C1 | MapLibre canvas + project-CRS handling | T2 | MapLibre GL setup; project-local Cartesian CRS (legacy uses pyproj UTM-equivalent). Camera fit-to-bounds. | — | Canvas renders empty; pan/zoom smooth at 60fps; CRS conversions correct. | todo |
| C2 | Boundary layer | T1 | Renders parsed KMZ boundaries as polygon overlays. Style per boundary type (plant / water / canal / TL). | C1 | Boundaries render correctly for phaseboundary2 reference KMZ; legend visible. | todo |
| C3 | Tables / panels layer (deck.gl) | T2 | Renders placed PV tables from layout result. GPU-accelerated. Hover → show table id + capacity. | C1, P7 | 10,000+ tables render at 60fps; hover info accurate. | todo |
| C4 | ICR / inverter / LA layer | T1 | Renders ICRs (rectangles), inverters (markers), LAs (markers). Distinct icons + colors. | C1, P7 | All three render correctly; reference plant matches legacy visually. | todo |
| C5 | Cable layer (DC + AC) | T1 | Renders DC cable trees + AC cable network. Toggle visibility per cable type. | C1, P7 | Cable layout matches legacy DXF output; visibility toggles work. | todo |
| C6 | Obstruction / water-body layer | T1 | Renders user-drawn obstructions + auto-detected water bodies. Distinct styles. | C1, P7 | Layers render; visibility toggles work. | todo |
| C7 | Layer visibility panel | T1 | Right-side or top-bar control to toggle each layer (boundaries, tables, cables, ICRs, LAs, obstructions, water). Persistent across project switches. | C2-C6 | All toggles work; state persists in project edits (P4). | todo |
| C8 | Click selection + info panel | T2 | Click on table / ICR / cable → highlight + show details in side panel. | C3, C4, C5 | Click selects; info panel shows correct stats; deselect on empty-canvas click. | todo |

#### Drawing & editing tools

| # | Feature | Tier | Source / Notes | Depends | Acceptance | Status |
|---|---|---|---|---|---|---|
| D1 | Rectangle obstruction draw tool | T2 | Tool palette → "Rectangle" → click-drag on canvas → stored in project edits (P4). | C1, P4 | Drawn rect persists; visible after reload. | todo |
| D2 | Polygon obstruction draw tool | T2 | Tool palette → "Polygon" → click each vertex, double-click to close. | C1, P4 | Polygon persists; works for arbitrary vertex count. | todo |
| D3 | ICR drag-and-drop reposition | T2 | Cursor on ICR → drag → updates run params; persists as override on the project. | C4, P4 | Drag updates ICR position; persists; affects re-runs. | todo |
| D4 | Undo / redo stack | T2 | Cmd-Z / Cmd-Shift-Z. Stack tracks edits (draw, delete, ICR drag). Per-project stack. | D1-D3, P4 | 10 actions undo cleanly; cross-tab stacks isolated. | todo |
| D5 | Water-body draw tool | T2 | Same as D2 but tagged as water (different style + downstream behavior). | C1, P4 | Water polygon persists with correct exclusion semantics. | todo |
| D6 | Manual road editing | T2 | Line draw tool for roads. Affects layout engine via `roads` input. | C1, P4 | Drawn road excluded from panel placement. | todo |
| D7 | Clear-all / delete-selected | T1 | Right-click obstruction → Delete. "Clear all obstructions" button. Undo-able. | D1-D6, D4 | Delete works; clear-all works; both undo-able. | todo |

#### Summary tables & charts

| # | Feature | Tier | Source / Notes | Depends | Acceptance | Status |
|---|---|---|---|---|---|---|
| R1 | Summary table (capacity / counts) | T1 | Bottom or side panel: capacity (MWp), table count, ICR count, panel count, area. Per active run. | P7 | Numbers match legacy summary table exactly. | todo |
| R2 | Energy yield monthly table | T2 | IEC 61724-1 breakdown. Visible at Pro Plus tier only. | P7, F2 | Numbers match legacy monthly breakdown bit-exact (parity test against legacy). | todo |
| R3 | Energy time-series chart | T2 | Year-day slider + crosshair. Hourly / 15-min granularity per legacy. Pro Plus only. | R2 | Chart matches legacy visually; slider + crosshair behave identically. | todo |

#### Long-running ops

| # | Feature | Tier | Source / Notes | Depends | Acceptance | Status |
|---|---|---|---|---|---|---|
| L1 | Analysis overlay during /layout + /generate-energy | T2 | Modal overlay with two-phase progress (legacy `AnalysisOverlay` pattern). Cancel button. | P6 | Overlay appears; phases progress visibly; cancel aborts cleanly. | todo |

#### Modal dialogs (legacy parity)

| # | Feature | Tier | Source / Notes | Depends | Acceptance | Status |
|---|---|---|---|---|---|---|
| M1 | Help / KMZ-help / About dialogs | T1 | Three small dialogs. Help index, KMZ-format reference, About (version + license). | — | Dialogs accessible from menu; content matches legacy where applicable. | todo |
| M2 | Validation + warning dialogs | T1 | BoundaryValidation, CableWarning, GHIFormatReminder. Triggered by sidecar response codes. | F5 | Each dialog triggers correctly; messages match legacy. | todo |

#### Exports

| # | Feature | Tier | Source / Notes | Depends | Acceptance | Status |
|---|---|---|---|---|---|---|
| E1 | Export buttons (DXF / PDF / KMZ) | T1 | Toolbar buttons → call sidecar `/export-*` (already wired in parity sweep) → save file via Tauri save dialog. | P7 | All three exports produce valid files matching parity-tested output. | todo |
| E2 | 15-min CSV export | T1 | Energy time-series export. Pro Plus only. | R3, F2 | CSV matches legacy format. | todo |

### Phase 5 — Polish & meta

| # | Feature | Tier | Source / Notes | Depends | Acceptance | Status |
|---|---|---|---|---|---|---|
| X1 | Settings dialog | T1 | Preferences: units, default theme, default design type, etc. Persisted in project edits or global app prefs. | — | Settings persist across restart; affect downstream behavior. | todo |
| X2 | Dark theme parity polish | T2 | Walk every component; verify token coverage; visual review against `reference_screenshots_for_UX_dsktop/dark_theme/`. | All visual rows | Dark theme matches reference screenshots; no hardcoded colors leak through. | todo |
| X3 | Auto-update + version check | T1 | Tauri updater; check on launch; user prompt to update. | — | Update flow works on macOS + Windows + Linux. | todo |
| X4 | Crash reporting (Sentry or similar) | T1 | Tauri crash handler; opt-in (consent on first launch). | — | Crashes report to backend; PII scrubbed; opt-out works. | todo |
| X5 | Telemetry events | deferred | Depends on backend B22; deferred until app has events worth reporting. | B22 | — | **deferred** |

---

## Process per row

1. Pick the top `todo` row whose `Depends` are all `done`.
2. Read `Source / Notes`; read adjacent rows in the same phase for context.
3. Apply the row's tier ceremony.
4. Flip `Status` to `done` when `Acceptance` is met.
5. Atomic commit per row: `feat: <feature name>`. Intra-row checkpoints use `wip:`.

---

## Out of scope (deferred to post-launch)

- **Multi-tenancy / project sharing.** Single-user v1.
- **N-way run comparison / parameter sweep.** v1 caps compare at 2 runs.
- **Project export/import (`.slproject` file).** Defer until customer asks.
- **In-app billing UI (purchase pack from inside app).** v1 redirects to marketing-site checkout.
- **Mobile / web client.** Desktop-only v1.
- **Third-party integrations** (CAD plugins, project-management tools, etc.).
- **Telemetry events surface.** Backend B22 first; then this row.
- **The 18 end-of-port review items from [`docs/parity/findings/2026-04-29-end-of-port-review-for-prasanta.md`](./parity/findings/2026-04-29-end-of-port-review-for-prasanta.md).** Per Prasanta's directive, free hand on solar-domain calls; 16 of 18 we answer inline, 2 (1.2× factor empirical basis, real-customer SAT plant fixtures) need Prasanta input. Surface to him in the same pass; not a blocker for any row here.

---

## Decisions log

Resolved questions captured during scoping. Each item: locked decision + rationale.

- **2026-04-29 — Project quota numbers per tier.** Free=3, Basic=5, Pro=10, Pro Plus=15, **concurrent** (delete to free a slot). Effective quota = max across active+non-exhausted entitlements. Prasanta is fine with the gaming pattern (export → delete → start new) — it's a natural escape valve at the broad-market price band.
- **2026-04-29 — Auto-save vs explicit save.** Auto-save with 2s debounce. `PATCH /v2/projects/:id` (B13) is the target. Visible save indicator on the project header. Server-side rate limiting deferred — client debounce is the v1 protection.
- **2026-04-29 — Free tier project quota: 3.** Same as the broad-market column above. Lets a new user run multiple full workflows before friction.
- **2026-04-29 — Identity model.** Shared SolarLayout user account (Users + entitlements with `productId` namespacing on the backend), but only PVLayout consumes it now. Future products will be commercially standalone — same auth, separate `productId`-keyed entitlements.

---

## See also

- **Active backend plan** (separate session, `renewable_energy` repo): [`renewable_energy/docs/initiatives/post-parity-v2-backend-plan.md`](file:///Users/arunkpatra/codebase/renewable_energy/docs/initiatives/post-parity-v2-backend-plan.md) — branch `post-parity-v2-backend`.
- [`docs/post-parity/PLAN-backend.md`](./post-parity/PLAN-backend.md) — earlier backend plan draft, **superseded** by the active plan above. Kept as scoping-history reference.
- [`docs/post-parity/SESSION-KICKOFF-renewable-energy.md`](./post-parity/SESSION-KICKOFF-renewable-energy.md) — handoff prompt used to start the backend session.
- Discovery audits in [`docs/post-parity/discovery/`](./post-parity/discovery/):
  - `2026-04-29-001-legacy-app-capability-audit.md` — legacy capability inventory (Phase 4 input).
  - `2026-04-29-002-backend-api-contract-audit.md` — earlier V1 backend audit (superseded by 004).
  - `2026-04-29-003-renewable-energy-infra-audit.md` — AWS / S3 / IAM / Vercel / .env reality check.
  - `2026-04-29-004-renewable-energy-codebase-audit.md` — endpoint inventory + schema + auth flows.
  - `2026-04-29-005-renewable-energy-planning-audit.md` — existing initiatives + V2 conflict analysis.
- [`docs/parity/findings/2026-04-29-end-of-port-review-for-prasanta.md`](./parity/findings/2026-04-29-end-of-port-review-for-prasanta.md) — 18-item solar-domain review (Phase 4 inputs).
- [`docs/historical/PLAN-parity-v1.md`](./historical/PLAN-parity-v1.md) — archived parity sweep table (12/12 done).

---

## Changelog

- **2026-04-29 v1.2** — Plan-status review: counter `TBD` → `52` (53 rows, X5 deferred). Added Phase 4 scope-reality note flagging that most rows have parity-era components already shipping; per-row scope is rewire + tests + acceptance verification, not from-scratch UI builds.
- **2026-04-29 v1.1** — Promoted to `docs/PLAN.md`; old parity table archived to `docs/historical/PLAN-parity-v1.md`. Folded in audit-flagged corrections: F1 license-key-bearer auth (not Clerk), F4 semantic-ID prefix note, F6 AWS S3 (not Vercel Blob). Resolved Open Questions into Decisions log. Path references updated for new location.
- **2026-04-29 v1.0** — Initial scoping at `docs/post-parity/PLAN.md`. Consolidates decisions from 2026-04-29 brainstorm session + legacy capability audit + backend contract audit.
