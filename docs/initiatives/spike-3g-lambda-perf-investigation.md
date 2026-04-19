# Spike 3g: Lambda Layout Engine Performance Investigation

## Problem Statement

The layout engine Lambda (`layout_engine_lambda_prod`) times out processing layouts that complete in ~30 seconds on a local Mac (M-series ARM64). The same 2.2KB KMZ file that produces 740 tables / 41,440 modules runs indefinitely on Lambda, exceeding both 180s and 600s timeouts.

## Verified Working

The full E2E pipeline is functionally correct:

- API (Vercel/Hono) creates project, version, uploads KMZ to S3, publishes to SQS
- SQS event source mapping triggers Lambda (batch size 1, visibility timeout 1200s)
- Lambda cold start completes in ~3s (init + matplotlib/ezdxf warnings)
- DB operations work cross-region (Mumbai Lambda → Virginia RDS, ~2.2s per call)
- S3 download works (0.2s for 2.2KB KMZ, same-region)
- KMZ parsing: instant (0.0s, 1 boundary)
- `run_layout_multi`: 0.2-0.4s for 740 tables — **fast**
- DB status transitions (QUEUED → PROCESSING) work correctly

## Failing Phase

`place_string_inverters` in `handlers.py` post-processing loop. It runs after `run_layout_multi` and never completes within 600s.

### What `place_string_inverters` does (from `core/string_inverter_manager.py`)

1. **K-means clustering** of 740 tables into inverter groups (`_kmeans_cluster`)
2. **DC cable routing**: loops over all 740 tables, calls `_route_ac_cable()` per table — Manhattan routing with Shapely polygon intersection checks against `usable_polygon`
3. **AC cable routing**: loops over all inverters, calls `_route_ac_cable()` per inverter

The `_route_ac_cable` function tries multiple routing patterns (A, A2, B, C, D, E, F) with Shapely geometry validation for each candidate path. Pattern E does an exhaustive 2-waypoint search through sampled interior points — potentially O(n^2) per cable.

## Observations

| Metric | Local (Mac M2) | Lambda (arm64 Graviton) |
|---|---|---|
| Same KMZ file | Yes (2.2KB) | Yes |
| `run_layout_multi` | ~0.3s | 0.2-0.4s |
| `place_string_inverters` | ~25s (est.) | >600s (timeout) |
| Memory used | N/A | 230MB of 1769MB |
| CPU | Full M2 core | 1 full Graviton vCPU (1769MB) |

## Hypotheses (to investigate)

### H1: Shapely ARM64 Lambda build is slow
Shapely uses GEOS C library for geometry operations. The Lambda ARM64 container image may have a Shapely/GEOS build without SIMD optimizations, or may be using a pure-Python fallback for some operations.

**Test**: Add `import shapely; print(shapely.geos_version)` to Lambda logs. Compare with local. Check if `shapely.speedups` is available.

### H2: `_route_ac_cable` pattern E exhaustive search is pathological
Pattern E tries all combinations of sampled interior points as waypoints. For complex polygons with many tables, the sample count may be very large, causing O(n^2) or worse per cable.

**Test**: Add logging inside `_route_ac_cable` showing which pattern succeeded and how many candidates pattern E tried. Count how many cables fall through to patterns E/F.

### H3: `usable_polygon` geometry is complex
The `usable_polygon` (boundary minus roads) may have many vertices, making every `within()` / `intersection()` call expensive.

**Test**: Log `len(usable_polygon.exterior.coords)` and any holes. Compare local vs Lambda (should be identical for same KMZ).

### H4: Cross-region DB latency compounds
Each DB call is ~2.2s (Mumbai → Virginia). While only 3-4 DB calls total, this adds ~9s overhead. Not the primary issue but worth noting.

**Fix**: Move RDS to `ap-south-1` or use a read replica. Or colocate Lambda in `us-east-1`.

### H5: Python GC / memory pressure
Unlikely given 230MB peak of 1769MB, but GC pauses during heavy object creation (740 cable routing results) could add up.

**Test**: Log `gc.get_count()` before and after `place_string_inverters`.

## Lambda Configuration (current)

- **Function**: `layout_engine_lambda_prod`
- **Region**: `ap-south-1` (Mumbai)
- **Memory**: 1769 MB (1 full vCPU)
- **Timeout**: 600s (10 min)
- **Architecture**: arm64
- **SQS visibility timeout**: 1200s
- **RDS**: `us-east-1` (Virginia) — cross-region

## Environment Variables

