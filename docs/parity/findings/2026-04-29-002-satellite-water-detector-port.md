# Finding #002 — Satellite water-body detector port

**Row:** [docs/PLAN.md](../../PLAN.md) row #5 (T3)
**Date:** 2026-04-29
**Author:** Arun (port) — solar-domain decisions captured for Prasanta's end-of-port review
**Status:** committed; deferred review

## Background

Legacy added a satellite water-body detector at
`core/satellite_water_detector.py` (441 lines, new file) on
`baseline-v1-20260429` commit `9362083`. The detector fetches Esri
World Imagery tiles, classifies water pixels, vectorises into shapely
polygons, and returns both rings and a cyan-tinted preview image.
Row #5 ports this verbatim into the new project and exposes it via a
new `POST /detect-water` sidecar route.

## What landed

Verbatim port from legacy. The new file at
`pvlayout_core/core/satellite_water_detector.py` contains exactly the
same logic as legacy, with one defensive change documented below.
Bit-exact `_water_mask` parity verified on a synthetic 256×256 RGB
array (`tests/parity/test_satellite_water_detector_parity.py`) — all
four classifier rules + NDVI exclusion + brightness ceiling +
morphological cleanup produce identical output to legacy.

Sidecar route: `POST /detect-water` accepts a parsed-KMZ payload and
returns per-boundary detected polygon rings + base64 PNG previews.
Sync endpoint (no streaming progress; deferred). Pillow promoted from
transitive to explicit dependency.

## Algorithm summary

The classifier (`_water_mask`) labels a pixel as water if any of
these four rules fire:

1. **Absolute dark.** brightness < 75 AND B ≥ R × 0.80. Catches
   turbid Indian tanks/ponds (near-black appearance).
2. **Locally dark.** brightness < 58 % of 30-px neighbourhood mean
   AND brightness < 110 AND B ≥ R × 0.75. Catches dark ponds
   surrounded by bright red Deccan soil.
3. **Blue-dominant.** B > R × 1.15 AND B > G × 1.05 AND
   brightness < 160. Catches clear reservoirs/lakes.
4. **Turbid grey-brown.** brightness < 90, |R−G| < 25, |R−B| < 30,
   B ≥ R × 0.78. Catches silty water (low colour saturation, dark).

Post-rules exclusions: NDVI proxy > 0.10 → vegetation (excluded);
brightness ≥ 150 → bright surface (excluded). Morphological
clean-up: erosion radius 3, dilation radius 5.

Pipeline: pick zoom (13–17) → stitch tiles into one RGB image →
classify pixels → vectorise mask via 4×4 px cell aggregation →
union → simplify (0.00005 tolerance) → clip to plant boundary →
filter by minimum area (150 m²). Two-zoom union (Z + Z−1) catches
both small ponds and large reservoirs.

## Esri tile dependency + SSL bypass

Detector hits two Esri endpoints in fallback order:

- `server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/...`
- `services.arcgisonline.com/arcgis/rest/services/World_Imagery/...`

SSL certificate verification is disabled. Rationale (legacy
comment): Windows machines often fail HTTPS cert checks silently,
returning None from `urlopen`. Tile downloads are read-only and
low-risk. Ported verbatim.

## Defensive `getattr(b, "is_water", False)` fix

Legacy detector references `boundary.is_water` in two places, but
`BoundaryInfo` has no `is_water` field at the baseline. Reading the
attribute would AttributeError. In practice this never happens
because top-level water-named polygons are now routed to
`water_obstacles[]` by row #4's parser and don't appear in
`boundaries[]`.

The port wraps both references with `getattr(b, "is_water", False)`
to defend against the dormant bug. If a future row adds an
`is_water` flag (e.g. for water-named top-level polygons that
survive into boundaries), the existing semantics still hold without
code change.

## Sidecar route shape

`POST /detect-water` (token-gated):

Request:
```json
{
  "parsed_kmz": <ParsedKMZ shape from POST /parse-kmz>,
  "return_previews": true
}
```

Response:
```json
{
  "results": [
    {
      "boundary_name": "...",
      "rings_wgs84": [[[lon, lat], ...], ...],
      "preview_png_b64": "iVBORw0KGgoAAAANSUhEUgAA..." | null
    }
  ]
}
```

Sync; production wall-clock 30–60 s per boundary on real network.
Smoke-tested in CI with mocked `_fetch_tile` (no network required).

## Open questions / refinement candidates (for end-of-port review)

These are observations from the port. Prasanta reviews them with
the other accumulated memos at end-of-port.

1. **Tile-source fallback list.** Two Esri endpoints; should there
   be a third (e.g., Mapbox, Google) as further fallback? Currently
   if both Esri sources fail, the composite falls back to grey
   (still classified, rarely useful).

2. **Classifier tuning.** Tuned for Deccan-plateau / India semi-arid
   terrain. Behaviour on Northern European bog / Saharan oasis /
   coastal mangrove plants? Worth a manual check on imagery from
   non-Indian regions before claiming generality.

3. **`_MIN_AREA_M2 = 150` threshold.** Discards polygons smaller
   than 150 m². Does this miss small ponds / drinking-water tanks
   that matter to PV layouts? At 150 m² ≈ 12.2 m × 12.2 m, fairly
   small but not tiny.

4. **Two-zoom union (Z + Z−1).** Currently union of two zoom levels.
   Is this the right tradeoff vs. just one carefully-chosen zoom?
   The legacy comment suggests Z−1 catches large reservoirs that
   smear at higher zoom; verify on a varied-area test set.

5. **No tile caching.** Every detection re-fetches tiles. Acceptable
   for dev; production users running detection on the same boundary
   multiple times pay full network cost each call. Worth a local
   cache (LRU on `(z, x, y)` key, ~10–50 MB) in a follow-up?

## For end-of-port review

When Prasanta reviews the accumulated memos at end-of-port, the
decision points for this finding are:

1. Are the four classifier rules still right for India + the
   markets we're targeting?
2. Is the tile-source list (Esri × 2) sufficient, or should we add
   a fallback?
3. Should we add tile caching as a separate row, or is per-request
   re-fetch OK?

Refinements, if any, become follow-up rows in PLAN.md raised after
the parity sweep is complete.
