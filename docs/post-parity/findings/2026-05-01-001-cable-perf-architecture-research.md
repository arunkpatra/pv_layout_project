# Cable Performance Architecture Research

**Date:** 2026-05-01
**Author:** Claude (under Arun's direction)
**Branch context:** `perf/cable-multiplot-poc` (research only — no code changes)
**Status:** Complete

---

## 1. Executive Summary

All six investigation tracks resolved with specific file:line citations. Key findings:

1. The Generate Layout flow is a four-stage sequential chain (B16 debit → sidecar `/layout` → S3 PUT → thumbnail). The sidecar `/layout` call is fully synchronous and blocking with zero progress visibility. Stages 2–4 all become async touchpoints under Spike 2.
2. Per-plot independence is confirmed clean by code structure: `run_layout_multi` produces each `LayoutResult` independently; the per-plot pipeline (`place_lightning_arresters` + `place_string_inverters`) reads only `result.usable_polygon`, `result.placed_icrs`, and `result.placed_tables` from the same result — zero cross-plot shared state. The parallelism in Change B (already shipped on `perf/cable-multiplot-poc`) proves this empirically.
3. Pre-flight estimation is feasible at parse time. `parse_kmz` is sub-second. The boundary count, combined table estimate, and dominant-plot size are all derivable from `ParsedKMZ` without running the layout engine. An `enable_cable_calc=False` fast pass adds a lightweight upper bound on table density.
4. The sidecar uses a plain synchronous `def layout()` handler (not `async def`) under uvicorn. SSE would require switching to `async def` with `StreamingResponse`. A local job-status table is the lower-risk alternative and is the correct architectural precursor to Spike 2's cloud job table.
5. The `Job` + `Slice` data model maps cleanly: one job per Generate click, one slice per boundary, slice status drives the progress bar, aggregated slices collapse to `LayoutResponse`. Idempotency follows the exact same UUID-v4 keying pattern already used in `useGenerateLayoutMutation`.
6. Spike 1 UX needs: (a) a pre-click boundary + estimated-time notice using `projectCounts.boundaries` (already wired in `App.tsx`), (b) a per-plot progress list during compute once SSE or local polling is in place, (c) a best-effort cancel button, (d) a relabeled "AC cable trench" field. No new UI primitives are required — `Dialog`, `Button`, and the existing skeleton patterns in `SummaryPanel` are sufficient.

One surprise: the `layout()` handler is a synchronous `def`, not `async def`. This means uvicorn runs it in a thread pool (not a coroutine). Adding SSE progress requires switching to `async def` with a cooperative background task, which is a non-trivial FastAPI change. The local job-table polling approach avoids this entirely.

---

## 2. Track 1 — Generate-Flow Trace (Current State)

### 2.1 Entry Point

**File:** `apps/desktop/src/auth/useGenerateLayout.ts` (lines 118–253)

The mutation is a `useMutation` from TanStack Query. It is instantiated in `App.tsx` at line 334:

```
const generateLayoutMutation = useGenerateLayoutMutation(
  activeKey, entitlementsClient, sidecarClient, { fetchImpl: ... }
)
```

The user trigger is `handleGenerate` (App.tsx:371–378), called from `LayoutPanel`'s `onSubmit` handler (LayoutPanel.tsx:96–102). The button at LayoutPanel.tsx:284–302 passes `generating={layoutMutation.isPending}` — the button text flips to "Generating…" and the button is disabled while the mutation is in flight. There is no progress bar, no cancel affordance, and no per-plot indication.

### 2.2 Four-Stage Chain

The `mutationFn` (useGenerateLayout.ts:130–215) executes four stages sequentially:

**Stage 1 — B16 atomic debit + Run row + presigned upload URL** (lines 144–167)

`client.createRunV2(licenseKey, vars.projectId, { name, params, inputsSnapshot, billedFeatureKey, idempotencyKey })` — wrapped in `withIdempotentRetry`. Returns `{ run, upload: { uploadUrl, blobUrl } }`. This is the only stage with retry logic. If this fails with 402, the mutation fails before the sidecar is even called.

**Stage 2 — Sidecar `/layout`** (lines 169–173)

```
const layoutResult = await sidecar.runLayout(vars.parsedKmz, vars.params)
```

Single-shot `POST /layout` with no retry. The sidecar client (`sidecar-client/src/index.ts:384–395`) serializes `{ parsed_kmz, params }` as JSON and `await`s the response. The connection stays open for the entire duration of the computation — potentially 4–7 minutes for a large multi-plot input. If the fetch times out (Tauri HTTP plugin or OS TCP idle timeout), the mutation surfaces a generic error. There is no progress signal.

**Stage 3 — S3 PUT result JSON** (lines 175–185)

Single-shot PUT of `JSON.stringify(layoutResult)` bytes to the presigned URL from Stage 1.

**Stage 4 — Best-effort thumbnail** (lines 188–209)

`void renderAndUploadThumbnail(...)` — fire-and-forget. Calls `sidecar.renderLayoutThumbnail(layoutResult[0])` then `client.getRunResultUploadUrl(...)` then PUT. Failure here does not fail the mutation.

### 2.3 State Application on Success

`onSuccess` (lines 217–252):

1. `setResult(data.layoutResult, data.run.id)` — writes to `useLayoutResultStore` (state/layoutResult.ts:38–45). `result` is `LayoutResult[]`. MapCanvas and SummaryPanel subscribe via narrow selectors.
2. `addRun(slice)` + `selectRun(data.run.id)` — writes to `useProjectStore` (state/project.ts:115–161).
3. `queryClient.invalidateQueries(["entitlements", key])` — refreshes quota chip.
4. `queryClient.invalidateQueries(["projects", key])` — refreshes RecentsView listing.

### 2.4 Sidecar IPC

**Spawn mechanism:** `apps/desktop/src-tauri/src/sidecar.rs` (lines 78–238). In dev mode, Tauri spawns `.venv/bin/python -m pvlayout_engine.main` directly. In release, it resolves the embedded `pvlayout-engine` binary via `shell.sidecar("pvlayout-engine")`. The sidecar writes `READY { "ready": true, "host": "127.0.0.1", "port": N, "token": "...", "version": "..." }` to stdout. Tauri parses this line (sidecar.rs:260–266) and populates `SidecarConfig`. React calls `invoke("get_sidecar_config")` (lib.rs:22–41) which polls the `RwLock<ConfigState>` every 500ms with a 30s timeout.

**Transport:** Plain HTTP via `createSidecarClient` (sidecar-client/src/index.ts:354–466). Base URL is `http://127.0.0.1:<port>`. All requests carry `Authorization: Bearer <token>`. The fetch implementation in Tauri runtime is `tauriFetch` (Tauri HTTP plugin) rather than browser `fetch` — Tauri's plugin has different timeout defaults.

**Token:** 32-char alphanumeric generated by `generate_session_token()` (sidecar.rs:250–257) per session. Passed to the sidecar via `PVLAYOUT_SIDECAR_TOKEN` env var, enforced by `require_bearer_token` (server.py:74–89).

### 2.5 Sidecar Handler — Confirmed Synchronous

**File:** `python/pvlayout_engine/pvlayout_engine/routes/layout.py` (lines 150–205)

```python
@router.post("/layout", response_model=LayoutResponse, ...)
def layout(request: LayoutRequest) -> LayoutResponse:
```

`def layout(...)` — not `async def`. Under uvicorn with `anyio`, synchronous handlers run in a thread pool (the anyio worker thread pool, default size = `min(32, os.cpu_count() + 4)`). The handler blocks its thread for the entire compute duration. There is no yield, no progress emission, no cooperative cancellation.

The parallel dispatch (Change B, lines 186–196) runs `ProcessPoolExecutor.map` inside the synchronous handler — this works because the thread pool thread blocks while the executor works, but the uvicorn event loop is free to handle other requests during that time. This is an important nuance: the sidecar can serve other requests (e.g. `/health`) while a layout is running, but only because uvicorn's event loop is not blocked — the blocking is on the thread pool thread.

### 2.6 Progress UI — Current State

The only "working" signal is the Generate button text change to "Generating…" (LayoutPanel.tsx:291) and the `SummaryPanel` skeleton grid (SummaryPanel.tsx:37–50). There is no time estimate, no plot-level progress, no cancel button. The StatusBar (`packages/ui/src/compositions/StatusBar.tsx`) has no "computing" state. The mutation's `isPending` is the only signal — a boolean flip with no granularity.

### 2.7 Async Touchpoints for Spike 2

Every one of the four stages would change under Spike 2:

| Stage | Current | Spike 2 |
|---|---|---|
| B16 debit | Synchronous REST call | Same, but job row now carries the Run ID from a V2 job endpoint |
| Sidecar `/layout` | Blocking POST, response = final result | Replaced by `POST /v2/jobs` → returns `job_id`; client polls `GET /v2/jobs/<id>` |
| S3 PUT result | Client-side after sidecar returns | Sidecar (Lambda/Fargate) PUTs directly to S3 on completion |
| Thumbnail | Fire-and-forget on client | Triggered server-side after all slices complete |

---

## 3. Track 2 — Per-Plot Independence Verification

### 3.1 `run_layout_multi` Decomposition

**File:** `python/pvlayout_engine/pvlayout_core/core/layout_engine.py` (lines 259–300)

```python
def run_layout_multi(boundaries, params, centroid_lat, centroid_lon):
    results = []
    for i, b in enumerate(boundaries):
        r = run_layout(boundary_wgs84=b.coords, obstacles_wgs84=b.obstacles,
                       params=params, centroid_lat=centroid_lat,
                       centroid_lon=centroid_lon, boundary_name=name,
                       line_obstructions_wgs84=b.line_obstructions,
                       water_obstacles_wgs84=water_obs)
        results.append(r)
    return results
```

Each call to `run_layout(...)` (lines 46–256) is completely independent:
- Takes a single `boundary_wgs84` ring + its own `obstacles_wgs84` + `line_obstructions_wgs84` + `water_obstacles_wgs84`.
- Projects to UTM, builds `usable_polygon`, places tables, places ICRs.
- Returns a self-contained `LayoutResult` dataclass.
- No shared mutable state between iterations. `results` is built by appending to a local list.
- The shared inputs `params`, `centroid_lat`, `centroid_lon` are read-only across all iterations.

**Key finding:** `run_layout_multi` is embarrassingly parallel at the boundary level. Each `run_layout` call only needs its own `BoundaryInfo` + the shared read-only `LayoutParameters`. The `centroid_lat`/`centroid_lon` are the plant-wide centroid and are identical for all boundaries — they drive UTM zone selection, which is the same for the entire plant.

### 3.2 Inputs to One Plot's Pipeline

A complete `(boundary, params)` tuple is self-sufficient:

```
BoundaryInfo:
  .name: str
  .coords: List[(lon, lat)]       -- the outer ring
  .obstacles: List[List[(lon,lat)]]
  .water_obstacles: List[List[(lon,lat)]]
  .line_obstructions: List[List[(lon,lat)]]

LayoutParameters: (shared, read-only)
  -- all fields documented in pvlayout_core/models/project.py:65–115

centroid_lat: float  -- plant-wide centroid (read-only)
centroid_lon: float  -- plant-wide centroid (read-only)
```

After `run_layout_multi` returns, each `LayoutResult` carries its own `usable_polygon` (Shapely geometry), `placed_icrs`, `placed_tables`, `tables_pre_icr`, `boundary_polygon`, and `utm_epsg`. The per-plot pipeline (`place_lightning_arresters` + `place_string_inverters`) reads only from `result.*` — no shared state.

### 3.3 `LayoutResult` Serialization

The `@dataclass LayoutResult` (project.py:341–395) is serializable across processes by default. The `usable_polygon` and `boundary_polygon` are Shapely 2.x geometry objects — Shapely 2.x uses WKB-based cross-process serialization, confirmed working. The POC's Change B (`ProcessPoolExecutor`) validates this empirically: no serialization errors were observed across 6-plot `complex-plant-layout.kmz`.

For SQS/Lambda slicing, the serialization path would be:
- `BoundaryInfo` → JSON (it's just lists of float tuples + strings — trivially serializable).
- `LayoutParameters` → JSON (a Pydantic model on the sidecar side, already serializable via `params_to_core`).
- Result back from Lambda → `LayoutResult` → JSON via `adapters.result_from_core(r)` → the same `schemas.LayoutResult` Pydantic model the sidecar already uses for its HTTP response.

**No new serialization work is needed.** The sidecar's existing Pydantic schemas (`schemas.py`) and `adapters.result_from_core` already produce the wire format. A Lambda would call the same functions and serialize with the same adapter.

### 3.4 Cross-Plot Dependency Search

The `string_inverter_manager` module-level globals (`_vis_cache_*`, `_prep_cache`, `_pattern_counts`, `_path_ok_count`) are all process-local. The comment at string_inverter_manager.py:148–152 explicitly notes:

> "The graph is rebuilt lazily: on the first Pattern V hit per `place_string_inverters` call. All subsequent V hits in the same call reuse the cached graph (N² construction amortised across the ~15 V cables expected). `_reset_vis_cache` is called at the top of `place_string_inverters` to avoid any stale state from prior calls."

In a `ProcessPoolExecutor` (Change B), each worker process gets its own copy of these module-level globals via `spawn` (default on macOS). So even if P1 and P2 run `place_string_inverters` simultaneously in separate processes, they each have their own `_vis_cache_*` — no contention, no corruption.

**Confirmed:** zero cross-plot shared mutable state during compute.

### 3.5 Aggregation — Front-End Consumption

The sidecar returns `LayoutResponse` (schemas.py) with `results: List[LayoutResult]` — a flat ordered list, one per boundary.

The front end receives this at `sidecar.runLayout(...)` → `Promise<LayoutResult[]>` (sidecar-client/src/index.ts:386–395). The `results` array is stored verbatim in `useLayoutResultStore` as `LayoutResult[]` (state/layoutResult.ts). `SummaryPanel.tsx:158–210` aggregates by iterating `for (const r of results)` — order-independent summation of scalars.

**Observation:** `MapCanvas` renders each boundary's tables/ICRs/cables from the corresponding `LayoutResult` index. Order matters for matching `LayoutResult[i]` to `ParsedKMZ.boundaries[i]` (same index = same boundary). A Spike 2 aggregator must preserve order when reassembling slices. Since boundary index is known at dispatch time, this is straightforward: `results.sort(key=lambda s: s.slice_index)` before response assembly.

---

## 4. Track 3 — Pre-Flight Estimation Feasibility

### 4.1 `parse_kmz` Speed

**File:** `python/pvlayout_engine/pvlayout_core/core/kmz_parser.py` (lines 229–398)

`parse_kmz(path)` reads a KMZ file (zip), parses XML, classifies polygons via Shapely containment (O(n²) in polygon count, where n is typically 2–20), computes centroid. The POC document notes "~0.01s on complex-plant" — this aligns with the code: for a KMZ with 6 boundaries and ~10 obstacles, the O(n²) polygon containment loop has at most ~256 iterations, each being a Shapely `contains` check on small polygons.

The sidecar's `/parse-kmz` endpoint (routes/layout.py:82–142) adds multipart upload + disk spill overhead, but the parse itself is sub-100ms.

### 4.2 KMZ-Derived Signals for Cost Prediction

After `parse_kmz` completes, the `ParsedKMZ` wire object carries:

```
ParsedKMZ:
  boundaries: List[ParsedBoundary]  -- one per plant boundary
    .name: str
    .coords: List[(lon, lat)]        -- outer ring vertex count
    .obstacles: List[List[(lon,lat)]]
    .water_obstacles: List[List[(lon,lat)]]
    .line_obstructions: List[List[(lon,lat)]]
  centroid_lat: float
  centroid_lon: float
```

Signals derivable immediately from this structure, before any layout computation:

| Signal | Derivation | Cost correlation |
|---|---|---|
| `n_boundaries` | `len(parsed.boundaries)` | Linear multiplier on total work |
| `boundary_area_deg2` | Shoelace formula on each `b.coords` ring | Rough proxy for table count |
| `vertex_count_max` | `max(len(b.coords) for b in boundaries)` | Proxy for polygon complexity → Pattern V vis-graph build time |
| `obstacle_count` | Sum of `len(b.obstacles) + len(b.water_obstacles)` | Additive to usable-poly subtraction |
| `line_obstruction_count` | `sum(len(b.line_obstructions) for b in boundaries)` | Additive |

The **dominant cost** is the per-plot cable routing, which scales roughly as `O(N_inverters × routing_complexity)`. `N_inverters` is approximately `boundary_area / (ICR_MWP_PER_UNIT × inverter_capacity_kwp)` — which requires knowing table density, which requires running the layout engine. So a pure-parse estimate is inherently approximate.

### 4.3 Fast Table-Count Pass

`enable_cable_calc=False` gives table + ICR counts without cable routing. On `phaseboundary2.kmz` (single plot, 611 tables) this takes well under 1 second (the baseline timing shows cables take ~4.69s of the ~5s total; without cables, the cost is the table-grid sweep + ICR placement which is negligible).

A fast pass strategy:
1. Parse KMZ → boundary count + rough area.
2. Run `run_layout_multi` + `place_lightning_arresters` with `enable_cable_calc=False` on all boundaries.
3. Inspect `result.num_string_inverters` (already computed, string_inverter_manager.py:1323) for each boundary.
4. Derive estimate: `estimated_cable_time_s ≈ sum(f(num_inverters_i, polygon_complexity_i) for each boundary i)`.

The function `f` can be a simple lookup table calibrated from benchmark data:
- < 100 inverters → ~5–15s
- 100–300 inverters → ~30–90s
- 300–500 inverters → ~120–270s (the P2 case)
- > 500 inverters → cloud-offload recommended

### 4.4 Recommended Executor Decision Tree

```
parsed_kmz → fast_pass (no-cable) → per_boundary_inverter_counts
  → max_boundary_inverters = max(counts)
  → total_inverters = sum(counts)
  → n_boundaries = len(boundaries)

if n_boundaries == 1 and max_boundary_inverters < 100:
    executor = "local"   # < 15s, no progress UI needed
elif n_boundaries == 1 and max_boundary_inverters < 400:
    executor = "local-with-progress"  # 30–120s, show Spike 1 progress UI
else:
    executor = "cloud-lambda"  # > 120s or multi-plot with large boundaries
```

This maps onto the Spike 1 / Spike 2 capability split naturally.

### 4.5 StatusBar Boundary Count Wire Path

`projectCounts` is computed at App.tsx:313–319:

```typescript
const projectCounts = useMemo(
  () => (project ? countKmzFeatures(project.kmz) : null),
  [project]
)
```

`countKmzFeatures` is defined in `apps/desktop/src/project/kmzToGeoJson.ts:92–108`. It returns `{ boundaries, obstacles, lines }` where `boundaries = parsed.boundaries.length`. This is passed to `StatusBar` as `leftMeta` (App.tsx:1330–1344) and rendered as e.g. "6 boundaries · 4 obstacles". The value is already available in the UI before the user clicks Generate. Spike 1 can read `projectCounts.boundaries` directly to show the pre-click notice.

---

## 5. Track 4 — Sidecar IPC and Progress Feedback Options

### 5.1 Current IPC Pattern

The sidecar is a single-process FastAPI app running under uvicorn (`main.py:133–163`). Uvicorn listens on a random loopback port negotiated at startup via `resolve_config()`. The port is communicated to the Rust shell via the `READY { ... }` stdout line (sidecar.rs:176–192). Subsequent calls from React go through the `SidecarClient` (sidecar-client/src/index.ts) over plain HTTP.

The sidecar is bound to `127.0.0.1` only (server.py:59–66 — CORS middleware, uvicorn bind in main.py:155–162). Only the Tauri WebView can reach it.

### 5.2 Option A — SSE Streaming from the Sidecar

FastAPI supports `StreamingResponse` with `text/event-stream`. The `layout()` handler would need to be rewritten as `async def` returning a `StreamingResponse` that yields progress events as each plot completes.

Challenges:
- The current handler is `def layout(...)` (synchronous). Uvicorn runs it in a thread-pool thread. `StreamingResponse` requires `async def` — a non-trivial refactor.
- The `ProcessPoolExecutor.map` call in Change B blocks until all workers are done. To yield per-plot progress, the handler would need `executor.submit` (not `executor.map`) with `as_completed` iteration, and yield an SSE event after each future completes.
- The React client (`sidecar.runLayout`) currently `await`s a `response.json()` call — it does not handle streaming. A new SSE-aware method would need to be added to `SidecarClient`.
- The Tauri HTTP plugin (`tauriFetch`) may not natively support SSE/ReadableStream. Worth confirming before committing to SSE.

Feasibility: achievable but medium-complexity. Most of the complexity is on the React side (EventSource or fetch+ReadableStream within the Tauri WebView) rather than the Python side.

### 5.3 Option B — Local Job-Status Table (Mini-Cloud Pattern)

The sidecar maintains an in-process job table (a Python dict, keyed by job ID). The workflow:

1. `POST /layout` returns immediately with `{ job_id: "uuid" }`.
2. The actual compute runs in a background thread (or via `ProcessPoolExecutor`, already in place for Change B).
3. As each plot completes, the background thread updates `job_table[job_id].plots[i] = { status: "done", result: ... }`.
4. React polls `GET /layout/jobs/<id>` every 1–2 seconds. Response includes per-plot status + aggregate completion fraction.
5. When all plots are done, `GET /layout/jobs/<id>` returns the complete `LayoutResponse`.

This pattern is:
- Much lower risk than SSE — uses the existing JSON request/response pattern with no new protocol.
- A structural preview of Spike 2's cloud job table.
- Compatible with the current synchronous handler style (background thread does compute; `POST /layout` becomes nearly instant).
- Cancellable: `DELETE /layout/jobs/<id>` sets a `cancelled` flag; the background thread checks it cooperatively at the start of each plot's `place_string_inverters`.

The in-process job table would not survive sidecar restart, but that's acceptable — if the sidecar restarts mid-job, the user retries.

### 5.4 Progress Contract

Best-effort per-plot granularity:

```json
GET /layout/jobs/<id>
{
  "job_id": "uuid",
  "status": "running",
  "plots_total": 6,
  "plots_done": 2,
  "plots": [
    { "index": 0, "name": "P1_A", "status": "done" },
    { "index": 1, "name": "P1_B", "status": "done" },
    { "index": 2, "name": "P2",   "status": "running" },
    { "index": 3, "name": "P3_A", "status": "pending" },
    { "index": 4, "name": "P3_B", "status": "pending" },
    { "index": 5, "name": "P4",   "status": "pending" }
  ],
  "result": null
}
```

Backward-compatible: when `status === "done"`, the `result` field carries the same payload as today's synchronous `/layout` response. React can use this in both the polling path (Spike 1) and as the model for Spike 2's cloud status endpoint.

### 5.5 Cancellation Semantics

`ProcessPoolExecutor.cancel()` only cancels futures that have not yet started. Once `place_string_inverters` is running in a worker process, it cannot be cancelled by `Future.cancel()` — Python docs are explicit. The cooperative approach is:

1. Set `job_table[job_id].cancelled = True`.
2. Each plot's worker function checks this flag at the top (before starting `place_string_inverters`).
3. Plots already running in workers complete or hit the timeout; newly-dispatched plots are skipped.
4. The endpoint returns a partial result with only the completed plots.

User-facing contract: "Cancel requested. Completed plots will be shown; ongoing plot may take a few more seconds to finish." This is honest and matches what Change B's `ProcessPoolExecutor` can actually deliver.

---

## 6. Track 5 — Job/Slice Data Model (Spike 2 Requirements)

### 6.1 Overview

Spike 2 introduces a cloud compute model where each Generate click creates a persistent `Job` that fans out to N `Slice` executions (one per boundary), dispatched to AWS Lambda (or ECS Fargate for heavy plots). The desktop polls for completion and reassembles results.

The data model below is what this repo (desktop + sidecar) needs to produce and consume. The SQL DDL is owned by the `renewable_energy` repo.

### 6.2 Job Row

Fields this side will produce at job creation time:

| Field | Type | Source | Notes |
|---|---|---|---|
| `id` | UUID | backend-generated | Returned in job creation response; desktop polls on this |
| `license_key` | string | `activeKey` from `useEntitlementsQuery` | Identifies the user |
| `project_id` | string | `currentProject.id` | Same `prj_*` semantic ID as existing backend |
| `run_id` | string | From B16 response | Links to the Run row; same debit model as today |
| `kmz_blob_url` | string | `currentProject.kmzBlobUrl` | S3 key for the input KMZ; Lambda re-downloads |
| `kmz_sha256` | string | `currentProject.kmzSha256` | Content-addressed input; Lambda verifies before compute |
| `params_json` | JSONB | `LayoutParameters` serialized | Lambda deserializes and passes to `run_layout` + `place_string_inverters` |
| `status` | enum | server-managed | `"pending" | "running" | "done" | "failed" | "cancelled"` |
| `created_at` | timestamp | server | ISO 8601 |
| `completed_at` | timestamp | server | Set when all slices are `done` or `failed` |
| `idempotency_key` | UUID | UUID v4 from `generateIdempotencyKey()` | Same `@@unique([userId, idempotencyKey])` pattern as B16 |

### 6.3 Slice Row

One slice per `ParsedKMZ.boundaries[i]`:

| Field | Type | Source | Notes |
|---|---|---|---|
| `id` | UUID | backend-generated | |
| `job_id` | UUID FK | parent Job | |
| `boundary_index` | int | 0-based index into `parsed_kmz.boundaries` | Order-preserving for reassembly |
| `boundary_name` | string | `BoundaryInfo.name` | For display in per-plot progress |
| `status` | enum | server-managed | `"pending" | "running" | "done" | "failed"` |
| `executor` | string | dispatch time | `"local" | "lambda:<arn>" | "fargate:<task>"` |
| `result_blob_url` | string | Lambda POST-completion | S3 key for `schemas.LayoutResult` JSON |
| `engine_version` | string | Lambda env var | Python version + Shapely version + image digest; enables drift detection |
| `started_at` | timestamp | Lambda start | |
| `ended_at` | timestamp | Lambda completion | |
| `error_detail` | string | nullable | Lambda exception message if status=failed |

### 6.4 Single-Plot KMZ Mapping

A KMZ with one boundary = `Job` with one `Slice`. The slice can run locally (executor = "local") or on Lambda. The Job/Slice model is identical — the executor is just a label. The desktop can use the same polling flow regardless of where the work ran.

### 6.5 Front-End Polling Design

```
GET /v2/jobs/<id>
→ { job: Job, slices: Slice[] }

Polling interval: 2s while any slice is "pending" | "running"
Stop polling when: job.status === "done" | "failed" | "cancelled"
```

Alternatively, a dedicated `GET /v2/jobs/<id>/slices` endpoint allows the desktop to stream granular updates without fetching the full result blob on every poll.

When `job.status === "done"`, the desktop:
1. Fetches each `slice.result_blob_url` (presigned S3 GET).
2. Deserializes each `schemas.LayoutResult` JSON.
3. Reassembles `results.sort(key=lambda s: s.boundary_index)`.
4. Calls `setResult(layoutResult, runId)` — identical to today's `onSuccess` path.

### 6.6 Idempotency

The idempotency-key pattern is already in place for B16 (`useGenerateLayout.ts:143`, `idempotency.ts:30`). Spike 2 reuses the same key:

- `generateIdempotencyKey()` generates one UUID v4 per user-initiated Generate click.
- This key is sent with the job creation request.
- Backend's `@@unique([userId, idempotencyKey])` on the Job table deduplicates re-clicks.
- Re-clicking Generate with an in-flight job returns the existing Job (same ID) + fresh presigned URLs.

No new pattern needed.

### 6.7 Engine Versioning

Each Lambda image is built with a specific `pvlayout_core` SHA (from the repo) and specific Shapely/Numpy versions. The Lambda sets `PVLAYOUT_ENGINE_VERSION` as an env var of the form `pvlayout_core:<sha>+shapely:<version>`. This is written to `slice.engine_version` at slice start. The backend can detect cross-executor drift (e.g., plot 1 ran on Lambda image v1.2, plot 2 on v1.3) and surface a warning.

This also enables the future "re-run specific slice with updated engine" operation without re-running the whole job.

---

## 7. Track 6 — UX Hygiene Proposal (Spike 1 Details)

### 7.1 Pre-Click Expectation Setting

**Data available before Generate:** `projectCounts.boundaries` is already in scope at App.tsx:313–319. After the Spike 1 fast-pass (`enable_cable_calc=False` layout), we also have `result.num_string_inverters` per boundary.

**Where to surface:** An inline notice below the Generate button, appearing after KMZ load and before the first Generate click. Should:

1. Show boundary count: "This KMZ has 6 boundaries."
2. Show estimated time based on fast-pass inverter counts: "Estimated ~4–6 min with cable calculation."
3. Recommend cloud if over the local threshold: "For plants this size, cloud offload is faster — (enable in Settings)."

Implementation: a small `<p>` or `<Chip>` below the Generate button in `LayoutPanel.tsx` (around line 296). The notice uses `projectCounts.boundaries` (already a prop/store subscription) + the fast-pass result (a new state slice or derived from `useLayoutResultStore` with `enable_cable_calc=false`).

The fast-pass result requires a new sidecar call with `enable_cable_calc=false`. This could be triggered automatically on KMZ load (a `useEffect` that fires `sidecar.runLayout(parsedKmz, { ...params, enable_cable_calc: false })`). Wall-clock cost: well under 2 seconds even for complex-plant.

### 7.2 During-Compute Progress

**Floor (Spike 1 without local job table):** The button text "Generating…" is the floor. Add an animated spinner icon (Lucide's `Loader2` with `animate-spin`) inside the button alongside the text.

**Better (Spike 1 with local job table or SSE):** A per-plot progress list in the inspector. Replace the `SummaryPanel` skeleton with a "Generating…" section showing:

```
Generating layout (2 / 6 boundaries complete)
  P1_A  [done]
  P1_B  [done]
  P2     [running...]
  P3_A  [waiting]
  P3_B  [waiting]
  P4     [waiting]
```

This maps directly to the `GET /layout/jobs/<id>` polling response from Track 4. The component uses:
- `Loader2` (Lucide) for running items.
- A checkmark icon for done items.
- Plain text for waiting items.

No new UI primitives required. `InspectorSection` + `PropertyRow` from `packages/ui/src/compositions/Inspector.tsx` (exported at index.ts:138) provide the right density.

### 7.3 Cancel Button

Add a "Cancel" button adjacent to the Generate button while `generating === true`. Uses the existing `Button` variant `ghost` or `subtle`:

```tsx
{generating && (
  <Button type="button" variant="ghost" size="md" onClick={handleCancel}>
    Cancel
  </Button>
)}
```

`handleCancel` calls `DELETE /layout/jobs/<id>` (local job table pattern) or simply calls `generateLayoutMutation.reset()` (which abandons the TanStack mutation — sidecar continues but the result is discarded).

For the pre-local-job-table Spike 1 path: `generateLayoutMutation.reset()` is sufficient. The sidecar continues computing but the response is dropped. The user sees the Generate button re-enable immediately. This is honest: "the layout is being abandoned from your perspective; it may finish in the background but the result won't appear."

### 7.4 Failure UX

When `enable_cable_calc=True` and one plot fails (exception caught at layout_engine.py:294–298), the sidecar returns an error-tagged `LayoutResult` with `boundary_name = "P2 [ERROR: ...]"` and empty geometry arrays. The front-end `SummaryPanel` aggregates across all results — the error plot contributes 0 tables, 0 MWp.

Under the parallel path (Change B), a worker exception propagates through `ProcessPoolExecutor.map` as a re-raise in the main thread. The entire `layout()` handler returns a 500.

For Spike 1, the recommendation is: catch per-plot exceptions in Change B's worker, tag the `LayoutResult` with an error sentinel (matching the error-path at layout_engine.py:294–298 — already in place for `run_layout_multi`), return partial results. Show: "5 of 6 boundaries completed. P2 failed: [error message]. Partial layout shown."

This requires the `_run_per_plot_pipeline` worker (layout.py:208–219) to catch exceptions and return an error-tagged `LayoutResult` rather than raising.

### 7.5 "AC Cable Trench" Relabel

The field labeled "Calculate cables" in `LayoutPanel.tsx` (line 343–375, `CableCalcFieldRow`) toggles `enable_cable_calc`. The current label is technically correct for the toggle itself, but the user-facing concept being controlled is the "AC cable trench routing" (the MST routing through the plant). The relabel to "Calculate AC cable trench" (or simply "AC cable routing") is a one-line change in `CableCalcFieldRow` (LayoutPanel.tsx:354).

### 7.6 Existing UI Primitives Available

From `packages/ui/src/index.ts`:
- `Button` — for Cancel and Generate.
- `Dialog`, `DialogContent`, `DialogOverlay` — for the pre-click expectation dialog (if a modal is preferred over inline notice).
- `InspectorSection`, `PropertyRow`, `SummaryStat`, `StatGrid` — for per-plot progress list.
- `Chip` — for boundary count + estimated time badges.
- `Toast`, `ToastProvider` — for non-blocking failure notification.
- Framer Motion via `motion` export — for progress animation (existing `layerToggle` variant at `lib/motion.ts`).

No new components needed for Spike 1.

---

## 8. Risks and Unknowns

### 8.1 Tauri HTTP Plugin and Long-Lived Connections

The `tauriFetch` (Tauri's `tauri-plugin-http`) wraps the OS HTTP stack (WinHTTP on Windows, NSURLSession on macOS, hyper on Linux via the plugin's Rust impl). Long-held connections (4–7 minutes for a large multi-plot layout) may hit OS-level TCP idle timeouts or the plugin's own timeout configuration. Not verified. If `tauriFetch` has a default timeout shorter than the longest expected compute time, Stage 2 of the Generate chain will fail silently (from the user's perspective) even if the sidecar completes successfully.

**Action for cross-repo:** Verify `tauri-plugin-http` timeout defaults. Set `timeout_secs` to at least 900s (15 min) in the sidecar client's fetch config for the `/layout` call. The local job-table approach (Option B in Track 4) eliminates this risk entirely — the job creation request returns in milliseconds.

### 8.2 ProcessPoolExecutor Spawn on PyInstaller Bundle

Change B uses `ProcessPoolExecutor` with the `spawn` start method (macOS default). PyInstaller bundles set `sys.frozen = True` and manipulate `sys.path`. The `spawn` method in a frozen binary requires that the worker process can re-import the same module — which under PyInstaller means re-unpacking `_MEIPASS`. Not tested in the POC against the bundled binary (only `uv run` was tested). Risk: worker processes may fail to import `pvlayout_core` in the bundle context.

**Mitigation:** Explicitly set `mp_context = multiprocessing.get_context("spawn")` and add a `freeze_support()` call in `pvlayout_engine/main.py`. Test with `bun run tauri build` before shipping Change B in production.

### 8.3 Windows-Specific Process Pool Behavior

On Windows, `spawn` is the only available start method (no `fork`). The overhead per worker spawn on Windows is typically 300–600ms (slower than macOS). For a 2-plot input where each plot takes 5s, the 600ms overhead is 12% — acceptable. For a 6-plot input the overhead is amortized across the slowest plot. Not benchmarked on Windows.

### 8.4 Fast-Pass Complexity for Irregular Multi-Component Boundaries

The fast-pass (`enable_cable_calc=False`) runs `run_layout_multi` synchronously in the main handler thread. For `complex-plant-layout.kmz` with 6 boundaries, this is the table-placement sweep + ICR placement for all 6 boundaries. The table sweep is O(usable_area / table_area) grid iteration — for 10,771 tables, this takes roughly 0.5–2 seconds. Acceptable for pre-click estimation. But for a KMZ with 20+ boundaries, the fast-pass itself could become slow. Track this.

### 8.5 Idempotency Key Scope for Multi-Stage Spike 2 Flow

Today's idempotency key scopes to the B16 + Run row. Under Spike 2, the same key would need to scope to the Job row AND all its Slices. If the desktop re-submits with the same key (because it lost the job ID from a restart), the backend must return the existing Job + allow polling to resume. The `renewable_energy` session needs to design this carefully — naive "return existing Job" is correct, but it also needs to handle the case where Job exists but Slices haven't been dispatched yet (idempotent dispatch).

### 8.6 SSE in Tauri WebView

If SSE (Option A in Track 4) is chosen, the behavior of `EventSource` in Tauri's OS-native WebView needs to be confirmed on all three platforms (Windows WebView2, macOS WKWebView, Linux WebKitGTK). Some WebView implementations have strict CSP or origin requirements for EventSource connections. The loopback token-gated URL `http://127.0.0.1:<port>/layout/stream/<id>` may need explicit CSP relaxation in `tauri.conf.json`.

---

## 9. Cross-Repo Confirmation Punch List

These are questions for the `renewable_energy` Claude Code session before Spike 2 design is finalized:

1. **Job table location:** Is the `Job` / `Slice` table in `mvp_db` (Prisma + Postgres) or a separate DynamoDB table? Given the polling pattern (potentially thousands of polls per job over 5 minutes), DynamoDB's read pricing may be preferable. Postgres with an index on `(job_id, status)` is fine for low volume but may need caching in front at scale.

2. **Lambda dispatch mechanism:** Does the backend dispatch Slices via SQS (Lambda trigger) or direct Lambda invoke? SQS gives better retry semantics. Direct invoke gives lower latency for small plants. The slice status update (Lambda → backend) can be either a webhook or a direct Postgres UPDATE from the Lambda (if the Lambda has network access to RDS).

3. **KMZ re-download by Lambda:** The Lambda needs the raw KMZ bytes (to call `parse_kmz`) or the already-parsed `ParsedBoundary` JSON. Passing the parsed JSON (rather than the full KMZ) is smaller and avoids the KMZ download. The `ParsedBoundary` wire schema is already defined in `pvlayout_engine/schemas.py` (`BoundaryInfo`). Confirm whether the backend should store the `ParsedKMZ` JSON alongside the KMZ blob.

4. **Presigned URL lifetime for result upload:** Each Slice's Lambda function will PUT its `LayoutResult` JSON to S3 via a presigned URL. This URL needs to be minted before the Lambda is dispatched (or by the Lambda itself using an IAM role). Confirm: does the Lambda use an IAM role with `s3:PutObject` on the results bucket directly, or does it call back to `mvp_api` to mint a presigned URL?

5. **Job creation atomicity with B16:** Today, B16 (`POST /v2/projects/:id/runs`) atomically debits + creates the Run row. Under Spike 2, job creation + debit + Run creation must still be atomic. Confirm whether this is a new `POST /v2/projects/:id/jobs` endpoint (separate from B16's `runs`) or an extension of B16 that also creates the Job and Slices.

6. **Tauri-plugin-http timeout:** What is the default request timeout for `tauri-plugin-http` on each platform? Can it be configured per-request? This affects whether the blocking `/layout` call (pre-Spike-2) can hold open for 7+ minutes or needs the job-table approach regardless.

7. **`mvp_api` Lambda invocation IAM policy:** If the backend (Vercel Node.js) dispatches to AWS Lambda, it needs AWS credentials. Confirm: is the `renewable_energy` deployment already in a position to call `lambda:InvokeFunction` or `sqs:SendMessage`, or does this require new AWS infrastructure provisioning?

---

## 10. Essential Files Reference

**Desktop React:**
- `apps/desktop/src/auth/useGenerateLayout.ts` — four-stage Generate mutation
- `apps/desktop/src/App.tsx` (lines 329–379) — `handleGenerate` wiring + `layoutMutation.isPending` propagation
- `apps/desktop/src/panels/LayoutPanel.tsx` (lines 282–302) — Generate button and `generating` prop
- `apps/desktop/src/panels/SummaryPanel.tsx` — skeleton patterns during compute
- `apps/desktop/src/project/kmzToGeoJson.ts` (lines 92–108) — `countKmzFeatures` producing boundary count for StatusBar
- `apps/desktop/src/state/layoutResult.ts` — where `LayoutResult[]` lands post-Generate
- `apps/desktop/src/auth/idempotency.ts` — idempotency key generation + retry policy

**Sidecar client:**
- `packages/sidecar-client/src/index.ts` — complete `SidecarClient` interface + wire types

**Tauri Rust shell:**
- `apps/desktop/src-tauri/src/sidecar.rs` — spawn + READY parsing + per-session token
- `apps/desktop/src-tauri/src/lib.rs` — `get_sidecar_config` IPC command

**Python sidecar:**
- `python/pvlayout_engine/pvlayout_engine/routes/layout.py` — `/layout` handler + `_run_per_plot_pipeline` worker
- `python/pvlayout_engine/pvlayout_engine/main.py` — uvicorn entry + READY announcement
- `python/pvlayout_engine/pvlayout_core/core/layout_engine.py` — `run_layout_multi` + `run_layout`
- `python/pvlayout_engine/pvlayout_core/core/string_inverter_manager.py` — `place_string_inverters` + module-level caches + `_seg_ok`
- `python/pvlayout_engine/pvlayout_core/core/kmz_parser.py` — `parse_kmz` + `BoundaryInfo`
- `python/pvlayout_engine/pvlayout_core/models/project.py` — `LayoutResult`, `LayoutParameters`, `CableRun` dataclasses

**UI primitives:**
- `packages/ui/src/index.ts` — complete UI component exports
- `packages/ui/src/compositions/StatusBar.tsx` — current StatusBar (no compute state)
- `packages/ui/src/components/Button.tsx` — Button variants

**POC reference:**
- `docs/post-parity/findings/2026-04-30-002-cable-perf-poc.md` — benchmark data, Change A/B/C details, BOM semantic discussion
