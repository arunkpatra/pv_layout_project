# Row #4 — KMZ parser + water/canal/TL autodetection (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port legacy `core/kmz_parser.py` (185 → ~400 lines) into the new project to add water/canal/transmission-line autodetection by KMZ Placemark name, plus a `validate_boundaries(path)` public function. Add a parity test (live cross-compare against legacy) and a deferred-review discovery memo for Prasanta's end-of-port pass.

**Architecture:** Single-file mechanical port + one new test file + one new memo. Live cross-compare test imports legacy via `sys.path` bootstrap and asserts identical output on three test KMZ fixtures. Atomic row commit (code + parity test + memo + PLAN.md flip).

**Tech Stack:** Python 3.12, `shapely`, `xml.etree.ElementTree`, `zipfile`. Sidecar pytest under `python/pvlayout_engine/tests/`. Legacy reference at `/Users/arunkpatra/codebase/PVlayout_Advance` branch `baseline-v1-20260429`.

**Spec:** [`docs/superpowers/specs/2026-04-29-row-4-kmz-parser-autodetect-design.md`](../specs/2026-04-29-row-4-kmz-parser-autodetect-design.md) (committed `f1ab968`, updated by chore `517adf4`).

**Tier:** T3 (per [`docs/PLAN.md`](../../PLAN.md)) — port + numeric parity test + deferred-review discovery memo. **No per-row Prasanta gate** per the 2026-04-29 policy update; PLAN.md flip lands with the row commit on green tests.

---

## File structure

**Modify (one file):**
- `python/pvlayout_engine/pvlayout_core/core/kmz_parser.py` — add keyword classifiers + helpers, `BoundaryInfo.water_obstacles[]` field, `validate_boundaries(path)` public function, rewrite `parse_kmz` body with water-routing logic. Verbatim port from legacy.

**Create:**
- `python/pvlayout_engine/tests/parity/test_kmz_parser_parity.py` — live cross-compare against legacy on 3 KMZ fixtures + `validate_boundaries` clean-fixtures check (6 parametrized tests total).
- `docs/parity/findings/2026-04-29-001-kmz-autodetect-heuristics.md` — discovery memo capturing the keyword lists, classification rules, and 5 open questions for end-of-port review.

**Modify:**
- `docs/PLAN.md` — flip row #4 to **done**, bump `Status: 3 / 12 done.` → `4 / 12 done.`

**Commit shape:** one atomic commit `parity: row #4 — KMZ parser + water/canal/TL autodetection` containing all four files.

---

## Pre-flight

- [ ] **Step 0: Confirm legacy repo is at the baseline branch**

Run from repo root:

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance && git rev-parse --abbrev-ref HEAD && git rev-parse HEAD
```

Expected:

```
baseline-v1-20260429
397aa2ab460d8f773376f51b393407e5be67dca0
```

If wrong, run `git -C /Users/arunkpatra/codebase/PVlayout_Advance checkout baseline-v1-20260429`. If the SHA has advanced beyond `397aa2a`, surface — re-baseline conversation needed.

- [ ] **Step 1: Confirm pytest baseline is 74 passed / 6 skipped**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: a line ending with `74 passed, 6 skipped` (any number of warnings is fine). Row #4 grows this to 80 passed, 6 skipped.

- [ ] **Step 2: Confirm the three test KMZ fixtures are present**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
ls -1 python/pvlayout_engine/tests/golden/kmz/
```

Expected (order may vary):

```
Kudlugi Boundary (89 acres).kmz
complex-plant-layout.kmz
phaseboundary.kmz
phaseboundary2.kmz
```

The plan's parity test runs against `phaseboundary2.kmz`, `complex-plant-layout.kmz`, and `Kudlugi Boundary (89 acres).kmz`. `phaseboundary.kmz` exists but is not used.

---

## Task 1: Update module docstring + add keyword classifiers

**Files:**
- Modify: `python/pvlayout_engine/pvlayout_core/core/kmz_parser.py`

This task adds the four keyword sets and five classifier helpers at module top, before the existing `_tag` helper. Verbatim port from legacy.

