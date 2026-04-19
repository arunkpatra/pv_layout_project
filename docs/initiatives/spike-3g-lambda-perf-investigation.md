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

## Suggested Investigation Order

1. Add Shapely version + GEOS version logging
2. Add per-cable routing pattern logging inside `_route_ac_cable` (which pattern succeeded, attempt count)
3. Profile `place_string_inverters` locally with the same KMZ to get baseline per-phase timing
4. Compare local vs Lambda Shapely geometry operation speed with a microbenchmark
5. If Shapely is confirmed slow on Lambda ARM64, consider precompiled wheels or x86 architecture switch
