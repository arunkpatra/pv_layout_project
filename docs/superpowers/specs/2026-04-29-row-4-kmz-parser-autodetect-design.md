# Row #4 — KMZ parser + water/canal/TL autodetection (design)

**PLAN row:** [`docs/PLAN.md`](../../PLAN.md) row #4
**Tier:** T3 (port + parity test + discovery memo + Prasanta in the loop)
**Source:** legacy `core/kmz_parser.py` @ branch `baseline-v1-20260429`, originating commits `9362083` + `9c751b7`
**Target:** `python/pvlayout_engine/pvlayout_core/core/kmz_parser.py`
**Acceptance:** parity boundary geometry match against legacy on all three test KMZ fixtures; new app loads legacy KMZs identically; sidecar pytest green; Prasanta acks autodetect heuristics before row close.
**Date:** 2026-04-29

---

## 1. Goal

Port legacy `core/kmz_parser.py` (185 → ~400 lines) to add water/canal/transmission-line autodetection by KMZ Placemark name. Three substantive changes:

1. **Keyword classifiers** — four keyword sets (`_WATER_KEYWORDS`, `_CANAL_KEYWORDS`, `_TL_KEYWORDS`, `_OBSTACLE_KEYWORDS`) and five helper functions (`_normalise`, `_is_water_name`, `_is_tl_name`, `_is_obstacle_name`, `_is_water_boundary`).
2. **`BoundaryInfo.water_obstacles[]`** — new field alongside existing `obstacles[]` and `line_obstructions[]`. Contains polygons whose names match water/canal keywords.
3. **`parse_kmz` rewrite** — top-level water-named polygons are not treated as plant boundaries; they're held aside and assigned to whichever boundary contains them (or to the largest boundary if standalone). Contained polygons split into `water_obstacles` (water-named) vs `obstacles` (rest). Fallback when all polygons are water-named picks the largest non-water polygon as the plant boundary.
4. **`validate_boundaries(path) -> list`** — new public function. Ring-closure check on plant boundaries only; water/obstacle polygons skipped because the layout engine repairs them downstream.
5. **`_TL_KEYWORDS` ported verbatim** despite being unused in the parser at this baseline. Keeps the row's stated scope ("water/canal/TL autodetection") complete and avoids re-port churn when a downstream row consumes it.

**Direction one-way:** legacy → new project. Legacy is read-only reference per [CLAUDE.md §7](../../../CLAUDE.md). Nothing in this row modifies any file under `/Users/arunkpatra/codebase/PVlayout_Advance`.