- [ ] **Step 1: Update the module docstring**

Find the existing docstring at the top of the file (lines 1–7):

```python
"""
KMZ / KML parser.
Extracts:
  - All plant boundary polygons (top-level polygons not contained within others)
  - Obstacle / exclusion polygons (polygons fully contained within a boundary)
  - The centroid latitude/longitude of all boundaries combined
"""
```

Leave the docstring as-is. Legacy's docstring at the baseline is identical to this — the keyword classification doesn't show up in the docstring at the legacy baseline, only in code. Preserving verbatim parity.

- [ ] **Step 2: Insert keyword classifiers + helpers**

Find this block:

```python
KML_NS = "http://www.opengis.net/kml/2.2"


def _tag(name: str) -> str:
```

Replace with:

```python
KML_NS = "http://www.opengis.net/kml/2.2"

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


def _tag(name: str) -> str:
```

- [ ] **Step 3: Verify the module imports cleanly with the new helpers**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run python -c "
from pvlayout_core.core.kmz_parser import (
    _normalise, _is_water_name, _is_tl_name, _is_obstacle_name,
    _WATER_KEYWORDS, _CANAL_KEYWORDS, _TL_KEYWORDS, _OBSTACLE_KEYWORDS,
)
assert _is_water_name('Pond 1') is True
assert _is_water_name('Plant Boundary') is False
assert _is_tl_name('132kV TL') is True
assert _is_obstacle_name('Substation A') is True
assert _normalise('Power_Line-1') == 'power line 1'
print('OK', len(_WATER_KEYWORDS), len(_CANAL_KEYWORDS), len(_TL_KEYWORDS), len(_OBSTACLE_KEYWORDS))
"
```

Expected:

```
OK 10 11 16 21
```

(The four counts are: water=10, canal=11, TL=16, obstacle=21 entries.)

---

## Task 2: Add `water_obstacles[]` field to `BoundaryInfo`

**Files:**
- Modify: `python/pvlayout_engine/pvlayout_core/core/kmz_parser.py`

- [ ] **Step 1: Insert the new field**

Find:

```python
class BoundaryInfo:
    """One plant boundary with its associated obstacles."""
    def __init__(self, name: str, coords: List[Tuple[float, float]]):
        self.name = name
        self.coords = coords               # (lon, lat) ring
        self.obstacles: List[List[Tuple[float, float]]] = []
        self.line_obstructions: List[List[Tuple[float, float]]] = []  # TL, canal, etc.
