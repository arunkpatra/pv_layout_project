# PRD — Cable-Compute Strategy: Local Wins + Cloud Offload

**Status:** Draft, ready for spike creation
**Date:** 2026-05-01
**Author:** Claude (under Arun's direction)
**Scope:** Two-phase strategy to eliminate the multi-plot cable-calc UX failure mode and to put compute on a sustainable architectural footing for low-end clients + future mobile.
**Branch context:** POC implementation already on `perf/cable-multiplot-poc` (off `post-parity-v1-desktop`).
**Cross-repo partner:** `renewable_energy` (backend session). Their feasibility audit at [renewable_energy/docs/initiatives/2026-05-01-cable-compute-offload-feasibility.md](file:///Users/arunkpatra/codebase/renewable_energy/docs/initiatives/2026-05-01-cable-compute-offload-feasibility.md).

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Industry-Correctness Baseline (non-negotiable)](#2-industry-correctness-baseline-non-negotiable)
   - 2.1 BoM correctness
   - 2.2 EPC labelling — "AC cable trench"
   - 2.3 Geometry & layer fidelity
   - 2.4 Cross-engine consistency (Spike 2)
   - 2.5 Auth-boundary state hygiene (license-key swap) — added 2026-05-01
3. [Spike 1 — Local Perf Wins + UX Hygiene + Relabel (week 1)](#3-spike-1--local-perf-wins--ux-hygiene--relabel-week-1)
4. [Spike 2 — Cloud Offload Framework (weeks 2–6)](#4-spike-2--cloud-offload-framework-weeks-26)
5. [Cross-Repo Dependency Map](#5-cross-repo-dependency-map)
6. [Deliverables Tracker](#6-deliverables-tracker)
7. [Out of Scope / Future Work](#7-out-of-scope--future-work)
8. [Risks Register](#8-risks-register)
9. [References (existing artifacts)](#9-references-existing-artifacts)

---

## 1. Executive Summary

### 1.1 The problem

Multi-plot KMZ uploads (e.g. `complex-plant-layout.kmz`, 6 plots, 1,079 inverters) cause the AC cable layout calculation to take 7+ minutes locally with **zero progress feedback**. The Generate button "freezes" the UI for the duration. Users on low-end laptops (the actual SolarLayout target audience — solar field workmen) cannot reliably run multi-plot calcs at all. The same workload is impossible on mobile (a confirmed product roadmap target).

### 1.2 What we're shipping (and why two phases)

We split the work into two spikes inside one PRD:

- **Spike 1 (1 week, local-only)** — Eliminate the immediate UX failure with two correctness-preserving perf wins (already implemented and benchmarked on `perf/cable-multiplot-poc`) plus pre-flight expectation-setting, per-plot progress, and a cancel button. This solves 80% of the user pain with zero architectural lock-in.
- **Spike 2 (4–5 weeks, cloud)** — Lift the architectural ceiling. Per-plot map-reduce fan-out across AWS Lambda workers, dispatched via SQS, results aggregated through `mvp_api`. Same job/slice data model whether the work runs in the local Python sidecar or in a Lambda — front-end never has to care where compute lives. Unlocks low-end PCs, mobile, and unbounded user KMZ size.

Phasing rationale: Spike 1 is shippable in one week and has zero dependency on the backend repo. Spike 2 has a hard cross-repo dependency (a published `pvlayout_core` wheel — see §5) that makes "do it all at once" infeasible. Spike 1 lands ahead of Spike 2 and de-risks Spike 2 by introducing the local-job-table pattern that Spike 2's cloud version is structurally identical to.

### 1.3 What we explicitly are NOT doing

This PRD documents what we are **not** changing, because earlier exploration tested an option that we discarded:

We are **NOT** replacing the legacy AC cable BOM (sum of per-inverter home-run distances) with an MST-derived BOM (sum of trench lengths). Briefly: in a string-inverter plant the LV AC conductors are dedicated home-run cables per inverter — they share trenches but not copper. The legacy individual-route sum is the industry-standard BOM in solar EPC practice, codified in IEC 62548 / IEC 60364-7-712 / IEEE 1547 / NEC 690. Replacing it with the MST sum would underreport copper meters by 70–90%, which is wrong on an EPC bill of materials.

Both performance changes in Spike 1 (Changes A and B below) preserve the exact legacy AC BOM number, bit-for-bit. Cable counts, lengths, and geometry all match. This is a non-negotiable success criterion (§2).

### 1.4 Headline numbers (from POC measurement)

| Fixture | Baseline | Spike 1 (A+B) shipped | Speedup |
|---|---|---|---|
| `phaseboundary2.kmz` (1 plot, 62 inverters)            | 4.69 s  | 4.03 s   | 1.16× |
| `complex-plant-layout.kmz` (6 plots, 1,079 inverters)  | 444 s   | 236 s    | 1.88× |

Spike 1 is bounded by Amdahl's Law on the slowest plot (P2 in the multi-plot fixture takes 244 s post-A) — parallel-per-plot can never go below max-plot-time in a single-process model. Spike 2 lifts that ceiling by running each plot in its own Lambda.

### 1.5 Effort + dependencies (top-line)

| Phase | Calendar | Engineer-days | Cross-repo dependency |
|---|---|---|---|
| Spike 1 | week 1                | ~5 | none |
| Wheel publishing (gating) | week 2 | ~3 | desktop only |
| Spike 2 | weeks 3–6 (4 weeks)  | ~20 | backend session works in parallel from week 3 |

Spike 2's start is gated on (a) Spike 1 landing and (b) `pvlayout_core` published as a versioned wheel from this repo. The wheel is the desktop session's spike-1.5 deliverable; the backend cannot start container packaging without it.

---

## 2. Industry-Correctness Baseline (non-negotiable)

This baseline applies to **every** spike, every change, every refactor in this PRD. If a proposal violates any rule below, it does not ship.

### 2.1 BoM correctness

`result.total_ac_cable_m`, `result.total_dc_cable_m`, and the per-cable `length_m` values **must remain bit-identical** to the legacy individual-route BOM after Spike 1 changes A and B. Verified empirically on `perf/cable-multiplot-poc`:

| Output | phaseboundary2 baseline | phaseboundary2 after-AB | complex-plant baseline | complex-plant after-AB |
|---|---|---|---|---|
| `total_dc_cable_m`   | 37,380 | 37,380 | 674,278 | 674,278 |
| `total_ac_cable_m`   | 12,361 | 12,361 | 479,698 | 479,698 |
| `dc_cable_runs.length` | 604 | 604 | 10,573 | 10,573 |
| `ac_cable_runs.length` | 62  | 62  | 1,079  | 1,079  |

CI gate: golden test asserts every BoM scalar to the unit (m or count) before/after change.

### 2.2 EPC labelling — "AC cable trench"

The `ac_cable_runs[]` geometry rendered on the KMZ map and in DXF/PDF exports represents the **physical cable trench / cable tray route** (the MST-style shared corridor through the plant), not a single conductor. The `total_ac_cable_m` summary value represents the **per-inverter copper BoM** (sum of individual home-run distances).

These are two distinct EPC line items in real plant deliverables. We will rename the on-screen toggle and exported field labels to make the distinction explicit:

| Where | Today's label | New label (Spike 1) |
|---|---|---|
| `LayoutPanel.tsx` field `CableCalcFieldRow` ([line 354](apps/desktop/src/panels/LayoutPanel.tsx)) | "Calculate cables" | "Calculate AC cable trench" |
| KMZ summary text ([kmz_exporter.py:140-141](python/pvlayout_engine/pvlayout_core/pvlayout_core/core/kmz_exporter.py:140)) | "AC cable total: 12,361 m" | "AC cable BoM: 12,361 m (MST trench layout shown on map)" |
| MapCanvas legend (when AC toggle on) | "AC cable" | "AC cable trench" |
| DXF layer name | (existing) | "AC_CABLE_TRENCH" |
| PDF report row label | "AC cable total" | "AC cable BoM (per-inverter copper)" + "AC cable trench length" as a sibling row |

The PDF report gains a new "AC cable trench length" row alongside the existing copper BoM row, sourcing from `sum(ac_cable_runs[*].length_m)` (the MST sum). This is **additional information**, not a replacement — the copper BoM stays primary.

Authority: IEC 62548 (PV array design), IEC 60364-7-712 (LV PV installations), IEEE 1547 (interconnection requirements), NEC 690 (US PV code), IFC/World Bank "Utility-Scale Solar Photovoltaic Power Plants: A Project Developer's Guide" (2015). All five sources treat each inverter circuit as independent for sizing/protection/BOM purposes.

### 2.3 Geometry & layer fidelity

The geometry of `placed_tables`, `placed_icrs`, `placed_lightning_arresters`, `dc_cable_runs[].route_utm`, and `ac_cable_runs[].route_utm` must remain bit-identical (modulo final coordinate-rounding precision) before and after Spike 1. This is automatically the case because Changes A and B are pure performance optimizations — neither alters control flow that affects geometry.

CI gate: golden geometry parity test on both fixtures (already exists at `tests/golden/test_layout_parity.py` and `tests/parity/test_p00_bundled_mst_parity.py`).

### 2.4 Cross-engine consistency (Spike 2)

Under Spike 2, the same input fixture must produce **bit-identical output** whether the slice runs in the local sidecar or in an AWS Lambda (modulo `engine_version` drift between deploys). This implies:

- Both consumers pin the same `pvlayout_core` wheel version.
- A CI test in `pvlayout_core` runs the same fixture as N sequential single-plot calls and as one multi-plot call, asserting byte-equal `LayoutResponse`. (Backend report §8 risk #12 calls this out as a gating week-1 deliverable.)

### 2.5 Auth-boundary state hygiene (license-key swap)

Origin: SMOKE-LOG.md S3-05 (Session 3, 2026-05-01). License-key swap is the closest the desktop comes to a multi-tenant boundary in production — the same OS user can hold multiple license keys (their own + a colleague's, fixture keys for testing, free-tier + paid). When a swap happens, **no per-user state from the previous key may survive**. This is both a UX requirement (no cascade of 401/404 overlays from stale fetches keyed off the previous user's project IDs) and a privacy requirement (the previous user's project geometry must not be visible to the new user, even briefly).

**Canonical wipe point:** `clearAllPerUserSession()` in `apps/desktop/src/App.tsx`. Called from the license-success effect (when this is a real swap — `savedKey !== null` going to a different value) and from `handleClearLicense`. Today it wipes:

- Every per-user Zustand slice (project, currentProject, runs, selectedRunId, layoutResult, layoutParams, layerVisibility, editingState, currentLayoutJob, tabs)
- TanStack `queryClient.clear()` (drops every cached query, including stale per-user data)
- `layoutFormKey` bump (forces RHF remount)
- Sidecar `DELETE /layout/jobs` (defense-in-depth — the in-process job table holds the previous user's full LayoutResult and has no TTL)

**Spike 2 implications:**

1. **The sidecar's in-process job table goes away in Spike 2** — compute moves to RDS-backed `Job` + `Slice` rows scoped by `userId` with license-key Bearer auth on every read. The `DELETE /layout/jobs` hygiene endpoint becomes obsolete and can be removed (or kept as a no-op stub for transition compatibility) when the sidecar is retired or reduced to thin parser duties.

2. **Backend Job lookup is auto-isolated** — license-key-A cannot fetch license-key-B's Jobs because the API filter is `userId`-scoped. This is a stronger property than localhost-only isolation.

3. **Desktop-side `clearAllPerUserSession` stays canonical.** Any new per-user state introduced by Spike 2 work — UI slices, IndexedDB / OS-file caches, additional TanStack queries, Tauri shell-state — **must register itself with that wipe** (or be naturally covered by `queryClient.clear()` if it's a TanStack query). The maintenance discipline is "one wipe point; if you add per-user state, add it to the wipe." Reviewers should reject Spike 2 PRs that add per-user state without updating the helper.

4. **Spike 2 should NOT introduce a per-license-key bearer scoped to anything outside `useEntitlementsQuery(activeKey)` and the cancel-flush path.** Today's pattern (license key flows through TanStack-cached `entitlementsClient` calls + sidecar's per-Tauri-process token) is already correct; the temptation to "stash the active license key in a singleton" must be resisted because it makes the wipe point harder to reason about.

CI gate (suggested when Spike 2 lands a license-swap test fixture): a Vitest test that mounts App with a non-null saved key + a populated project state, dispatches a key-change event with a different valid key, and asserts every slice listed above is back to its initial state, the queryClient is empty, and the form-key has incremented.

---

## 3. Spike 1 — Local Perf Wins + UX Hygiene + Relabel (week 1)

### 3.1 Goal

Eliminate the silent-button UX failure and ship two correctness-preserving perf wins. By end of week 1: a user with a multi-plot KMZ on a typical desktop sees per-plot progress, has a working cancel button, and the wall-clock is roughly halved on the test multi-plot fixture.

### 3.2 Track A — prepared geometry on `_seg_ok` (already implemented)

**File:** [`pvlayout_core/core/string_inverter_manager.py`](python/pvlayout_engine/pvlayout_core/pvlayout_core/core/string_inverter_manager.py)

**What it does:** Caches `shapely.prepared.prep(poly)` per `id(poly)`. `_seg_ok` (line 615) gains a three-tier check: prepared.covers (fast accept) → prepared.intersects (fast reject) → unprepared `poly.intersection().length` tolerance fallback (preserves legacy semantics on boundary-tangent edge cases).

**Status:** implemented on `perf/cable-multiplot-poc` (commit not yet authored). Always-on, no env var, no API change.

**Measured impact:** phaseboundary2 4.69s → 4.03s (1.16×); complex-plant 444s → 401s (1.11×). Modest because S11.5 search-space caps already bound `_path_ok` call counts.

**Risk:** None observed in 123/123 + 6 skipped passing tests. The unprepared-fallback path catches any boundary-tangent edge cases.

### 3.3 Track B — parallel per-plot via `ProcessPoolExecutor` (already implemented)

**File:** [`pvlayout_engine/routes/layout.py`](python/pvlayout_engine/pvlayout_engine/routes/layout.py)

**What it does:** When `len(core_results) > 1` and `enable_cable_calc=True`, the `/layout` handler dispatches per-plot LA + cable computation via `ProcessPoolExecutor.map`. `max_workers = min(P, cpu_count)`. Single-plot stays in-process to avoid ~150 ms pool startup overhead. `PVLAYOUT_DISABLE_PARALLEL=1` forces sequential for debug/test.

**Status:** implemented on `perf/cable-multiplot-poc`. No semantic change, no API change.

**Measured impact:** complex-plant 401s → 236s (additional 1.70× on top of A). Bounded by max-plot-time (Amdahl's Law).

**Risks to verify before shipping** (from architecture research §8.2 + §8.3):

1. **PyInstaller bundle compatibility.** `ProcessPoolExecutor` with the `spawn` start method (macOS default) was tested only with `uv run` — never against the bundled binary. PyInstaller bundles set `sys.frozen = True` and re-import via `_MEIPASS`. Risk: workers may fail to import `pvlayout_core` in the bundle context.

   **Mitigation:** Add `multiprocessing.freeze_support()` call in [`pvlayout_engine/main.py`](python/pvlayout_engine/pvlayout_engine/main.py) before any other init. Explicitly use `mp_context = multiprocessing.get_context("spawn")` in the executor call. Test with `bun run tauri build` on macOS + Windows + Linux before merging Spike 1.

2. **Windows spawn overhead.** Windows-only spawn cost is 300–600 ms per worker. For 6-plot complex-plant on Windows, this adds ~3 s to the parallel dispatch — still well under the per-plot time. Not blocking; document in Spike 1's QA checklist.

### 3.4 Track C — Pre-flight expectation setting

**Goal:** Before the user clicks Generate, surface a realistic time estimate based on parsed-KMZ structure.

**Wire-up:** Existing [`projectCounts.boundaries`](apps/desktop/src/App.tsx) is computed at App.tsx:313–319 from `countKmzFeatures(parsed.boundaries)`. It's already exposed in the StatusBar. Spike 1 adds a fast-pass:

1. On KMZ load (after parse), fire a no-cable layout: `sidecar.runLayout(parsedKmz, { ...params, enable_cable_calc: false })`. Wall-clock: ≤2 s on complex-plant.
2. Result's `placed_string_inverters` count gives a calibrated input to a lookup-table estimator:

| Max boundary inverter count | Estimated cable-calc time | Recommended executor |
|---|---|---|
| < 100   | ~5–15 s    | local (no progress UI needed) |
| 100–300 | ~30–90 s   | local-with-progress |
| 300–500 | ~120–270 s | local-with-progress (this is the P2 case) |
| > 500   | uncertain  | cloud-offload recommended (Spike 2; Spike 1 just warns) |

3. Surface the estimate as a `<Chip>` or inline notice below the Generate button in `LayoutPanel.tsx` (around line 296). Format: "This KMZ has 6 boundaries (~10K tables). Estimated 4–6 min."

**No new UI primitives required** — `Chip` already exported from `packages/ui`.

### 3.5 Track D — In-flight per-plot progress (local job-table pattern)

**Goal:** Replace the silent "Generating…" with a per-plot progress list. Make this the structural rehearsal for Spike 2's cloud job table — same shape, different executor.

**Sidecar changes** ([`pvlayout_engine/routes/layout.py`](python/pvlayout_engine/pvlayout_engine/routes/layout.py)):

1. **New endpoint shape.** `POST /layout` returns `{ job_id }` immediately; the actual compute runs in a background thread. The endpoint ceases to block on compute.
2. **In-process job table.** Module-level `dict[str, JobState]` keyed by UUID. `JobState` carries `{ status, plots: [PlotState], result: LayoutResponse | None, cancelled: bool }`. As each plot's `ProcessPoolExecutor.map` future returns, the parent thread updates `plots[i].status = "done"`.
3. **`GET /layout/jobs/<id>`.** Returns the current `JobState` as JSON. When `status = "done"`, includes the full `LayoutResponse` in `result`.
4. **`DELETE /layout/jobs/<id>`.** Sets `cancelled = true`. The parent thread checks the flag at the top of each `ex.submit` call (cooperative cancel — slices already running in workers complete; pending slices are skipped). Returns `{ status: "cancelled", plots_done: K }` with whatever completed.

**Wire schema** (matches Spike 2's cloud shape verbatim — see §4.3):

```json
GET /layout/jobs/<id>
{
  "job_id": "uuid",
  "status": "queued|running|done|failed|cancelled",
  "plots_total": 6,
  "plots_done": 2,
  "plots": [
    { "index": 0, "name": "P1_A", "status": "done"   },
    { "index": 1, "name": "P1_B", "status": "done"   },
    { "index": 2, "name": "P2",   "status": "running"},
    { "index": 3, "name": "P3_A", "status": "queued" },
    { "index": 4, "name": "P3_B", "status": "queued" },
    { "index": 5, "name": "P4",   "status": "queued" }
  ],
  "result": null
}
```

**Desktop changes** ([`apps/desktop/src/auth/useGenerateLayout.ts`](apps/desktop/src/auth/useGenerateLayout.ts)):

1. Mutation's stage-2 (`sidecar.runLayout`) splits into:
   - `sidecar.startLayout(parsedKmz, params)` → returns `{ job_id }`.
   - TanStack `useQuery` polls `sidecar.getLayoutJob(job_id)` every 2 s until `status ∈ {done, failed, cancelled}`.
   - On `done`, the polled response carries the same `LayoutResponse` shape as today's blocking call. `onSuccess` runs unchanged.
2. Cancel button calls `sidecar.cancelLayoutJob(job_id)`.

**UI primitives:** existing — `Loader2` (Lucide, animate-spin) for running plots, checkmark icon for done, plain text for queued. `InspectorSection` + `PropertyRow` from `packages/ui` give the right density.

**Why local job-table, not SSE:** SSE requires switching the FastAPI handler from `def` to `async def` (the current sync-handler-on-thread-pool pattern doesn't support `StreamingResponse`). It also requires Tauri WebView's `EventSource` support to be verified on three platforms. Local job-table polling has neither risk and is structurally identical to Spike 2 (which polls `mvp_api` instead of polling the local sidecar). The same React polling code works for both — only the URL changes.

**Connection-timeout side benefit:** Today's blocking `POST /layout` may hit Tauri-plugin-http's TCP idle timeout on a 7-min compute (architecture research §8.1 — flagged as unverified risk). The job-table pattern eliminates this risk: every request returns in ms.

### 3.6 Track E — Cancel button

**Goal:** Honest "abort" affordance during compute.

**UI:** A `<Button variant="ghost">` adjacent to the Generate button while `generating === true`. Calls `sidecar.cancelLayoutJob(job_id)`.

**Semantics:** Cooperative cancel only. `ProcessPoolExecutor.cancel()` only cancels not-yet-started futures; running workers complete naturally. The cancel-confirm UI text reads: *"Cancel requested. Plots already running may take a few more seconds to finish; their results will be discarded."*

### 3.7 Track F — Error UX (graceful per-plot failure)

**Goal:** A single plot crashing should not abort the whole job.

**Sidecar:** `_run_per_plot_pipeline` (the `ProcessPoolExecutor.map` worker at [`routes/layout.py:208-219`](python/pvlayout_engine/pvlayout_engine/routes/layout.py:208)) wraps `place_lightning_arresters` + `place_string_inverters` in `try/except`. On exception, return an error-tagged `LayoutResult` (mirroring the existing error path at `layout_engine.py:294-298`) with `boundary_name = "{name} [ERROR: {message}]"` and empty geometry arrays.

**UI:** Per-plot status in the progress list shows `failed` with the error message in a tooltip. SummaryPanel aggregates across the 5 of 6 successful plots (shows partial total). Toast: "5 of 6 boundaries completed. P2 failed. Partial layout shown."

### 3.8 Track G — "AC cable trench" relabel (per §2.2)

Single-line changes across:

| File | Line | Change |
|---|---|---|
| [`apps/desktop/src/panels/LayoutPanel.tsx`](apps/desktop/src/panels/LayoutPanel.tsx) | 354 | "Calculate cables" → "Calculate AC cable trench" |
| [`packages/ui/src/compositions/MapCanvas.tsx`](packages/ui/src/compositions/MapCanvas.tsx) | (legend) | "AC cable" → "AC cable trench" |
| [`python/pvlayout_engine/pvlayout_core/core/kmz_exporter.py`](python/pvlayout_engine/pvlayout_core/pvlayout_core/core/kmz_exporter.py) | 140-141 | Add "AC cable trench length" row alongside copper BoM |
| [`python/pvlayout_engine/pvlayout_core/core/dxf_exporter.py`](python/pvlayout_engine/pvlayout_core/pvlayout_core/core/dxf_exporter.py) | (layer setup) | DXF layer name → "AC_CABLE_TRENCH" |
| [`python/pvlayout_engine/pvlayout_core/core/pdf_exporter.py`](python/pvlayout_engine/pvlayout_core/pvlayout_core/core/pdf_exporter.py) | 297, 331-332, 420, 445-446 | Split into "AC cable BoM" + "AC cable trench length" rows |

### 3.9 Acceptance criteria (Spike 1)

| # | Criterion | How verified |
|---|---|---|
| 1 | `phaseboundary2` wall-clock ≤ baseline (4.69 s) | benchmark script |
| 2 | `complex-plant-layout` wall-clock ≤ ~250 s | benchmark script |
| 3 | All BoM scalars bit-identical pre/post Spike 1 | golden-test gate |
| 4 | All cable geometry bit-identical pre/post | golden-test gate |
| 5 | 123/123 sidecar tests + 6 skipped passing | `uv run pytest` |
| 6 | Generate button shows per-plot progress live | manual test on `complex-plant` |
| 7 | Cancel button aborts within 2× max-plot-time | manual test |
| 8 | KMZ summary, DXF layer, PDF rows all use "trench" terminology | manual diff |
| 9 | PyInstaller bundle on macOS / Windows / Linux successfully runs `ProcessPoolExecutor.map` workers | `bun run tauri build` smoke test on each OS |

### 3.10 Spike 1 risks

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| 1 | PyInstaller bundle breaks `ProcessPoolExecutor` workers | medium | Add `freeze_support()`; test all 3 OS bundles before merge |
| 2 | Tauri-plugin-http times out on long polls (every 2s) | low | Use the standard fetch-poll pattern; default Tauri timeout is fine for 2 s requests |
| 3 | In-process job table leaks memory if user closes window mid-job | low | Background thread holds a `weakref` to the result; hard 30-min TTL on stale jobs |
| 4 | Fast-pass with `enable_cable_calc=False` is slow on 20+ boundary KMZs | low | Track wall-clock; if >5s, gate behind explicit user opt-in |
| 5 | "Trench" relabel causes confusion for existing users | low (early-stage product) | Tooltip on "AC cable trench BoM" explaining the EPC convention |

---

## 4. Spike 2 — Cloud Offload Framework (weeks 2–6)

### 4.1 Goal

Lift the per-plot compute off the user's machine entirely. Each plot becomes a `Slice` dispatched to an AWS Lambda; results aggregated by `mvp_api` and polled by the desktop. Single shared data model whether work runs locally or in cloud — front-end is execution-location-agnostic.

### 4.2 Architecture overview

```
T+0s    Desktop:  user clicks Generate.
                  KMZ already in S3 (B6 PUT at project create).
                  POST /v2/jobs  (mvp_api, license-key bearer)
                    body: { projectId, paramsJson, idempotencyKey,
                            boundaryCount: 6, boundaryNames, engineVersion }

T+0.05s mvp_api:  - license-key auth + ownership check
                  - idempotency pre-lookup (Job.@@unique([userId, idempotencyKey]))
                  - db.$transaction:
                        Job.create({ status=QUEUED, ... })
                        Slice.createMany([6 rows, status=QUEUED, executor=LAMBDA])
                  - SendMessageBatch to cable-jobs SQS queue (6 messages)
                  - 201 { job, slices }

T+0.1s  Desktop:  starts polling GET /v2/jobs/<id> every 2 s.

T+1-30s Lambdas:  6 Lambda invocations spin up in parallel.
                  Each:
                    1. SQS event → handler({ records: [{body: slice payload}] })
                    2. UPDATE slices SET status=RUNNING, startedAt=now() WHERE id=$1 AND status IN (QUEUED, RUNNING)
                    3. download KMZ from S3 (kmz_blob_url from Project)
                    4. pvlayout_core.parse_kmz → boundaries
                    5. pvlayout_core.run_slice(boundaries[boundary_index], params) → SliceResult
                    6. PUT result to s3://bucket/projects/<userId>/<projectId>/runs/<runId>/slices/<idx>/result.json
                    7. UPDATE slices SET status=DONE, endedAt=now(), engineVersion=...

T+30-90s mvp_api:  on each slice update, "rollup" check → if all slices DONE → Job.status=DONE.

T+92s   Desktop:  GET /v2/jobs/<id> returns status=DONE.
                  Desktop fetches each slice's result blob (signed-GET URL).
                  Reassembles LayoutResponse by sorting on boundary_index.
                  setResult(layoutResult, runId) — same as today's onSuccess.
                  Render.
```

### 4.3 Data model

The `mvp_db` schema gains two tables: [`Job`](file:///Users/arunkpatra/codebase/renewable_energy/docs/initiatives/2026-05-01-cable-compute-offload-feasibility.md) and [`Slice`](file:///Users/arunkpatra/codebase/renewable_energy/docs/initiatives/2026-05-01-cable-compute-offload-feasibility.md). Full schema sketch in the backend feasibility report §3.2; key columns:

**Job:** `id, userId, licenseKeyId, projectId, runId?, kmzBlobUrl, kmzSha256, paramsJson, status, executorDefault, idempotencyKey, engineVersion, errorPayload?, createdAt, startedAt?, completedAt?`

Constraints: `@@unique([userId, idempotencyKey])` (race-safe — same pattern as B16's `UsageRecord`).

**Slice:** `id, jobId, boundaryIndex, boundaryName, status, executor, resultBlobUrl?, startedAt?, endedAt?, errorPayload?, engineVersion, attemptCount`

Constraints: `@@unique([jobId, boundaryIndex])` (gives exactly-once-effect on SQS at-least-once delivery via `INSERT ... ON CONFLICT DO NOTHING` in the Lambda's mark-running call).

**Storage convention:** `Slice.resultBlobUrl` is just a presence flag. Actual signed-GET URL is minted at read time from the deterministic key path `projects/<userId>/<projectId>/runs/<runId>/slices/<idx>/result.json` (Path A pattern, same as run thumbnails in memo v3 §2).

### 4.4 New API endpoints (mvp_api)

All under `licenseKeyAuth`, V2 envelope, `V2ErrorCode`-formatted errors. Mirrors B16's pattern for idempotency + race-safety.

| Method | Path | Purpose |
|---|---|---|
| `POST`   | `/v2/jobs`                       | Create Job + N Slices, fan-out to SQS, return `{ job, slices[] }` |
| `GET`    | `/v2/jobs/<id>`                  | Poll endpoint. Returns `{ job, slices[] }` with current status. |
| `GET`    | `/v2/jobs/<id>/slices`           | (Optional) Granular per-slice status without fetching the full job. |
| `POST`   | `/v2/jobs/<id>/cancel`           | Soft-cancel: mark Job.status=CANCELLED, signal in-flight Lambdas to abort. Does NOT refund the calc (matches B18 run-delete pattern). |
| `GET`    | `/v2/jobs/<id>/slices/<idx>/result-url` | Mint signed-GET URL for the slice's result blob. Polled at "done" by the desktop to assemble the response. |

### 4.5 Lambda execution layer

**Packaging:** Container image on Lambda, Python 3.13, arm64, base `public.ecr.aws/lambda/python:3.13`. Pattern copied verbatim from existing experimental [`apps/layout-engine/Dockerfile`](file:///Users/arunkpatra/codebase/renewable_energy/apps/layout-engine/Dockerfile) — only the `pyproject.toml` engine dep changes (from the layout-engine's PV-layout package to our `pvlayout-core` wheel).

**Cold-start mitigation (v1):** None. Document the ~5–10 s first-cold-start penalty; user UX absorbs it because the loading bar already shows "queued" → "running" transition.

**Cold-start mitigation (v2 if needed):** Provisioned concurrency = 1 during business hours (~$0.18/day). Cheap enough to add when metrics justify.

**Engine versioning:** Each Lambda image's `Dockerfile` pins a specific `pvlayout-core==X.Y.Z` from a private registry (GitHub Packages or AWS CodeArtifact). The same wheel version is pinned in the desktop sidecar's `pyproject.toml`. CI gate: a check that fails the build if the two pinned versions diverge.

**Engine version recording:** Each Lambda invocation writes its actually-running engine version to `Slice.engineVersion` at slice start. Mid-deploy drift (deploy lands while job is in flight) shows up in observability. The desktop's reconstruction logic must tolerate heterogeneous engine versions across slices in the same job — flag in §8 risks.

### 4.6 SQS pattern

| Decision | Choice | Rationale |
|---|---|---|
| FIFO vs Standard | **Standard** | Per-plot fan-out is embarrassingly parallel; idempotency lives in the API, not the queue. Standard is unlimited throughput, ~50% cheaper. |
| Dead-letter queue | **Required from day 1** | `RedrivePolicy.maxReceiveCount = 3`. CloudWatch alarm on `ApproximateNumberOfMessages > 0` for >5 min. Avoids the canonical "no DLQ" failure. |
| Visibility timeout | **17 min (1020 s)** | Lambda timeout of 14 min × 1.2 + buffer for cold start + grace. |
| Per-job concurrency | inherent | 6-plot job → 6 messages. Lambda reserved concurrency at function level (e.g. 50) gives account-wide cap; per-job is automatic. |
| Message size | <1 KB per slice | Slice payload is just `{slice_id, job_id, boundary_index, kmz_blob_url, params_json}`. SQS limit (256 KB) is irrelevant. Result payload goes to S3, never SQS. |

### 4.7 Lambda → RDS write pattern

Lambda writes directly to RDS via psycopg2 (proven pattern from existing [`apps/layout-engine/src/db_client.py`](file:///Users/arunkpatra/codebase/renewable_energy/apps/layout-engine/src/db_client.py)). Service-account license-key approach considered and rejected — adds rotation complexity for no win.

**Idempotency-safe slice update (handles SQS at-least-once redelivery):**

```sql
UPDATE slices
   SET status = 'RUNNING',
       startedAt = NOW(),
       attemptCount = attemptCount + 1,
       engineVersion = $2
 WHERE id = $1
   AND status IN ('QUEUED', 'RUNNING')
```

Re-entry on a redelivered message just bumps `attemptCount`; the row stays consistent.

**Schema-drift mitigation:** Lambda's hand-written SQL ships in the same PR as Prisma migrations to `Slice` columns. CI grep gate: if any Prisma migration touches `slices.*`, require the corresponding Python file to be modified in the same PR.

### 4.8 Executor selection (Lambda vs Fargate)

**v1: always Lambda.** Fargate executor deferred until empirical evidence shows a real slice running >14 min on Lambda. Per the perf POC, today's worst single slice (P2 in complex-plant) is 244 s on a desktop — well under Lambda's 15-min ceiling, even allowing for Lambda's slower per-vCPU compute.

When/if Fargate is needed (v2):
- Selection logic: `mvp_api.chooseExecutor()` heuristic on parsed-KMZ stats (vertex count, table count, area). Conservative threshold: `> 12 min estimated → Fargate`.
- Same container image, same `pvlayout_core` engine; just different entry-point (`cli_handler.py` instead of `lambda_handler.py`).
- Dispatch: `ECS.RunTask` from `mvp_api` (no SQS for Fargate slices).
- Same `Slice.executor = "fargate:<task_arn>"` recording.

### 4.9 Cancel + refund semantics

| Action | Job.status | Refund? | UX |
|---|---|---|---|
| User cancels before all slices dispatched | CANCELLED | No (matches B18 pattern) | "Calc charged. Job cancelled." |
| User cancels mid-flight | CANCELLED | No | "Calc charged. Slices already running may finish; their results discarded." |
| All slices fail | FAILED | (TBD with product) | "Job failed. Contact support for refund eligibility." |
| Network failure mid-poll | (job continues server-side) | n/a | Desktop resumes polling on reconnect (idempotent fetch) |

### 4.10 Effort + timeline

5-phase plan, ~4–5 weeks calendar:

| Phase | Calendar | Output | Side |
|---|---|---|---|
| **Pre-spike-2 (week 2)** | Wheel publishing | `pvlayout-core==X.Y.Z` published to private registry; CI version-drift gate active | desktop |
| **Phase 2.1 (week 3)** | Schema + API skeleton | mvp_db migration; `POST /v2/jobs` with idempotency + ownership; SQS queue + DLQ in dev. First green test: API creates Job + 6 Slices + publishes 6 mock SQS messages. | backend |
| **Phase 2.2 (week 4)** | Lambda packaging | `apps/cable-engine/` Dockerfile + handler skeleton; ECR repo; first manual `docker push`; manual Lambda function creation pointing at the image with no-op handler. First green test: `aws lambda invoke` returns 200 with stub. | backend |
| **Phase 2.3 (week 5)** | End-to-end dev round-trip | Wire `pvlayout-core` wheel into Lambda image; `handle_slice_job` orchestration; `db_client.py` writes; round-trip a real slice from `mvp_api` → SQS → Lambda → S3 → RDS in dev. First green test: end-to-end 1-slice job. | backend |
| **Phase 2.4 (week 6)** | UI + multi-slice + CI/CD | `GET /v2/jobs/<id>` polling endpoint with rollup logic; result-blob signing; desktop adapter polling loop (replaces Spike 1's local-job-table polling — same shape, different URL); live test of 6-slice job; GitHub Actions build+deploy workflows. First green test: 6-slice job runs end-to-end, desktop UI reflects per-slice progress. | both |
| **Phase 2.5 (week 7, optional)** | Hardening | DLQ alarm, DLQ replay tooling in mvp_admin, Lambda timeout tuning, cold-start measurement, error-payload formatting, observability dashboards. | backend |

**Critical paths:**

- Spike 2 phase 2.1 cannot start until the wheel is published (week 2 deliverable). If wheel slips, all backend work slips.
- Spike 2 phase 2.4 requires both backend (mvp_api endpoint + rollup logic) and desktop (polling adapter) — coordinate with paste-block protocol.
- Spike 2 phase 2.5 is optional for the spike close-out; can land in a follow-up if timeline pressure.

### 4.11 Acceptance criteria (Spike 2)

| # | Criterion | How verified |
|---|---|---|
| 1 | Same `complex-plant-layout.kmz` produces bit-identical `LayoutResponse` whether run locally (Spike 1 path) or in cloud (Spike 2 path), modulo `engine_version` recorded per slice | golden-test gate (cross-engine consistency, §2.4) |
| 2 | Wall-clock for `complex-plant` cloud-end-to-end: <120 s (assumes Lambda parallelism + no cold-start penalty) | manual benchmark |
| 3 | DLQ stays empty under normal traffic | CloudWatch metric |
| 4 | Re-clicking Generate with same idempotency-key returns the existing job (no double-billing) | integration test |
| 5 | Cancel mid-job marks status=CANCELLED, doesn't double-refund | integration test |
| 6 | Lambda → RDS direct write is schema-coherent with Prisma migrations | CI grep gate |
| 7 | Desktop polling tolerates network blips (intermittent fetch failures, retry on reconnect) | integration test |

---

## 5. Cross-Repo Dependency Map

The spike split is driven by one hard cross-repo dependency:

### 5.1 The wheel — desktop ships `pvlayout-core` to a registry

**Why:** The Lambda's container image needs to install `pvlayout-core` from somewhere. Pip-install-from-GitHub-URL inside a Dockerfile is feasible but operationally fragile (auth tokens, cache invalidation). Standard practice is to publish a versioned wheel/sdist to a registry — GitHub Packages (PyPI registry) or AWS CodeArtifact.

**Who:** desktop session (this repo).

**Output (week 2):**

1. `pvlayout-core` packaged as a wheel + sdist via `uv build`.
2. CI workflow on every merge to `main` that:
   - bumps the patch version (or honors a `release: minor`/`major` commit-message convention)
   - publishes to the chosen private registry
   - tags the git commit with `pvlayout-core@X.Y.Z`
3. Both consumers (desktop sidecar's `pyproject.toml` + Lambda's `pyproject.toml` in `renewable_energy`) pin the same version.
4. **Cross-repo CI version-drift gate:** a workflow on the backend repo that fails the build if its pinned version doesn't match the desktop's released latest. Runs on every PR.

**Until the wheel ships, Spike 2 can't start phase 2.1.** This is the gating critical-path item.

### 5.2 Other cross-repo coordination

| Item | Owner | Consumer | Coordination protocol |
|---|---|---|---|
| `mvp_db` schema migration (Job + Slice tables) | backend | desktop client types | Backend ships migration → publishes new `@solarlayout/types-v2` types → desktop pins. Same paste-block protocol used for B23/B24/B25/B26. |
| `mvp_api` `/v2/jobs/*` endpoints | backend | desktop sidecar-client | Wire schema in `packages/shared` → mirrored into `packages/sidecar-client` (or new `packages/jobs-client` if the boundary makes sense). |
| KMZ schema + boundary parsing | desktop's `pvlayout_core` | Lambda (via wheel) | Single source of truth: `BoundaryInfo` Pydantic model in `pvlayout_core.schemas`. Both sidecar and Lambda import from the same wheel. |
| Result blob format | desktop's `pvlayout_core` | Lambda + desktop reconstruction | `schemas.LayoutResult` Pydantic model, single source of truth in `pvlayout_core`. |
| Engine version reporting | desktop CI | Lambda + DB | Desktop CI emits `pvlayout-core@X.Y.Z`. Lambda Dockerfile pins it. Lambda env var carries it; written to `Slice.engineVersion`. |

### 5.3 Backend report's open questions for desktop session

The backend feasibility audit raised five clarifying questions in §8.1 that need this side's confirmation:

1. **Wheel publishing target:** GitHub Packages (PyPI) vs AWS CodeArtifact. Recommend GitHub Packages — already authenticated via the org's existing OIDC roles; no new AWS infra. **Action: confirm and document in §6.5 wheel publishing spec.**
2. **VPC config for Lambda:** existing `apps/layout-engine` Lambda has a VPC config (for RDS access). Cable Lambda must be in the same VPC. **Action: backend session verifies via `aws lambda get-function-configuration`.**
3. **Engine deps overlap:** existing layout-engine ships shapely / pyproj / numpy independently from cable engine. **Decision: each engine pins its own deps.** No shared base image for now.
4. **Cancel signal mechanism:** Lambda has no clean abort. Soft-cancel only — mark CANCELLED in DB, let in-flight Lambdas finish (writes are idempotent). **Locked in §4.9.**
5. **Refund semantics on failed/cancelled jobs:** match B18's run-delete-doesn't-refund pattern. Cancel charges full calc. **Locked in §4.9.**

---

## 6. Deliverables Tracker

### 6.1 Already shipped (on `perf/cable-multiplot-poc` branch, not yet committed)

- [`pvlayout_core/core/string_inverter_manager.py`](python/pvlayout_engine/pvlayout_core/pvlayout_core/core/string_inverter_manager.py) — Change A (prepared geometry on `_seg_ok`)
- [`pvlayout_engine/routes/layout.py`](python/pvlayout_engine/pvlayout_engine/routes/layout.py) — Change B (parallel per-plot ProcessPoolExecutor)
- [`scripts/perf/benchmark_cable_calc.py`](python/pvlayout_engine/scripts/perf/benchmark_cable_calc.py) — repeatable wall-clock benchmark
- [`scripts/perf/benchmark_compare.py`](python/pvlayout_engine/scripts/perf/benchmark_compare.py) — side-by-side report
- [`scripts/perf/benchmark_consolidated.py`](python/pvlayout_engine/scripts/perf/benchmark_consolidated.py) — wide-format review table
- POC findings: [`docs/post-parity/findings/2026-04-30-002-cable-perf-poc.md`](docs/post-parity/findings/2026-04-30-002-cable-perf-poc.md)
- Architecture research: [`docs/post-parity/findings/2026-05-01-001-cable-perf-architecture-research.md`](docs/post-parity/findings/2026-05-01-001-cable-perf-architecture-research.md)
- Backend feasibility audit: [`renewable_energy/docs/initiatives/2026-05-01-cable-compute-offload-feasibility.md`](file:///Users/arunkpatra/codebase/renewable_energy/docs/initiatives/2026-05-01-cable-compute-offload-feasibility.md)

### 6.2 Spike 1 deliverables (week 1)

| # | Deliverable | Files / area |
|---|---|---|
| 1 | Add `freeze_support()` + explicit `mp_context = "spawn"` to ProcessPoolExecutor | `pvlayout_engine/main.py`, `routes/layout.py` |
| 2 | PyInstaller bundle smoke test (macOS, Windows, Linux) | CI workflow + manual |
| 3 | Local job-table pattern in sidecar | `routes/layout.py`, new `routes/layout_jobs.py` |
| 4 | `POST /layout` returns `{ job_id }`; `GET /layout/jobs/<id>`; `DELETE /layout/jobs/<id>` | sidecar |
| 5 | Sidecar client adapter for new endpoints | `packages/sidecar-client/src/index.ts` |
| 6 | Replace `useGenerateLayout`'s blocking call with start+poll loop | `apps/desktop/src/auth/useGenerateLayout.ts` |
| 7 | Per-plot progress UI in `LayoutPanel` | `apps/desktop/src/panels/LayoutPanel.tsx` |
| 8 | Cancel button | `apps/desktop/src/panels/LayoutPanel.tsx` |
| 9 | Pre-flight expectation chip | `apps/desktop/src/panels/LayoutPanel.tsx` |
| 10 | Per-plot exception handling in `_run_per_plot_pipeline` | `pvlayout_engine/routes/layout.py` |
| 11 | "AC cable trench" relabel everywhere (§2.2 table) | 5 files |
| 12 | Golden tests for BoM bit-identity + geometry parity | `tests/golden/`, `tests/parity/` |
| 13 | Update `docs/post-parity/findings/2026-04-30-002-cable-perf-poc.md` to "shipped" | docs |

### 6.3 Wheel publishing deliverables (week 2)

| # | Deliverable |
|---|---|
| 1 | `pvlayout-core` package metadata in `python/pvlayout_engine/pyproject.toml` (extract from monorepo if needed) |
| 2 | `uv build` produces a wheel + sdist |
| 3 | CI workflow on `main` to bump version + publish to GitHub Packages |
| 4 | Git tag convention `pvlayout-core@X.Y.Z` per release |
| 5 | Cross-repo CI gate: backend repo's PR fails if pinned version diverges from desktop's latest |
| 6 | Desktop sidecar's `pyproject.toml` pins the published wheel (transition from local path dep) |

### 6.4 Spike 2 deliverables — desktop side (weeks 3–6)

| # | Deliverable | Files / area |
|---|---|---|
| 1 | Adapter migrates from local-job polling to `/v2/jobs` polling | `apps/desktop/src/auth/useGenerateLayout.ts`, `packages/entitlements-client/src/types-v2.ts` |
| 2 | New `Job` + `Slice` wire types | `packages/entitlements-client/src/types-v2.ts` |
| 3 | Job-id idempotency: dedup Generate clicks at UI level (5s debounce + same idempotencyKey on retries) | `apps/desktop/src/auth/useGenerateLayout.ts` |
| 4 | Reconstruct LayoutResponse from N slice blobs | new helper `apps/desktop/src/auth/assembleLayoutFromSlices.ts` |
| 5 | UI: signal cross-engine drift if `Slice.engineVersion` heterogeneous in same job | `LayoutPanel.tsx`, `SummaryPanel.tsx` |

### 6.5 Spike 2 deliverables — backend side (weeks 3–6)

(Owned by `renewable_energy` session; listed for completeness — see backend report §7.3 for full table.)

| # | Deliverable | Owner notes |
|---|---|---|
| 1 | `mvp_db` Prisma migration: `Job` + `Slice` enums + tables + indexes | backend |
| 2 | `mvp_api/src/modules/jobs/` (routes + service + tests) | backend |
| 3 | `mvp_api/src/lib/sqs.ts` `publishSliceJob` | backend |
| 4 | SQS queue `cable-jobs` + DLQ `cable-jobs-dlq` provisioned | backend, manual CLI |
| 5 | ECR repo `renewable-energy/cable-engine` | backend |
| 6 | `apps/cable-engine/` Dockerfile + Lambda handler + db_client | backend |
| 7 | Lambda function `cable_engine_lambda_prod` | backend, manual CLI |
| 8 | GitHub Actions `build-cable-engine.yml` + `deploy-cable-engine.yml` | backend |
| 9 | Job-rollup logic on slice-status updates | backend |
| 10 | Result blob signing (deterministic key, B17 mirror) | backend |
| 11 | DLQ alarm + CloudWatch dashboard | backend |
| 12 | Cancel endpoint + soft-abort signal | backend |
| 13 | DLQ replay tooling in `mvp_admin` (optional, week 7) | backend |

---

## 7. Out of Scope / Future Work

These are explicitly excluded from this PRD and tracked here so they don't leak into spike scope:

1. **Fargate / ECS executor** — defer until empirical >14-min Lambda slice. Backend report §6 has the design ready when needed.
2. **IaC (Terraform / CDK)** — defer until 2nd Lambda lands. Manual CLI provisioning is sufficient for v1.
3. **DLQ replay UI in mvp_admin** — listed as optional week-7 deliverable; can land in a follow-up PR.
4. **Cross-engine drift detection observability** — `Slice.engineVersion` already records actuals; richer dashboards/alerts are post-MVP.
5. **MV pooling network** (inter-plot AC routing) — entirely missing from current architecture. The "AC cable trench" geometry today represents intra-plot only. MV pooling is its own domain spike, not in scope for cable-compute performance work.
6. **Symmetric-plot caching** — referenced in the original perf research as Item #5 (cache identical geometry). Defer indefinitely; user KMZs are typically heterogeneous enough that the cache hit rate would be low.
7. **Vis-graph cache reuse across `place_string_inverters` calls** — research Track 4 mentions `_build_boundary_vis_graph` as the third hot spot. Investigate after Spike 1 lands; may inform future single-process perf work.

---

## 8. Risks Register

Aggregated from POC findings + architecture research + backend feasibility audit. Sorted by impact × likelihood. Annotated by spike phase.

| # | Risk | Spike | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|---|
| 1 | PyInstaller bundle breaks `ProcessPoolExecutor` workers | S1 | Med | High | `freeze_support()`; test 3 OS bundles before merge | desktop |
| 2 | Wheel publishing slips → Spike 2 phase 2.1 blocked | S2 (gate) | Med | High | Treat wheel as the gating week-2 deliverable; daily standup on it | desktop |
| 3 | `pvlayout_core` not actually side-effect-free across plot calls | S2 | Low | High | CI test asserting byte-equal LayoutResponse for sequential vs multi-plot calls | desktop (week 1 deliverable) |
| 4 | Lambda VPC config not matching `apps/layout-engine` | S2 | Med | Med | Backend session verifies via `aws lambda get-function-configuration` in week 3 | backend |
| 5 | SQS at-least-once redelivery causes inconsistent slice state | S2 | Med | Med | Idempotent UPDATE: `WHERE status IN (QUEUED, RUNNING)` | backend |
| 6 | Engine version drift mid-job (deploy lands while job in flight) | S2 | Low | Med | `Slice.engineVersion` records actuals; desktop tolerates heterogeneity per slice | both |
| 7 | Lambda cold-start surprises user (first Generate of day 5–10s) | S2 | High | Low | Provisioned concurrency = 1 if metrics show pain; UX absorbs via "queued" → "running" transition | backend |
| 8 | Schema drift between Prisma + Lambda's psycopg2 SQL | S2 | Med | Med | CI grep gate: changes to `slices.*` columns require corresponding Python update in same PR | backend |
| 9 | DLQ replay operational overhead | S2 | Low | Low | Half-day mvp_admin tooling deliverable in week 7 | backend |
| 10 | "Trench" relabel confuses early users | S1 | Low | Low | Tooltip on "AC cable trench BoM" explaining EPC convention | desktop |
| 11 | Tauri-plugin-http times out on long polls | S1 | Low | Low | Local job-table pattern eliminates long-held connections; polls are 2s requests | desktop |
| 12 | Desktop double-clicks Generate, creating two jobs | S2 | Med | Med | UI debounce 5s + same idempotency-key on retries | desktop |
| 13 | Job-cancel refund expectations | S2 | Low | Med | Document explicitly in cancel-confirm dialog: "Calc charged. Job cancelled." | desktop + backend |
| 14 | RDS write contention on simultaneous slice updates | S2 | Low | Low | Aurora handles thousands TPS; monitor `replica_lag_p99` in steady state | backend |
| 15 | Fast-pass latency on KMZs with 20+ boundaries | S1 | Low | Low | Track wall-clock; gate behind opt-in if >5s | desktop |

---

## 9. References (existing artifacts)

### Within this repo

- POC findings + benchmark data: [`docs/post-parity/findings/2026-04-30-002-cable-perf-poc.md`](docs/post-parity/findings/2026-04-30-002-cable-perf-poc.md)
- Architecture research (Spikes 1+2 design input): [`docs/post-parity/findings/2026-05-01-001-cable-perf-architecture-research.md`](docs/post-parity/findings/2026-05-01-001-cable-perf-architecture-research.md)
- Repeatable benchmark scripts: [`python/pvlayout_engine/scripts/perf/`](python/pvlayout_engine/scripts/perf/) — `benchmark_cable_calc.py`, `benchmark_compare.py`, `benchmark_consolidated.py`
- Implementation in flight (Changes A + B): branch `perf/cable-multiplot-poc`
- Project conventions: [`CLAUDE.md`](CLAUDE.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/PLAN.md`](docs/PLAN.md), [`docs/principles/external-contracts.md`](docs/principles/external-contracts.md)

### Cross-repo (`renewable_energy`)

- Backend feasibility audit: [`renewable_energy/docs/initiatives/2026-05-01-cable-compute-offload-feasibility.md`](file:///Users/arunkpatra/codebase/renewable_energy/docs/initiatives/2026-05-01-cable-compute-offload-feasibility.md)
- Existing experimental pattern templates: `renewable_energy/apps/layout-engine/`, `renewable_energy/apps/api/src/lib/sqs.ts`, `renewable_energy/.github/workflows/build-layout-engine.yml`

### Industry standards (referenced for §2 industry-correctness baseline)

- IEC 62548 — Photovoltaic (PV) arrays — Design requirements
- IEC 60364-7-712 — Low-voltage electrical installations — Solar PV power supply systems
- IEC 60287 — Electric cables — Calculation of the current rating
- IEEE 1547-2018 — Interconnection and Interoperability of Distributed Energy Resources
- NFPA 70 (NEC) Article 690 — Solar Photovoltaic Systems
- IFC / ESMAP (2015) — Utility-Scale Solar Photovoltaic Power Plants: A Project Developer's Guide
- CIGRE Technical Brochure 727 — Solar PV Power Generation: Design Handbook

---

*End of PRD. This document is the deliverable of the cable-compute POC. Spike 1 ready for implementation now; Spike 2 gated on wheel publishing (week 2). Both spikes track against the acceptance criteria and risk register in §3.9 / §4.11 / §8.*
