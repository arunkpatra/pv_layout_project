# Finding #001 — KMZ autodetect heuristics for water / canal / TL

**Row:** [docs/PLAN.md](../../PLAN.md) row #4 (T3)
**Date:** 2026-04-29
**Author:** Arun (port) — solar-domain decisions captured for Prasanta's end-of-port review
**Status:** committed; deferred review

## Background

Legacy added water-body / canal / transmission-line autodetection in
`core/kmz_parser.py` via two commits on `baseline-v1-20260429`:
`9362083` (`feat: SAT energy fix, GHI file format hint, cable/DXF/edition
improvements`) and `9c751b7` (`feat: auto-detect water bodies, canals
and TL from KMZ and exclude from layout`). Row #4 ports both into the
new project verbatim. This memo captures the heuristics and surfaces
refinement candidates for solar-domain review at end-of-port.

## What landed

Verbatim port from legacy `core/kmz_parser.py` @ baseline. The new file
in `pvlayout_core/core/kmz_parser.py` contains exactly the same keyword
sets, helper functions, and classification rules as legacy. Verified by
the live cross-compare parity test at
`tests/parity/test_kmz_parser_parity.py` — passes bit-exact on
`phaseboundary2.kmz`, `complex-plant-layout.kmz`, and
`Kudlugi Boundary (89 acres).kmz`.

## Keyword lists (ported verbatim)

### Water bodies (`_WATER_KEYWORDS`)
pond, lake, reservoir, water, wetland, swamp, marsh, waterbody,
water body, water_body  *(10 entries)*

### Canals / streams (`_CANAL_KEYWORDS`)
canal, channel, drain, drainage, nala, nallah, nullah, river, stream,
creek, flood  *(11 entries)*

### Transmission / power lines (`_TL_KEYWORDS`)
transmission, transmissionline, transmission line, powerline,
power line, power_line, hv, hvl, ehv, 132kv, 220kv, 400kv, tl, line,
tower, pylon, overhead  *(17 entries)*

### Hard obstacles (`_OBSTACLE_KEYWORDS`)
substation, sub station, building, structure, tower, road, railway,
airport, cemetery, school, hospital, temple, mosque, church, government,
setback, exclusion, no-go, avoid, obstruction, obstacle, restricted
*(22 entries)*

## Classification rules

For Polygon placemarks:

1. Containment-based detection: a polygon contained inside another → obstacle.
2. Among non-contained polygons:
   - If name matches `_WATER_KEYWORDS` ∪ `_CANAL_KEYWORDS` → held aside as
     a water polygon, **NOT** treated as a plant boundary.
   - Otherwise → plant boundary.
3. Among contained polygons:
   - If name matches water/canal → parent boundary's `water_obstacles[]`.
   - Otherwise → parent boundary's `obstacles[]`.
4. Held-aside top-level water polygons are reassigned to whichever boundary
   contains their centroid or intersects them. If none, fall back to largest
   boundary.
5. Fallback: if all polygons are water-named, pick the largest non-water
   polygon as the only plant boundary; if there are no non-water polygons,
   pick the largest polygon overall.

For LineString placemarks:

- All LineStrings (regardless of name) land in `line_obstructions[]` of
  whichever boundary contains the line's midpoint.
- `_TL_KEYWORDS` is defined but **not used** by `parse_kmz` at this baseline.
  Likely consumed by a downstream legacy commit / row.

## Implementation notes from the port

Two transitional changes landed alongside the parser port to keep the
new app's pytest suite green. Both are tracked for cleanup in row #6:

1. **`run_layout_multi` bridge** — `pvlayout_core/core/layout_engine.py`
   merges `BoundaryInfo.water_obstacles` into the obstacles list passed
   to `run_layout`. Pre-row-#4 the parser routed contained ponds to
   `obstacles[]`; the layout engine excluded them from panel placement.
   Row #4's parser change moved them to `water_obstacles[]`, so without
   the bridge the layout engine would no longer exclude ponds (panel
   count would jump). Row #6 will replace this bridge with the proper
   water-exclusion path (legacy uses different setbacks for water vs hard
   obstacles).
2. **Sidecar wire schema + adapters** — `pvlayout_engine/schemas.py` adds
   `BoundaryInfo.water_obstacles` (default `[]`); the `/parse_kmz` route
   serialises it on output and the `/layout` route deserialises it back
   onto `BoundaryInfo` so the bridge sees populated water_obstacles
   end-to-end. Backward-compatible with older clients (default empty).
3. **Golden baseline recapture** — `tests/golden/expected/complex-plant-layout.json`
   was re-captured. The pre-row-#4 baseline encoded a bug: 5 top-level
   `pond`/`Pond` polygons were being treated as separate plant boundaries
   (11 layout results expected). Post-row-#4, those 5 are correctly
   absorbed into the surrounding plants' `water_obstacles[]` (6 results,
   matching legacy bit-exact per the cross-compare test). The other two
   golden baselines (`phaseboundary2`, `Kudlugi Boundary (89 acres)`) did
   not need recapture.

## Open questions / refinement candidates (for end-of-port review)

These are observations from the port. Prasanta reviews them with the
other accumulated memos at end-of-port. Refinements, if any, become
follow-up rows in PLAN.md after the parity sweep is complete.

1. **Dead `_TL_KEYWORDS`.** Defined but unused by the parser at the
   baseline. Should we keep it dormant (preserves legacy parity) or wire
   LineString filtering into row #4 directly? Default: keep dormant —
   downstream row likely uses it.

2. **`tower` in two sets.** Appears in both `_TL_KEYWORDS` and
   `_OBSTACLE_KEYWORDS`. Order of evaluation: water/canal first, then TL,
   then obstacles. So a "Tower" placemark is currently classified as TL,
   not as a hard obstacle. Intentional?

3. **India-regional canal terminology.** `nala`, `nallah`, `nullah`
   ported verbatim. Are the spellings/cases customers actually use?
   Common Hindi/Urdu transliterations also include "naala", "nalah".
   Should the set expand to cover variants?

4. **Sub-EHV voltages.** `_TL_KEYWORDS` covers 132 kV, 220 kV, 400 kV.
   Does the Indian market also need 33 kV, 66 kV (sub-transmission
   distribution) for substation-feed lines that customers might draw?

5. **Short tokens.** `tl` and `line` are 2- and 4-character substrings
   that match across longer words ("flatline", "battle", "tlight" if
   misspelled). False-positive risk on customer KMZs? Tightening to
   word-boundary regex would change behaviour from legacy.

## For end-of-port review

When Prasanta reviews the accumulated memos at end-of-port, the
decision points for this finding are:

1. Is the verbatim port faithful to legacy and acceptable for parity?
2. Are the keyword lists correct for Indian-EPC use cases? If not,
   which entries should be added/removed?
3. Do the classification rules match how customers actually draw KMZs?

Refinements, if any, become follow-up rows in PLAN.md raised after
the parity sweep is complete.