```

Replace with:

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

Note: the `line_obstructions` comment is updated from "TL, canal, etc." to "TL, power lines" to match legacy verbatim — canals are now routed to `water_obstacles[]` instead.

- [ ] **Step 2: Verify the field exists with default empty list**

Run:

```bash
uv run python -c "
from pvlayout_core.core.kmz_parser import BoundaryInfo
b = BoundaryInfo('test', [(0,0), (1,0), (1,1), (0,1), (0,0)])
print('obstacles:', b.obstacles)
print('water_obstacles:', b.water_obstacles)
print('line_obstructions:', b.line_obstructions)
"
```

Expected:

```
obstacles: []
water_obstacles: []
line_obstructions: []
```

---

## Task 3: Add `validate_boundaries(path) -> list` public function

**Files:**
- Modify: `python/pvlayout_engine/pvlayout_core/core/kmz_parser.py`

This task adds a new public function. Verbatim port from legacy.

- [ ] **Step 1: Insert the function**

Find this block (the line just before the `parse_kmz` definition):

```python
def parse_kmz(path: str) -> KMZParseResult:
```

Insert before it:

```python
def validate_boundaries(path: str) -> list:
    """
    Check only TOP-LEVEL PLANT boundaries for open rings.

    Rules:
      • Water bodies, ponds, obstacles and obstructions are SKIPPED entirely —
        the layout engine auto-repairs any self-intersections in those polygons
        using _make_valid_poly(), so no warning is needed or helpful.
      • Only plant boundaries (non-water, top-level, not contained inside another
        polygon) are validated.
      • For plant boundaries the ONLY fatal error is an OPEN RING (first point ≠
        last point beyond tolerance).  Self-intersecting plant boundaries are also
        auto-repaired by the engine, so they are NOT flagged here.
      • An empty list means everything is OK to proceed.
    """
    import math

    # Tolerance: 0.0001° ≈ 11 m.  Rings with a gap smaller than this are
    # treated as effectively closed (floating-point export artefacts).
    CLOSED_TOL_DEG = 0.0001

    def _gap_metres(dlat, dlon, lat):
        m_per_deg_lat = 111_320.0
        m_per_deg_lon = 111_320.0 * math.cos(math.radians(lat))
        return math.sqrt((dlat * m_per_deg_lat) ** 2 + (dlon * m_per_deg_lon) ** 2)

    # ------------------------------------------------------------------
    # Step 1 — collect all polygons from the KMZ
    # ------------------------------------------------------------------
    root = _get_tree_from_kmz(path)
    all_polys = []   # (name, coords)
    for placemark in root.iter(_tag("Placemark")):
        name_el = placemark.find(_tag("name"))
        pname   = (name_el.text.strip()
                   if name_el is not None and name_el.text else "Unnamed")
        for polygon in placemark.iter(_tag("Polygon")):
            outer = polygon.find(
                f".//{_tag('outerBoundaryIs')}"
                f"/{_tag('LinearRing')}/{_tag('coordinates')}"
            )
            if outer is not None and outer.text:
                coords = _parse_coordinates(outer.text)
                if len(coords) >= 3:
                    all_polys.append((pname, coords))

    if not all_polys:
        return ["No polygon features found in the KMZ file."]

    # ------------------------------------------------------------------
    # Step 2 — classify: identify which polygons are contained inside
    #          another polygon (i.e. are obstacles / water bodies).
    #          Those are skipped — the engine handles them gracefully.
    # ------------------------------------------------------------------
    shapely_polys = []
    for name, coords in all_polys:
        try:
            # Build polygon using buffer(0) so even a self-intersecting ring
            # gives us a usable shape for the containment check.
            poly = Polygon(coords)
            if not poly.is_valid:
                poly = poly.buffer(0)
            shapely_polys.append((name, coords, poly))
        except Exception:
            # If we can't even build a shape, treat as top-level (check it).
            shapely_polys.append((name, coords, None))

    n = len(shapely_polys)
    is_contained = [False] * n   # True → obstacle / water body → skip
    for i in range(n):
        if shapely_polys[i][2] is None:
            continue
        for j in range(n):
            if i == j or shapely_polys[j][2] is None:
                continue
            try:
                if shapely_polys[j][2].contains(shapely_polys[i][2]):
                    is_contained[i] = True
                    break
            except Exception:
                pass

    # ------------------------------------------------------------------
    # Step 3 — validate open-ring for plant boundaries only
    # ------------------------------------------------------------------
    # problems → list of (boundary_name, issue_description)
    problems = []
    for i, (name, coords, _) in enumerate(shapely_polys):
        # Skip obstacles, water bodies, and water-named top-level boundaries
        if is_contained[i] or _is_water_boundary(name):
            continue

        first, last = coords[0], coords[-1]
        dlat = abs(first[1] - last[1])
        dlon = abs(first[0] - last[0])
        mid_lat = sum(c[1] for c in coords) / len(coords)

        if dlat > CLOSED_TOL_DEG or dlon > CLOSED_TOL_DEG:
            gap_m = _gap_metres(dlat, dlon, mid_lat)
            problems.append((
                name,
                f"Ring is NOT CLOSED  "
                f"(gap between first and last point ≈ {gap_m:.1f} m)"
            ))

    return problems   # List[Tuple[str, str]]  — (name, issue)