**Scope is parser-only.** Layout engine integration of `water_obstacles` (panel exclusion, water-body setbacks, propagation to `LayoutResult.water_obstacle_polygons_wgs84` which row #1 added) is row #6's contract. Satellite-image-driven water detection (the *automatic* detection that doesn't rely on KMZ Placemark names) is row #5's contract.

**T3 ceremony.** Per [CLAUDE.md §9](../../../CLAUDE.md), the row is gated on Prasanta acking the autodetect heuristics. Acks happen during implementation, not during brainstorm. The discovery memo (`docs/parity/findings/2026-04-29-001-kmz-autodetect-heuristics.md`) is drafted as part of the row commit; Arun routes to Prasanta via daily comms; Prasanta's ack arrives as a follow-up commit (or as the row-close commit) before the PLAN.md status flip.

## 2. Changes

### 2.1 `python/pvlayout_engine/pvlayout_core/core/kmz_parser.py`

**Module docstring** updated to mention water/canal/TL autodetection (mirroring legacy's docstring, which it already does at the baseline — verbatim port of the legacy docstring).

**Top of file (after `KML_NS` constant, before `_tag` helper):**

```python
# ---------------------------------------------------------------------------
# Feature-name classifiers
# ---------------------------------------------------------------------------
_WATER_KEYWORDS = {
    "pond", "lake", "reservoir", "water", "wetland", "swamp", "marsh",
    "waterbody", "water body", "water_body",
}
_CANAL_KEYWORDS = {
    "canal", "channel", "drain", "drainage", "nala", "nallah", "nullah",
    "river", "stream", "creek", "flood",
}
_TL_KEYWORDS = {
    "transmission", "transmissionline", "transmission line",
    "powerline", "power line", "power_line",
    "hv", "hvl", "ehv", "132kv", "220kv", "400kv",
    "tl", "line", "tower", "pylon", "overhead",
}
_OBSTACLE_KEYWORDS = {
    "substation", "sub station", "building", "structure", "tower", "road",
    "railway", "airport", "cemetery", "school", "hospital", "temple", "mosque",
    "church", "government", "setback", "exclusion", "no-go", "avoid",
    "obstruction", "obstacle", "restricted",
}


def _normalise(name: str) -> str:
    """Lower-case, strip extra spaces, remove common separators."""
    return name.lower().replace("_", " ").replace("-", " ").strip()


def _is_water_name(name: str) -> bool:
    """Return True if the Placemark name suggests a water body or canal."""
    n = _normalise(name)
    return (
        any(kw in n for kw in _WATER_KEYWORDS) or
        any(kw in n for kw in _CANAL_KEYWORDS)
    )


def _is_tl_name(name: str) -> bool:
    """Return True if the Placemark name suggests a transmission line / power line."""
    n = _normalise(name)
    return any(kw in n for kw in _TL_KEYWORDS)


def _is_obstacle_name(name: str) -> bool:
    """Return True if the Placemark name suggests a hard obstacle."""
    n = _normalise(name)
    return any(kw in n for kw in _OBSTACLE_KEYWORDS)


def _is_water_boundary(name: str) -> bool:
    """Alias kept for backward compatibility — same as _is_water_name."""
    return _is_water_name(name)
```

All four sets, all five helpers ported **verbatim** from legacy. No additions, no removals.

**`BoundaryInfo.__init__`** — add the `water_obstacles` field after `obstacles`:

```python
class BoundaryInfo:
    """One plant boundary with its associated obstacles."""
    def __init__(self, name: str, coords: List[Tuple[float, float]]):
        self.name = name
        self.coords = coords               # (lon, lat) ring
        self.obstacles: List[List[Tuple[float, float]]] = []
        self.water_obstacles: List[List[Tuple[float, float]]] = []  # ponds, canals, reservoirs
        self.line_obstructions: List[List[Tuple[float, float]]] = []  # TL, power lines
```

**`validate_boundaries(path) -> list`** — new top-level function (verbatim port; ~70 lines). Body covers ring-closure check on plant boundaries with a 0.0001° (~11 m) tolerance, distance computed in metres via lat-correction. Water bodies, obstacles, and obstructions are skipped because the layout engine auto-repairs them downstream via `_make_valid_poly`.

Returns: `List[Tuple[str, str]]` — each tuple is `(boundary_name, issue_description)`. Empty list ⇔ all boundaries OK.

**`parse_kmz` rewrite** — verbatim port of legacy's body. Two new behaviours over the current new-app implementation:

- Top-level water-named polygons are NOT treated as plant boundaries. They're collected into a `water_top_level: List[int]` list during the boundary-vs-obstacle classification phase, then assigned to whichever boundary contains their centroid (or intersects them) as `water_obstacles`. If they don't overlap any boundary, they fall back to the largest boundary as a precaution (customer may have drawn the water body slightly outside the boundary ring).
- Contained polygons (`is_obstacle == True`) are split based on `_is_water_name(name)` — water-named contained polygons go to `parent_b.water_obstacles`, others go to `parent_b.obstacles`.
- The all-water-named-polygons fallback: when no plant boundaries result from the classification, pick the largest non-water polygon (or any polygon if all are water-named) as the boundary.

**LineString handling unchanged.** All `LineString` placemarks land in `line_obstructions[]` regardless of name. `_TL_KEYWORDS` is defined but unused in `parse_kmz` itself — this is the legacy baseline state and is preserved verbatim. A downstream row may filter LineStrings by name later.

### 2.2 `python/pvlayout_engine/tests/parity/test_kmz_parser_parity.py` — new

Live cross-compare via `sys.path` bootstrap. Module-scoped fixture imports legacy's `core.kmz_parser` once per test run; tearDown removes it from `sys.modules` so it doesn't shadow `pvlayout_core` for other tests.

```python
"""
Parity test for KMZ parser (Row #4 of docs/PLAN.md).

Live cross-compare: imports both legacy core.kmz_parser (via sys.path
bootstrap) and the new app's pvlayout_core.core.kmz_parser, runs them
on the same test KMZ fixtures, asserts identical output:
  - boundary count + names + coords
  - per-boundary obstacles[], water_obstacles[], line_obstructions[]
  - centroid_lat, centroid_lon

Skips if the legacy repo isn't on disk (CI / fresh checkout). Fails
if the port hasn't landed yet (baseline new app would mishandle
water-named polygons in the test fixtures).
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[4]
KMZ_DIR = REPO_ROOT / "python/pvlayout_engine/tests/golden/kmz"
LEGACY_REPO = Path("/Users/arunkpatra/codebase/PVlayout_Advance")


def _purge_legacy_modules():
    """Remove cached `core` and `core.*` modules so legacy and new-app
    namespaces don't collide. Safe because pvlayout_core.* is a different
    namespace; we only touch bare `core.*`."""
    for m in list(sys.modules):
        if m == "core" or m.startswith("core."):
            del sys.modules[m]


@pytest.fixture(scope="module")
def legacy_parser():
    """Import legacy parse_kmz via sys.path bootstrap. Module-scoped to
    bound the sys.path mutation."""
    if not LEGACY_REPO.exists():
        pytest.skip(f"legacy repo not at {LEGACY_REPO}")

    _purge_legacy_modules()
    sys.path.insert(0, str(LEGACY_REPO))
    try:
        from core import kmz_parser as legacy
        yield legacy
    finally:
        try:
            sys.path.remove(str(LEGACY_REPO))
        except ValueError:
            pass
        _purge_legacy_modules()


@pytest.mark.parametrize("kmz_name", [
    "phaseboundary2.kmz",
    "complex-plant-layout.kmz",
    "Kudlugi Boundary (89 acres).kmz",
])
def test_parse_kmz_parity_with_legacy(legacy_parser, kmz_name):
    kmz_path = KMZ_DIR / kmz_name
    assert kmz_path.exists(), f"missing fixture: {kmz_path}"

    # Import new parser AFTER legacy fixture is set up; the legacy import
    # didn't touch pvlayout_core.* so this resolves to our vendored copy.
    from pvlayout_core.core.kmz_parser import parse_kmz as new_parse

    legacy_result = legacy_parser.parse_kmz(str(kmz_path))
    new_result = new_parse(str(kmz_path))

    # Centroid
    assert math.isclose(legacy_result.centroid_lat, new_result.centroid_lat, abs_tol=1e-9)
    assert math.isclose(legacy_result.centroid_lon, new_result.centroid_lon, abs_tol=1e-9)

    # Boundaries
    assert len(legacy_result.boundaries) == len(new_result.boundaries), (
        f"boundary count drift on {kmz_name}: "
        f"legacy {len(legacy_result.boundaries)} vs new {len(new_result.boundaries)}"
    )

    for i, (lb, nb) in enumerate(zip(legacy_result.boundaries, new_result.boundaries)):
        assert lb.name == nb.name, f"{kmz_name} boundary[{i}].name"
        assert lb.coords == nb.coords, f"{kmz_name} boundary[{i}].coords"
        assert lb.obstacles == nb.obstacles, f"{kmz_name} boundary[{i}].obstacles"
        assert lb.water_obstacles == nb.water_obstacles, f"{kmz_name} boundary[{i}].water_obstacles"
        assert lb.line_obstructions == nb.line_obstructions, f"{kmz_name} boundary[{i}].line_obstructions"


@pytest.mark.parametrize("kmz_name", [
    "phaseboundary2.kmz",
    "complex-plant-layout.kmz",
    "Kudlugi Boundary (89 acres).kmz",
])
def test_validate_boundaries_clean_on_known_fixtures(kmz_name):
    """All three test KMZs are known-good; validate_boundaries returns []."""
    from pvlayout_core.core.kmz_parser import validate_boundaries

    kmz_path = KMZ_DIR / kmz_name
    problems = validate_boundaries(str(kmz_path))
    assert problems == [], (
        f"{kmz_name}: validate_boundaries returned issues: {problems}"
    )
```

**Coord comparison is exact-equal** because both parsers split the same KML coordinate text via the same `float(parts[0])` / `float(parts[1])` parse — no FP drift between them.

**Test count:** 6 parametrized runs (3 KMZs × 2 tests). Adds 6 to the suite total.

### 2.3 `docs/parity/findings/2026-04-29-001-kmz-autodetect-heuristics.md` — new

Discovery memo for Prasanta. Drafted by Arun as part of the row commit; Prasanta acks via Arun's daily comms before the PLAN.md flip.

Sections (full template):

```markdown
# Finding #001 — KMZ autodetect heuristics for water / canal / TL

**Row:** [docs/PLAN.md](../../PLAN.md) row #4 (T3)
**Date:** 2026-04-29
**Author:** Arun (port) — for Prasanta (solar-domain ack)
**Status:** awaiting ack

## Background

Legacy added water-body / canal / transmission-line autodetection in
core/kmz_parser.py via two commits on `baseline-v1-20260429`:
9362083 (`feat: SAT energy fix, GHI file format hint, cable/DXF/edition
improvements`) and 9c751b7 (`feat: auto-detect water bodies, canals
and TL from KMZ and exclude from layout`). Row #4 ports both into the
new project verbatim. This memo captures the heuristics and surfaces
refinement candidates for solar-domain review.

## What landed

Verbatim port from legacy `core/kmz_parser.py` @ baseline. Commit:
<parity row commit sha>. The new file in pvlayout_core/core/ contains
exactly the same keyword sets, helper functions, and classification
rules as legacy.

## Keyword lists (ported verbatim)

### Water bodies (`_WATER_KEYWORDS`)
pond, lake, reservoir, water, wetland, swamp, marsh, waterbody,
water body, water_body

### Canals / streams (`_CANAL_KEYWORDS`)
canal, channel, drain, drainage, nala, nallah, nullah, river, stream,
creek, flood

### Transmission / power lines (`_TL_KEYWORDS`)
transmission, transmissionline, transmission line, powerline,
power line, power_line, hv, hvl, ehv, 132kv, 220kv, 400kv, tl, line,
tower, pylon, overhead

### Hard obstacles (`_OBSTACLE_KEYWORDS`)
substation, sub station, building, structure, tower, road, railway,
airport, cemetery, school, hospital, temple, mosque, church, government,
setback, exclusion, no-go, avoid, obstruction, obstacle, restricted

## Classification rules

For Polygon placemarks:
1. Containment-based detection: a polygon contained inside another → obstacle.
2. Among non-contained polygons:
   - If name matches `_WATER_KEYWORDS` ∪ `_CANAL_KEYWORDS` → held aside as
     a water polygon, NOT treated as a plant boundary.
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
- `_TL_KEYWORDS` is defined but **not used** by parse_kmz at this baseline.
  Likely consumed by a downstream legacy commit / row.

## Open questions / refinement candidates (no urgency)

These are observations from the port; please respond at your convenience.
Refinements, if any, become a follow-up row in PLAN.md.

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
   Common Hindi/Urdu transliterations also include "naala", "nalah",
   "nullah". Should the set expand to cover variants?

4. **Sub-EHV voltages.** `_TL_KEYWORDS` covers 132 kV, 220 kV, 400 kV.
   Does the Indian market also need 33 kV, 66 kV (sub-transmission
   distribution) for substation-feed lines that customers might draw?

5. **Short tokens.** `tl` and `line` are 2- and 4-character substrings
   that match across longer words ("flatline", "battle", "tlight" if
   misspelled). False-positive risk on customer KMZs? Tightening to
   word-boundary regex would change behaviour from legacy.

## Prasanta — please ack

Mark each box and reply (a Slack/email reply is fine; I'll commit your ack):

- [ ] The verbatim port faithfully mirrors legacy and is acceptable for
      parity. **(Required for row close.)**
- [ ] The keyword lists are correct for Indian-EPC use cases — OR list
      refinements you'd like in a follow-up row.
- [ ] The classification rules match how customers actually draw KMZs.

## Decision (filled by Arun after Prasanta replies)

[ ] Accepted as-is — refinements deferred / not needed.
[ ] Accepted with follow-up row to refine keywords (linked here when
    raised in PLAN.md).
[ ] Rejected — re-design needed.
```

### 2.4 `docs/PLAN.md`

Row #4 → **done**, status bump `3 / 12 done.` → `4 / 12 done.`

**Gated on Prasanta's ack.** PLAN.md flip happens in the same commit as the row code, but only after Prasanta replies. If Prasanta is delayed, the row code can land as a `wip:` checkpoint commit; the PLAN.md flip waits.

## 3. Acceptance

```bash
cd python/pvlayout_engine && uv run pytest tests/ -q
```

- All existing tests still pass (74 passed remains the floor).
- 6 new tests under `tests/parity/test_kmz_parser_parity.py` pass:
  - `test_parse_kmz_parity_with_legacy[phaseboundary2.kmz]`
  - `test_parse_kmz_parity_with_legacy[complex-plant-layout.kmz]`
  - `test_parse_kmz_parity_with_legacy[Kudlugi Boundary (89 acres).kmz]`
  - `test_validate_boundaries_clean_on_known_fixtures[phaseboundary2.kmz]`
  - `test_validate_boundaries_clean_on_known_fixtures[complex-plant-layout.kmz]`
  - `test_validate_boundaries_clean_on_known_fixtures[Kudlugi Boundary (89 acres).kmz]`
- Expected total: **80 passed**, 6 skipped, 0 failed.
- Discovery memo committed; Prasanta has acked.

## 4. Risks

- **Legacy import collision with `pvlayout_core.*`.** The fixture's `_purge_legacy_modules()` only purges bare `core.*` modules; `pvlayout_core.core.kmz_parser` lives under a different namespace and is unaffected. Mitigated by the import order in the test (legacy fixture first, then `from pvlayout_core...`).
- **Test KMZ fixture drift.** If a fixture is regenerated mid-row, both legacy and new parser run on the new file — comparison stays valid. Risk only if fixtures are silently corrupted; mitigated by the `validate_boundaries` test asserting all three are clean.
- **Prasanta delay blocks row close.** Per CLAUDE.md §9, Prasanta acks before close. Mitigation: code can land as `wip:` if Prasanta is delayed > 1 working day; PLAN.md flip waits for ack.
- **Behavioural delta on the new app.** Current new-app `parse_kmz` doesn't recognise water names, so it would treat phaseboundary2's two ponds as either obstacles (if contained) or top-level boundaries (if not). The parity test will FAIL on the current code (good — proves the row is needed) and PASS after the port.

## 5. Out of scope

- **Layout engine integration of `water_obstacles`** — row #6 (T2). Includes propagating `BoundaryInfo.water_obstacles[]` into `LayoutResult.water_obstacle_polygons_wgs84`, panel exclusion logic, water-body setbacks.
- **Satellite-image-driven water detection** — row #5 (T3). Detects water bodies from imagery rather than KMZ Placemark names; complementary to row #4's name-based detection.
- **UI for displaying water obstacles** (e.g. blue rendering on canvas) — frontend change; not a parity row contract.
- **Refinements to keyword lists** — gated on Prasanta's response; if requested, follow-up row in PLAN.md.
- **Pydantic schemas / TS types** — `pvlayout_core` only; sidecar surface follows downstream.

## 6. Implementation order (for the implementation plan)

1. Pre-flight: confirm legacy at `baseline-v1-20260429`; pytest baseline 74 passed.
2. Edit `pvlayout_core/core/kmz_parser.py`:
   - Update module docstring.
   - Add keyword sets + helpers at module top.
   - Add `water_obstacles[]` to `BoundaryInfo.__init__`.
   - Add `validate_boundaries(path)` function.
   - Rewrite `parse_kmz` body with water routing.
3. Add `tests/parity/test_kmz_parser_parity.py`.
4. Run `uv run pytest tests/ -q` from `python/pvlayout_engine/`. Expect 80 passed, 6 skipped, 0 failed.
5. Draft discovery memo at `docs/parity/findings/2026-04-29-001-kmz-autodetect-heuristics.md`.
6. Commit: `parity: row #4 — KMZ parser + water/canal/TL autodetection` (gates PLAN.md flip on Prasanta's ack).
7. Arun routes memo to Prasanta. On ack: PLAN.md flip + memo Decision section filled. On non-ack: handle per Prasanta's response.

## 7. Cross-references

- [`docs/PLAN.md`](../../PLAN.md) row #4.
- [`docs/superpowers/specs/2026-04-29-row-1-project-model-fields-design.md`](2026-04-29-row-1-project-model-fields-design.md) — added `LayoutResult.water_obstacle_polygons_wgs84` (consumer surface for row #6).
- [`docs/principles/external-contracts.md`](../../principles/external-contracts.md) — KMZ format is an external contract; we mirror legacy's interpretation, we don't redefine it.
- [`python/pvlayout_engine/scripts/parity/capture_legacy_baseline.py`](../../../python/pvlayout_engine/scripts/parity/capture_legacy_baseline.py) — sys.path bootstrap pattern reused by the parity test fixture.
- [`python/pvlayout_engine/tests/parity/test_la_placement_parity.py`](../../../python/pvlayout_engine/tests/parity/test_la_placement_parity.py) — test pattern reference (parity tests on KMZ fixtures).
- Legacy source at `/Users/arunkpatra/codebase/PVlayout_Advance/core/kmz_parser.py` on branch `baseline-v1-20260429`.
- New project target at `/Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/pvlayout_core/core/kmz_parser.py`.