- `S3_ARTIFACTS_BUCKET` = `renewable-energy-prod-artifacts`
- `DATABASE_URL` = `postgresql://...journium.cbuwaoikc0qr.us-east-1.rds.amazonaws.com:5432/re_prod?sslmode=require`

## Structured Logs Available

The latest deployed image includes per-phase timing logs in `handlers.py`:
- `db:get_version`, `db:mark_processing`, `s3:download`, `parse_kmz`
- `run_layout_multi` (with table/module counts)
- `place_string_inverters[i]` (per boundary, with table count)
- `place_lightning_arresters[i]`
- `export` (with file sizes), `s3:upload`, `db:mark_complete`

CloudWatch log group: `/aws/lambda/layout_engine_lambda_prod`

## Investigation Results (2026-04-20)

### Instrumented Lambda Run: `ver_bqI0JNWZOM8EnPK0HGnHW68v19n2ZQfnMt81`

Full log saved: `logs/good-but-slow-lamda.txt`

**Environment:** shapely=2.1.2, geos=3.13.1, python=3.13.12, arch=aarch64

**Timing breakdown:**

| Phase | Time | Notes |
|---|---|---|
| Cold start | 4.2s | Init duration |
| db:get_version | 2.2s | Cross-region Mumbai→Virginia |
| db:mark_processing | 2.4s | Cross-region |
| s3:download | 0.3s | 2280 bytes |
| parse_kmz | 0.0s | 1 boundary |
| run_layout_multi | 0.2s | 740 tables, 41440 modules |
| **place_string_inverters** | **563.3s** | **99% of total time** |
| place_lightning_arresters | 0.0s | |
| export (kmz+svg+dxf) | 1.2s | |
| s3:upload (3 files) | 0.2s | |
| db:mark_complete | 2.4s | Cross-region |
| **Total** | **572.3s** | |

### Root Cause: AC Cable Routing Combinatorial Explosion

**DC routing** (table → inverter): 740 cables, all resolved on Pattern A, 740 total `_path_ok` calls. **~2 seconds.** Not the problem.

**AC routing** (inverter → ICR): 74 cables, **5,738,877 total `_path_ok` calls**, worst single cable: **1,037,117 calls**. **~560 seconds.**

| Pattern | Cables | Description |
|---|---|---|
| A | 43 | Fast — 1 check each |
| A2 | 9 | Moderate |
| A3 | 14 | Moderate |
| A4 | 2 | Expensive — gap_ys × col_xs × col_xs |
| E | 1 | Exhaustive 2-waypoint search |
| F | 5 | Fell through all patterns to best-effort |

**Routing grid dimensions:** 113 gap_ys × 49 col_xs. Pattern A4 search space per cable: 113 × 49 × 49 = **271,313 candidates**. The 5 cables reaching Pattern F exhausted all patterns before F, accumulating millions of geometry checks.

### Hypothesis Verdict

- **H1 (Shapely ARM64 slow):** Partially confirmed. Graviton is ~2-2.5x slower per-op than M2, but this only explains 2.5x of the 15x slowdown. Not the primary cause.
- **H2 (Algorithmic explosion):** **CONFIRMED. Primary cause.** 5.7M geometry checks for 74 cables is pathological. The nested loops in A4/B/E compound the per-op slowdown.
- **H3 (Complex polygon):** `poly_verts=0` logged (instrumentation bug — polygon exists but vertex count failed on non-simple geometry type). The polygon IS being used for AC routing. Needs investigation but secondary to H2.
- **H4 (Cross-region DB):** 2.2-2.4s per call, ~9s total. Not material vs 563s.
- **H5 (Python GC):** Not investigated. Irrelevant given H2 finding.

### Fix Strategy

Reduce AC routing `_path_ok` calls from 5.7M to <10K by:
1. Limit `col_xs` to nearest 5-10 in patterns A2, A3, A4, B (currently uses all 49)
2. Cap Pattern E waypoint count or remove the O(n²) two-waypoint search
3. Add early-exit timeout per cable — fall through to Pattern F after N attempts

## Suggested Investigation Order

1. ~~Add Shapely version + GEOS version logging~~ ✅ Done
2. ~~Add per-cable routing pattern logging inside `_route_ac_cable`~~ ✅ Done
3. Profile `place_string_inverters` locally with the same KMZ to get baseline per-phase timing
4. Compare local vs Lambda Shapely geometry operation speed with a microbenchmark
5. ~~If Shapely is confirmed slow on Lambda ARM64, consider precompiled wheels or x86 architecture switch~~ Not needed — algorithmic fix is primary