def parse_kmz(path: str) -> KMZParseResult:
```

- [ ] **Step 2: Verify it imports and runs clean on a known-good fixture**

Run:

```bash
uv run python -c "
from pvlayout_core.core.kmz_parser import validate_boundaries
problems = validate_boundaries('tests/golden/kmz/phaseboundary2.kmz')
print('problems:', problems)
assert problems == [], f'expected empty, got {problems}'
print('OK')
"
```

Expected:

```
problems: []
OK
```

---

## Task 4: Rewrite `parse_kmz` body with water-routing logic

**Files:**
- Modify: `python/pvlayout_engine/pvlayout_core/core/kmz_parser.py`

This task replaces the body of `parse_kmz` with the legacy verbatim version. The two new behaviours are: (a) top-level water-named polygons not treated as plant boundaries, (b) contained polygons split into `water_obstacles` vs `obstacles` by name.

- [ ] **Step 1: Replace the function body**

Find the entire `parse_kmz` function (currently ending at the file's last line). Replace it with:

```python
def parse_kmz(path: str) -> KMZParseResult:
    """
    Parse a KMZ/KML file and return all boundaries with their internal obstacles.

    Classification logic (using Shapely containment):
      - A polygon that is NOT fully contained within any other polygon → boundary
      - A polygon that IS fully contained within a boundary polygon → obstacle for that boundary
    """
    root = _get_tree_from_kmz(path)

    # Collect all polygons and linestrings from every Placemark
    raw: List[Tuple[str, List[Tuple[float, float]]]] = []
    raw_lines: List[Tuple[str, List[Tuple[float, float]]]] = []  # LineStrings

    for placemark in root.iter(_tag("Placemark")):
        name_el = placemark.find(_tag("name"))
        pname = name_el.text.strip() if name_el is not None and name_el.text else ""

        # Polygons
        for polygon in placemark.iter(_tag("Polygon")):
            outer = polygon.find(
                f".//{_tag('outerBoundaryIs')}/{_tag('LinearRing')}/{_tag('coordinates')}"
            )
            if outer is not None and outer.text:
                coords = _parse_coordinates(outer.text)
                if len(coords) >= 3:
                    raw.append((pname, coords))

        # LineStrings (transmission lines, canals, roads, etc.)
        for ls in placemark.iter(_tag("LineString")):
            coord_el = ls.find(_tag("coordinates"))
            if coord_el is not None and coord_el.text:
                coords = _parse_coordinates(coord_el.text)
                if len(coords) >= 2:
                    raw_lines.append((pname, coords))

    if not raw:
        raise ValueError("No polygon features found in the KMZ file.")

    # Build shapely polygons for containment checks
    shapely_polys = []
    for name, coords in raw:
        try:
            poly = Polygon(coords)
            if not poly.is_valid:
                poly = poly.buffer(0)
            shapely_polys.append((name, coords, poly))
        except Exception:
            pass

    if not shapely_polys:
        raise ValueError("Could not build valid polygons from the KMZ file.")

    # Classify: boundary vs obstacle
    # A polygon is an obstacle if it is fully contained within any other polygon
    n = len(shapely_polys)
    is_obstacle = [False] * n
    parent_index = [-1] * n

    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            try:
                if shapely_polys[j][2].contains(shapely_polys[i][2]):
                    is_obstacle[i] = True
                    # Assign to the smallest enclosing polygon
                    if parent_index[i] == -1:
                        parent_index[i] = j
                    else:
                        # prefer the smaller parent
                        if shapely_polys[j][2].area < shapely_polys[parent_index[i]][2].area:
                            parent_index[i] = j
                    break
            except Exception:
                pass

    result = KMZParseResult()

    # Create BoundaryInfo for each non-obstacle polygon.
    # Top-level polygons whose name matches water/canal keywords are treated as
    # water obstacles rather than plant boundaries (they will be assigned to
    # whichever boundary later overlaps them, or skipped entirely if standalone).
    boundary_map = {}   # index → BoundaryInfo
    water_top_level: List[int] = []   # indices of water-named top-level polys

    for i, (name, coords, poly) in enumerate(shapely_polys):
        if not is_obstacle[i]:
            if _is_water_name(name):
                # Remember for later assignment; do NOT treat as a plant boundary
                water_top_level.append(i)
            else:
                b = BoundaryInfo(
                    name=name if name else f"Plant {len(result.boundaries) + 1}",
                    coords=coords,
                )
                result.boundaries.append(b)
                boundary_map[i] = b

    if not result.boundaries:
        # Fallback: treat the largest non-water polygon as the only boundary
        non_water = [i for i in range(n) if i not in water_top_level]
        candidates = non_water if non_water else list(range(n))
        largest = max(candidates, key=lambda i: shapely_polys[i][2].area)
        name, coords, _ = shapely_polys[largest]
        b = BoundaryInfo(name=name if name else "Plant 1", coords=coords)
        result.boundaries.append(b)
        boundary_map[largest] = b
        for i in range(n):
            if i != largest:
                parent_index[i] = largest
                is_obstacle[i] = True

    # ------------------------------------------------------------------
    # Assign contained obstacles to their parent boundary, separating
    # water bodies (ponds, canals, reservoirs) from hard obstacles.
    # ------------------------------------------------------------------
    for i, (name, coords, _) in enumerate(shapely_polys):
        if is_obstacle[i] and parent_index[i] in boundary_map:
            parent_b = boundary_map[parent_index[i]]
            if _is_water_name(name):
                parent_b.water_obstacles.append(coords)
            else:
                parent_b.obstacles.append(coords)

    # Assign water-named top-level polygons to whichever boundary overlaps them
    from shapely.geometry import Point as _Pt
    for wi in water_top_level:
        wname, wcoords, wpoly = shapely_polys[wi]
        if wpoly is None:
            continue
        wcentroid = wpoly.centroid
        assigned = False
        for idx, b in boundary_map.items():
            bpoly = shapely_polys[idx][2]
            if bpoly is not None:
                try:
                    if bpoly.contains(wcentroid) or bpoly.intersects(wpoly):
                        b.water_obstacles.append(wcoords)
                        assigned = True
                        break
                except Exception:
                    pass
        # If not overlapping any boundary, assign to the largest boundary as a
        # precaution (user may have drawn the water body outside the boundary ring)
        if not assigned and boundary_map:
            largest_b_idx = max(boundary_map.keys(),
                                key=lambda i: shapely_polys[i][2].area
                                if shapely_polys[i][2] else 0)
            boundary_map[largest_b_idx].water_obstacles.append(wcoords)

    # ------------------------------------------------------------------
    # Assign line obstructions to parent boundary.
    # Lines whose name suggests TL / power lines are canal-type obstructions
    # (buffered and subtracted by the layout engine).  All other lines are
    # also captured as line_obstructions since they may represent roads/canals.
    # ------------------------------------------------------------------
    for lname, lcoords in raw_lines:
        pt_mid = lcoords[len(lcoords) // 2]   # midpoint of line
        for idx, (bname, bcoords, bpoly) in enumerate(shapely_polys):
            if not is_obstacle[idx] and idx in boundary_map:
                try:
                    if bpoly.contains(_Pt(pt_mid[0], pt_mid[1])):
                        boundary_map[idx].line_obstructions.append(lcoords)
                        break
                except Exception:
                    pass

    result._compute_centroid()
    return result
```

- [ ] **Step 2: Smoke test on the three fixtures**

Run:

```bash
uv run python -c "
from pvlayout_core.core.kmz_parser import parse_kmz
for k in ['phaseboundary2.kmz', 'complex-plant-layout.kmz', 'Kudlugi Boundary (89 acres).kmz']:
    r = parse_kmz(f'tests/golden/kmz/{k}')
    nb = len(r.boundaries)
    no = sum(len(b.obstacles) for b in r.boundaries)
    nw = sum(len(b.water_obstacles) for b in r.boundaries)
    nl = sum(len(b.line_obstructions) for b in r.boundaries)
    print(f'{k}: boundaries={nb} obstacles={no} water_obstacles={nw} lines={nl}')
    # phaseboundary2 has 2 ponds + 1 TL → water_obstacles ≥ 1, lines ≥ 1
    # complex-plant-layout has many ponds + 2 TL → water_obstacles ≥ 1, lines ≥ 1
    # Kudlugi is just one boundary → all should be 0 except boundaries=1
"
```

Expected: each line shows non-negative integers; the script runs to completion without raising. The exact counts are verified against legacy in Task 5's parity test, not here. If the script raises an exception (e.g., `AttributeError` on `water_obstacles` or `KeyError` in containment classification), re-read Tasks 1–4 against the legacy file at `/Users/arunkpatra/codebase/PVlayout_Advance/core/kmz_parser.py` and fix.

---

## Task 5: Add the parity test (live cross-compare against legacy)

**Files:**
- Create: `python/pvlayout_engine/tests/parity/test_kmz_parser_parity.py`

- [ ] **Step 1: Create the test file**

Write the entire file:

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
if the port hasn't landed yet (the new app's pre-port parse_kmz
mishandles water-named polygons in the test fixtures).
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
    bound the sys.path mutation to this test module's lifetime."""
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

    # Import new parser AFTER the legacy fixture is set up; pvlayout_core.*
    # is a different namespace from bare `core.*` so this resolves cleanly.
    from pvlayout_core.core.kmz_parser import parse_kmz as new_parse

    legacy_result = legacy_parser.parse_kmz(str(kmz_path))
    new_result = new_parse(str(kmz_path))

    # Centroid
    assert math.isclose(legacy_result.centroid_lat, new_result.centroid_lat, abs_tol=1e-9), (
        f"{kmz_name} centroid_lat drift"
    )
    assert math.isclose(legacy_result.centroid_lon, new_result.centroid_lon, abs_tol=1e-9), (
        f"{kmz_name} centroid_lon drift"
    )

    # Boundaries
    assert len(legacy_result.boundaries) == len(new_result.boundaries), (
        f"{kmz_name} boundary count drift: "
        f"legacy {len(legacy_result.boundaries)} vs new {len(new_result.boundaries)}"
    )

    for i, (lb, nb) in enumerate(zip(legacy_result.boundaries, new_result.boundaries)):
        assert lb.name == nb.name, f"{kmz_name} boundary[{i}].name"
        assert lb.coords == nb.coords, f"{kmz_name} boundary[{i}].coords"
        assert lb.obstacles == nb.obstacles, f"{kmz_name} boundary[{i}].obstacles"
        assert lb.water_obstacles == nb.water_obstacles, (
            f"{kmz_name} boundary[{i}].water_obstacles"
        )
        assert lb.line_obstructions == nb.line_obstructions, (
            f"{kmz_name} boundary[{i}].line_obstructions"
        )


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

- [ ] **Step 2: Run the new test in isolation**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run pytest tests/parity/test_kmz_parser_parity.py -v 2>&1 | tail -15
```

Expected: 6 PASSED:

```
tests/parity/test_kmz_parser_parity.py::test_parse_kmz_parity_with_legacy[phaseboundary2.kmz] PASSED
tests/parity/test_kmz_parser_parity.py::test_parse_kmz_parity_with_legacy[complex-plant-layout.kmz] PASSED
tests/parity/test_kmz_parser_parity.py::test_parse_kmz_parity_with_legacy[Kudlugi Boundary (89 acres).kmz] PASSED
tests/parity/test_kmz_parser_parity.py::test_validate_boundaries_clean_on_known_fixtures[phaseboundary2.kmz] PASSED
tests/parity/test_kmz_parser_parity.py::test_validate_boundaries_clean_on_known_fixtures[complex-plant-layout.kmz] PASSED
tests/parity/test_kmz_parser_parity.py::test_validate_boundaries_clean_on_known_fixtures[Kudlugi Boundary (89 acres).kmz] PASSED
```

If a `test_parse_kmz_parity_with_legacy` test fails on a specific fixture, the assertion message identifies which field drifted (`coords`, `obstacles`, `water_obstacles`, etc.). Re-read Tasks 1–4 against the legacy file at `/Users/arunkpatra/codebase/PVlayout_Advance/core/kmz_parser.py` and fix.

If `test_validate_boundaries_clean_on_known_fixtures` fails, one of the test fixtures has an open ring beyond 0.0001° tolerance — that would be a fixture-quality issue, not a port issue. Surface and stop.

---

## Task 6: Run the full sidecar pytest suite

**Files:**
- No edit. Acceptance check.

- [ ] **Step 1: Run the full suite**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: a line ending with `80 passed, 6 skipped`. The two existing parity tests (P0 cable: 3 tests, row #2 LA: 2 tests) plus row #4's 6 new tests = 74 + 6 = 80.

If the count is something other than 80 passed, identify the failing test from the longer output (`uv run pytest tests/ -q 2>&1 | grep -E "FAIL|ERROR"`) and fix before continuing.

---

## Task 7: Draft the discovery memo

**Files:**
- Create: `docs/parity/findings/2026-04-29-001-kmz-autodetect-heuristics.md`

- [ ] **Step 1: Verify the findings directory exists or create it**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
mkdir -p docs/parity/findings
ls docs/parity/findings/
```

Expected: directory exists. If it didn't exist, `mkdir -p` creates it. Empty listing is fine — this row's memo is the first artifact.

- [ ] **Step 2: Write the memo**

Create `docs/parity/findings/2026-04-29-001-kmz-autodetect-heuristics.md` with the following content:

```markdown
# Finding #001 — KMZ autodetect heuristics for water / canal / TL

**Row:** [docs/PLAN.md](../../PLAN.md) row #4 (T3)
**Date:** 2026-04-29
**Author:** Arun (port) — solar-domain decisions captured for Prasanta's end-of-port review
**Status:** committed; deferred review

## Background

Legacy added water-body / canal / transmission-line autodetection in
core/kmz_parser.py via two commits on `baseline-v1-20260429`:
9362083 (`feat: SAT energy fix, GHI file format hint, cable/DXF/edition
improvements`) and 9c751b7 (`feat: auto-detect water bodies, canals
and TL from KMZ and exclude from layout`). Row #4 ports both into the
new project verbatim. This memo captures the heuristics and surfaces
refinement candidates for solar-domain review.

## What landed

Verbatim port from legacy `core/kmz_parser.py` @ baseline. The new file
in pvlayout_core/core/ contains exactly the same keyword sets, helper
functions, and classification rules as legacy. See the parity row's
commit for the diff.

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
   Common Hindi/Urdu transliterations also include "naala", "nalah",
   "nullah". Should the set expand to cover variants?

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
```

- [ ] **Step 3: Verify the memo file is well-formed**

Run:

```bash
ls -l docs/parity/findings/2026-04-29-001-kmz-autodetect-heuristics.md && head -10 docs/parity/findings/2026-04-29-001-kmz-autodetect-heuristics.md
```

Expected: the file exists with the title line `# Finding #001 — KMZ autodetect heuristics for water / canal / TL` showing in the head output.

---

## Task 8: Flip PLAN.md status

**Files:**
- Modify: `docs/PLAN.md`

- [ ] **Step 1: Update Row #4 status to `done`**

Find:

```markdown
| 4 | KMZ parser + water/canal/TL autodetection | T3 | `core/kmz_parser.py` @ `9362083` + `9c751b7` | Parity boundary geometry match; new app loads legacy KMZs identically; discovery memo committed. | todo |
```

Replace with:

```markdown
| 4 | KMZ parser + water/canal/TL autodetection | T3 | `core/kmz_parser.py` @ `9362083` + `9c751b7` | Parity boundary geometry match; new app loads legacy KMZs identically; discovery memo committed. | **done** |
```

- [ ] **Step 2: Bump the count in the header status line**

Change:

```markdown
**Status:** 3 / 12 done.
```

to:

```markdown
**Status:** 4 / 12 done.
```

---

## Task 9: Commit the row

**Files:**
- Stage and commit:
  - `python/pvlayout_engine/pvlayout_core/core/kmz_parser.py`
  - `python/pvlayout_engine/tests/parity/test_kmz_parser_parity.py`
  - `docs/parity/findings/2026-04-29-001-kmz-autodetect-heuristics.md`
  - `docs/PLAN.md`

- [ ] **Step 1: Confirm only the expected files changed**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git status
```

Expected:

```
modified:   docs/PLAN.md
modified:   python/pvlayout_engine/pvlayout_core/core/kmz_parser.py

Untracked files:
        docs/parity/findings/2026-04-29-001-kmz-autodetect-heuristics.md
        python/pvlayout_engine/tests/parity/test_kmz_parser_parity.py
```

If anything else is dirty, roll back the stray changes.

- [ ] **Step 2: Stage and commit**

Run:

```bash
git add python/pvlayout_engine/pvlayout_core/core/kmz_parser.py \
        python/pvlayout_engine/tests/parity/test_kmz_parser_parity.py \
        docs/parity/findings/2026-04-29-001-kmz-autodetect-heuristics.md \
        docs/PLAN.md
git commit -m "$(cat <<'EOF'
parity: row #4 — KMZ parser + water/canal/TL autodetection

Port legacy core/kmz_parser.py @ baseline-v1-20260429 commits
9362083 + 9c751b7 (185 → ~400 lines):

- Add 4 keyword sets (_WATER_KEYWORDS, _CANAL_KEYWORDS,
  _TL_KEYWORDS, _OBSTACLE_KEYWORDS) and 5 classifier helpers
  (_normalise, _is_water_name, _is_tl_name, _is_obstacle_name,
  _is_water_boundary).
- Add BoundaryInfo.water_obstacles[] field alongside obstacles[]
  and line_obstructions[].
- Add validate_boundaries(path) public function (ring-closure
  check on plant boundaries; water/obstacle polygons skipped
  because the layout engine repairs them downstream).
- Rewrite parse_kmz body with water-routing logic:
  • top-level water-named polygons NOT treated as plant
    boundaries; assigned to overlapping/largest boundary as
    water_obstacles
  • contained polygons split into water_obstacles (water-named)
    vs obstacles (rest)
  • all-water-named fallback picks the largest non-water polygon

_TL_KEYWORDS ported verbatim despite being unused by the parser at
this baseline (likely consumed by a downstream row).

New parity test tests/parity/test_kmz_parser_parity.py asserts
identical output between new app and legacy on three KMZ fixtures
(phaseboundary2, complex-plant-layout, Kudlugi) via sys.path
bootstrap; plus validate_boundaries returns [] on all three.

Sidecar pytest: 80 passed, 6 skipped, 0 failed.

T3 discovery memo at
docs/parity/findings/2026-04-29-001-kmz-autodetect-heuristics.md
captures the keyword lists, classification rules, and 5 open
questions for Prasanta's end-of-port review (no per-row Prasanta
gate per the 2026-04-29 policy update).

Spec: docs/superpowers/specs/2026-04-29-row-4-kmz-parser-autodetect-design.md
Plan: docs/superpowers/plans/2026-04-29-row-4-kmz-parser-autodetect.md
PLAN row: docs/PLAN.md row #4 (T3).
EOF
)" && git log -1 --stat
```

- [ ] **Step 3: Verify the commit landed**

Run:

```bash
git log --oneline -3
```

Expected (top three commits, newest first):

```
<row4-sha>  parity: row #4 — KMZ parser + water/canal/TL autodetection
<plan-sha>  docs: implementation plan for PLAN row #4
<spec-sha>  docs: spec for PLAN row #4 — KMZ parser + water/canal/TL autodetect
```

(Or with the chore commit also visible if that's three commits back.)

---

## Acceptance recap (from `docs/PLAN.md` row #4)

`cd python/pvlayout_engine && uv run pytest tests/ -q` → 80 passed, 6 skipped, 0 failed.
Parity boundary geometry match on all three test KMZ fixtures.
Discovery memo committed at `docs/parity/findings/2026-04-29-001-kmz-autodetect-heuristics.md`.

Met by Task 6 (full suite) and Task 5 Step 2 (isolated parity test run); memo by Task 7.

---

## Out of scope (deferred to later rows — see spec §5)

- **Layout engine integration of `water_obstacles`** — row #6.
- **Satellite-image-driven water detection** — row #5.
- **UI rendering of water obstacles** (blue on canvas) — frontend; not a parity row.
- **Refinements to keyword lists** — gated on Prasanta's end-of-port review.
- **Pydantic schemas / TS types** — `pvlayout_core` only.
