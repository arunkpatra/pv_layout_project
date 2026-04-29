# Row #6 — Layout engine + water-body integration (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port legacy `core/layout_engine.py` into the new project — add `_make_valid_poly` helper, extend `run_layout` with `water_obstacles_wgs84`, switch hard-obstacle subtraction to per-poly repair, add section 3a (water-obstacle subtraction), populate `result.water_obstacle_polygons_wgs84` + `result.boundary_polygon`, rewrite `run_layout_multi` to remove the row #4 bridge.

**Architecture:** Single atomic commit on `main`. Targeted edits to one core file (`pvlayout_core/core/layout_engine.py`), one new parity test file, golden-baseline recapture for any layout shifts. T2 — no discovery memo.

**Tech Stack:** Python 3.12, shapely (with `shapely.validation.make_valid`), pytest. Legacy reference at `/Users/arunkpatra/codebase/PVlayout_Advance` branch `baseline-v1-20260429`.

**Spec:** [`docs/superpowers/specs/2026-04-29-row-6-layout-engine-water-integration-design.md`](../specs/2026-04-29-row-6-layout-engine-water-integration-design.md) (committed `5229cb0`).

**Tier:** T2 (per [`docs/PLAN.md`](../../PLAN.md)) — port + numeric parity test against the legacy baseline.

---

## File structure

**Modify:**
- `python/pvlayout_engine/pvlayout_core/core/layout_engine.py` — six logical edits (helper, signature, hard-obstacle pattern, water section 3a, two new fields, run_layout_multi rewrite)
- `python/pvlayout_engine/tests/golden/expected/{phaseboundary2,complex-plant-layout,Kudlugi Boundary (89 acres),phaseboundary}.json` — re-captured if layout shifts (most likely additive only)
- `docs/PLAN.md` — flip row #6 to **done**, bump 5 → 6 / 12

**Create:**
- `python/pvlayout_engine/tests/parity/test_layout_engine_parity.py` — live cross-compare via sys.path bootstrap on phaseboundary2 + complex-plant-layout

**No discovery memo** (T2; no solar-domain decisions).

---

## Pre-flight

- [ ] **Step 0: Confirm legacy at baseline branch**

Run:

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance && git rev-parse --abbrev-ref HEAD && git rev-parse HEAD
```

Expected:

```
baseline-v1-20260429
397aa2ab460d8f773376f51b393407e5be67dca0
```

If wrong, run `git -C /Users/arunkpatra/codebase/PVlayout_Advance checkout baseline-v1-20260429`. If SHA has advanced, surface — re-baseline conversation needed.

- [ ] **Step 1: Confirm pytest baseline is 84 passed**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: `84 passed, 6 skipped` (from row #5 close).

If the venv lost dev extras (e.g., due to a fresh `uv sync` without `--extra dev`), restore:

```bash
uv sync --extra dev
```

---

## Task 1: Add `_make_valid_poly` helper

**Files:**
- Modify: `python/pvlayout_engine/pvlayout_core/core/layout_engine.py`

- [ ] **Step 1: Insert the helper after `TL_SETBACK_M`**

Find the existing constant (line 23):

```python
TL_SETBACK_M = 15.0   # buffer each side of a line obstruction (TL, canal, etc.)


def run_layout(
```

Replace with:

```python
TL_SETBACK_M = 15.0   # buffer each side of a line obstruction (TL, canal, etc.)


def _make_valid_poly(p):
    """Repair a self-intersecting Shapely polygon."""
    if p.is_valid:
        return p
    try:
        q = p.buffer(0)
        if q.is_valid and not q.is_empty:
            return q
    except Exception:
        pass
    try:
        from shapely.validation import make_valid as _mv
        q = _mv(p)
        if not q.is_empty:
            return q
    except Exception:
        pass
    return p.convex_hull


def run_layout(
```

- [ ] **Step 2: Verify the helper imports + runs on a known-valid polygon**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run python -c "
from shapely.geometry import Polygon
from pvlayout_core.core.layout_engine import _make_valid_poly

# Known-valid square — should pass through untouched
p = Polygon([(0, 0), (10, 0), (10, 10), (0, 10), (0, 0)])
out = _make_valid_poly(p)
assert out.equals(p), 'valid poly should be unchanged'

# Self-intersecting bowtie — should be repaired (not raise)
bowtie = Polygon([(0, 0), (10, 10), (10, 0), (0, 10), (0, 0)])
print('bowtie valid:', bowtie.is_valid)
fixed = _make_valid_poly(bowtie)
print('fixed type:', fixed.geom_type)
print('fixed valid:', fixed.is_valid)
print('fixed area:', round(fixed.area, 1))
print('OK')
"
```

Expected:

```
bowtie valid: False
fixed type: MultiPolygon  (or Polygon)
fixed valid: True
fixed area: 50.0
OK
```

The exact `geom_type` may be `MultiPolygon` (two triangles) — that's fine; what matters is the result is valid.

---

## Task 2: Extend `run_layout` signature with `water_obstacles_wgs84`

**Files:**
- Modify: `python/pvlayout_engine/pvlayout_core/core/layout_engine.py`

- [ ] **Step 1: Update the function signature**

Find:

```python
def run_layout(
    boundary_wgs84: List[Tuple[float, float]],
    obstacles_wgs84: List[List[Tuple[float, float]]],
    params: LayoutParameters,
    centroid_lat: float,
    centroid_lon: float,
    boundary_name: str = "",
    line_obstructions_wgs84: List[List[Tuple[float, float]]] = None,
) -> LayoutResult:
    """Run fixed-tilt layout for a single boundary polygon."""
    result = LayoutResult()
    result.boundary_name = boundary_name
    result.boundary_wgs84 = boundary_wgs84
    result.obstacle_polygons_wgs84 = obstacles_wgs84
```

Replace with:

```python
def run_layout(
    boundary_wgs84: List[Tuple[float, float]],
    obstacles_wgs84: List[List[Tuple[float, float]]],
    params: LayoutParameters,
    centroid_lat: float,
    centroid_lon: float,
    boundary_name: str = "",
    line_obstructions_wgs84: List[List[Tuple[float, float]]] = None,
    water_obstacles_wgs84: List[List[Tuple[float, float]]] = None,
) -> LayoutResult:
    """Run fixed-tilt layout for a single boundary polygon."""
    result = LayoutResult()
    result.boundary_name = boundary_name
    result.boundary_wgs84 = boundary_wgs84
    # Defensive copies match legacy semantics — the result owns its lists.
    result.obstacle_polygons_wgs84 = list(obstacles_wgs84)
    result.water_obstacle_polygons_wgs84 = list(water_obstacles_wgs84 or [])
```

- [ ] **Step 2: Verify the signature change**

Run:

```bash
uv run python -c "
import inspect
from pvlayout_core.core.layout_engine import run_layout
sig = inspect.signature(run_layout)
print('params:', list(sig.parameters.keys()))
print('water_obstacles_wgs84 default:', sig.parameters['water_obstacles_wgs84'].default)
"
```

Expected:

```
params: ['boundary_wgs84', 'obstacles_wgs84', 'params', 'centroid_lat', 'centroid_lon', 'boundary_name', 'line_obstructions_wgs84', 'water_obstacles_wgs84']
water_obstacles_wgs84 default: None
```

---

## Task 3: Switch hard-obstacle subtraction to per-poly `_make_valid_poly`

**Files:**
- Modify: `python/pvlayout_engine/pvlayout_core/core/layout_engine.py`

- [ ] **Step 1: Replace the hard-obstacle subtraction block**

Find:

```python
    # ------------------------------------------------------------------
    # 3. Subtract obstacles
    # ------------------------------------------------------------------
    if obstacles_utm:
        obs_polys = [Polygon(o) for o in obstacles_utm if len(o) >= 3]
        obs_union = unary_union(obs_polys)
        usable_poly = usable_poly.difference(obs_union)

    if usable_poly.is_empty:
        raise ValueError("No usable area remains after subtracting obstacles.")
```

Replace with:

```python
    # ------------------------------------------------------------------
    # 3. Subtract solid obstacles
    # ------------------------------------------------------------------
    if obstacles_utm:
        obs_polys = []
        for o in obstacles_utm:
            if len(o) < 3:
                continue
            op = _make_valid_poly(Polygon(o))
            if not op.is_empty:
                obs_polys.append(op)
        if obs_polys:
            try:
                usable_poly = usable_poly.difference(unary_union(obs_polys))
            except Exception:
                for op in obs_polys:
                    try:
                        usable_poly = usable_poly.difference(op)
                    except Exception:
                        pass

    if usable_poly.is_empty:
        raise ValueError("No usable area remains after subtracting obstacles.")
```

The header changes from "Subtract obstacles" to "Subtract solid obstacles" (legacy comment), distinguishing it from section 3a (water) coming next.

- [ ] **Step 2: Verify on phaseboundary2 (smoke)**

Run:

```bash
uv run python -c "
from pvlayout_core.core.kmz_parser import parse_kmz
from pvlayout_core.core.layout_engine import run_layout_multi
from pvlayout_core.models.project import LayoutParameters
parsed = parse_kmz('tests/golden/kmz/phaseboundary2.kmz')
results = run_layout_multi(parsed.boundaries, LayoutParameters(), parsed.centroid_lat, parsed.centroid_lon)
valid = [r for r in results if r.usable_polygon is not None]
print('valid results:', len(valid))
print('first total_modules:', valid[0].total_modules)
"
```

Expected:

```
valid results: 1
first total_modules: <integer>
```

Note: at this point the row #4 bridge (`merged_obstacles`) is still in `run_layout_multi`, so phaseboundary2's water_obstacles are still being passed via `obstacles_wgs84`. Total modules should be the same as before this task. The point of this smoke test is just to confirm the per-poly + fallback pattern doesn't break anything on a known-good fixture.

---

## Task 4: Add water-obstacle subtraction (section 3a)

**Files:**
- Modify: `python/pvlayout_engine/pvlayout_core/core/layout_engine.py`

- [ ] **Step 1: Insert section 3a between section 3 and section 3b**

Find:

```python
    if usable_poly.is_empty:
        raise ValueError("No usable area remains after subtracting obstacles.")

    # ------------------------------------------------------------------
    # 3b. Buffer line obstructions (TL, canals, roads) and subtract
    # ------------------------------------------------------------------
```

Replace with:

```python
    if usable_poly.is_empty:
        raise ValueError("No usable area remains after subtracting obstacles.")

    # ------------------------------------------------------------------
    # 3a. Subtract water obstacles (ponds, canals, reservoirs)
    # ------------------------------------------------------------------
    if water_obstacles_wgs84:
        w_polys = []
        for wo in [wgs84_to_utm(w, epsg) for w in water_obstacles_wgs84]:
            if len(wo) < 3:
                continue
            wp = _make_valid_poly(Polygon(wo))
            if not wp.is_empty:
                w_polys.append(wp)
        if w_polys:
            try:
                usable_poly = usable_poly.difference(unary_union(w_polys))
            except Exception:
                for wp in w_polys:
                    try:
                        usable_poly = usable_poly.difference(wp)
                    except Exception:
                        pass

    # ------------------------------------------------------------------
    # 3b. Buffer line obstructions (TL, canals, roads) and subtract
    # ------------------------------------------------------------------
```

Section 3a runs even when `water_obstacles_wgs84 is None` (the `if` guards against that). Empty list also no-ops. No `is_empty` check after 3a because section 3 already raised if obstacles consumed everything; water obstacles are typically a subset of plant area, so this rarely zeros out.

- [ ] **Step 2: Smoke-call with explicit water_obstacles**

Run:

```bash
uv run python -c "
from pvlayout_core.core.layout_engine import run_layout
from pvlayout_core.models.project import LayoutParameters

# Synthetic 1km x 1km plant, single 100x100 m water polygon in middle
boundary = [(78.0, 12.0), (78.01, 12.0), (78.01, 12.01), (78.0, 12.01), (78.0, 12.0)]
water = [[(78.005, 12.005), (78.006, 12.005), (78.006, 12.006), (78.005, 12.006), (78.005, 12.005)]]

r = run_layout(
    boundary_wgs84=boundary,
    obstacles_wgs84=[],
    params=LayoutParameters(),
    centroid_lat=12.005,
    centroid_lon=78.005,
    water_obstacles_wgs84=water,
)
print('total_modules:', r.total_modules)
print('water_obstacle_polygons_wgs84 count:', len(r.water_obstacle_polygons_wgs84))
print('OK')
"
```

Expected:

```
total_modules: <some integer>
water_obstacle_polygons_wgs84 count: 1
OK
```

---

## Task 5: Populate `result.boundary_polygon`

**Files:**
- Modify: `python/pvlayout_engine/pvlayout_core/core/layout_engine.py`

`result.water_obstacle_polygons_wgs84` was already populated in Task 2 Step 1 (at the top of `run_layout`). This task adds the second row #1 field.

- [ ] **Step 1: Set `result.boundary_polygon` next to `result.usable_polygon`**

Find:

```python
    result.placed_tables      = placed
    result.placed_icrs        = icrs
    result.tables_pre_icr     = tables_pre_icr   # snapshot before ICR clearance
    result.usable_polygon     = usable_poly       # stored for drag validation
    result.total_modules      = total_modules
```

Replace with:

```python
    result.placed_tables      = placed
    result.placed_icrs        = icrs
    result.tables_pre_icr     = tables_pre_icr   # snapshot before ICR clearance
    result.usable_polygon     = usable_poly       # stored for drag validation
    result.boundary_polygon   = boundary_poly    # full boundary (pre-setback) for cable routing
    result.total_modules      = total_modules
```

- [ ] **Step 2: Verify both fields populated**

Run:

```bash
uv run python -c "
from pvlayout_core.core.kmz_parser import parse_kmz
from pvlayout_core.core.layout_engine import run_layout_multi
from pvlayout_core.models.project import LayoutParameters
parsed = parse_kmz('tests/golden/kmz/phaseboundary2.kmz')
results = run_layout_multi(parsed.boundaries, LayoutParameters(), parsed.centroid_lat, parsed.centroid_lon)
r = [r for r in results if r.usable_polygon is not None][0]
print('water_obstacle_polygons_wgs84 count:', len(r.water_obstacle_polygons_wgs84))
print('boundary_polygon type:', type(r.boundary_polygon).__name__ if r.boundary_polygon else 'None')
print('boundary_polygon area m2:', round(r.boundary_polygon.area, 1) if r.boundary_polygon else 'None')
"
```

Expected (note: Task 6 hasn't run yet, so the row #4 bridge is still active and `water_obstacle_polygons_wgs84` will reflect what's passed via `obstacles_wgs84` from the bridge — likely `0`):

```
water_obstacle_polygons_wgs84 count: 0
boundary_polygon type: Polygon
boundary_polygon area m2: <area in square metres of UTM-projected boundary>
```

The `boundary_polygon` should be a non-empty shapely `Polygon`. The water count being 0 here is expected at this midpoint state; Task 6 fixes it.

---

## Task 6: Rewrite `run_layout_multi` (remove row #4 bridge, pass water_obstacles_wgs84)

**Files:**
- Modify: `python/pvlayout_engine/pvlayout_core/core/layout_engine.py`

- [ ] **Step 1: Replace the entire body of `run_layout_multi`**

Find the entire `run_layout_multi` function (currently ~36 lines including the row #4 bridge comment block). Replace with:

```python
def run_layout_multi(
    boundaries: List[BoundaryInfo],
    params: LayoutParameters,
    centroid_lat: float,
    centroid_lon: float,
) -> List[LayoutResult]:
    """Run layout for every boundary in the KMZ file."""
    results = []
    for i, b in enumerate(boundaries):
        name = b.name if b.name else f"Plant {i + 1}"
        try:
            r = run_layout(
                boundary_wgs84=b.coords,
                obstacles_wgs84=b.obstacles,
                params=params,
                centroid_lat=centroid_lat,
                centroid_lon=centroid_lon,
                boundary_name=name,
                line_obstructions_wgs84=b.line_obstructions,
                water_obstacles_wgs84=getattr(b, "water_obstacles", []),
            )
            results.append(r)
        except Exception as exc:
            empty = LayoutResult()
            empty.boundary_name  = f"{name} [ERROR: {exc}]"
            empty.boundary_wgs84 = b.coords
            results.append(empty)
    return results
```

The row #4 bridge (`merged_obstacles = list(b.obstacles) + list(getattr(b, "water_obstacles", []))`) and its preceding comment block are **gone**. `obstacles_wgs84=b.obstacles` is now the original hard obstacles only; `water_obstacles_wgs84=getattr(b, "water_obstacles", [])` carries water polygons through their own subtraction path.

- [ ] **Step 2: Verify on phaseboundary2**

Run:

```bash
uv run python -c "
from pvlayout_core.core.kmz_parser import parse_kmz
from pvlayout_core.core.layout_engine import run_layout_multi
from pvlayout_core.models.project import LayoutParameters
parsed = parse_kmz('tests/golden/kmz/phaseboundary2.kmz')
results = run_layout_multi(parsed.boundaries, LayoutParameters(), parsed.centroid_lat, parsed.centroid_lon)
valid = [r for r in results if r.usable_polygon is not None]
r = valid[0]
print('valid results:', len(valid))
print('total_modules:', r.total_modules)
print('water_obstacle_polygons_wgs84 count:', len(r.water_obstacle_polygons_wgs84))
print('boundary_polygon populated:', r.boundary_polygon is not None)
"
```

Expected:

```
valid results: 1
total_modules: <integer; should match pre-row-#6 value if water exclusion is functionally equivalent>
water_obstacle_polygons_wgs84 count: 2
boundary_polygon populated: True
```

The water count is now `2` (phaseboundary2 has 2 ponds). The `total_modules` value should be approximately the same as before — both the bridge and the proper path subtract water from the usable polygon. If it shifts substantially, surface and investigate (`_make_valid_poly` may have repaired something differently).

- [ ] **Step 3: Verify the bridge comment is gone**

Run:

```bash
grep -n "ROW #4 BRIDGE\|merged_obstacles" /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/pvlayout_core/core/layout_engine.py
```

Expected: no output (both strings removed).

---

## Task 7: Add the parity test (live cross-compare on both plants)

**Files:**
- Create: `python/pvlayout_engine/tests/parity/test_layout_engine_parity.py`

- [ ] **Step 1: Create the test file**

Write the entire file:

```python
"""
Parity test for layout engine + water-body integration (Row #6 of docs/PLAN.md).

Live cross-compare via sys.path bootstrap. Runs legacy run_layout_multi
and new-app run_layout_multi on the same KMZ fixtures with default
LayoutParameters (cables OFF). Asserts per-result + per-table parity
within 1e-6 m, plus that the two row #1 fields are populated.
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[4]
KMZ_DIR = REPO_ROOT / "python/pvlayout_engine/tests/golden/kmz"
LEGACY_REPO = Path("/Users/arunkpatra/codebase/PVlayout_Advance")
POS_TOL = 1e-6


def _purge_legacy_modules():
    """Remove cached bare-namespace modules so legacy and new-app
    namespaces don't collide. Legacy's layout_engine imports from
    core.*, models.*, and utils.*, all of which need purging."""
    for m in list(sys.modules):
        if (
            m == "core" or m.startswith("core.")
            or m == "models" or m.startswith("models.")
            or m == "utils" or m.startswith("utils.")
        ):
            del sys.modules[m]


@pytest.fixture(scope="module")
def legacy_layout():
    """Module-scoped: bound the sys.path mutation to this test module's lifetime."""
    if not LEGACY_REPO.exists():
        pytest.skip(f"legacy repo not at {LEGACY_REPO}")
    _purge_legacy_modules()
    sys.path.insert(0, str(LEGACY_REPO))
    try:
        from core import kmz_parser as legacy_parser
        from core import layout_engine as legacy_engine
        from models import project as legacy_project
        yield (legacy_parser, legacy_engine, legacy_project)
    finally:
        try:
            sys.path.remove(str(LEGACY_REPO))
        except ValueError:
            pass
        _purge_legacy_modules()


@pytest.mark.parametrize("kmz_name", [
    "phaseboundary2.kmz",
    "complex-plant-layout.kmz",
])
def test_run_layout_multi_parity_with_legacy(legacy_layout, kmz_name):
    """FT layout pipeline parity on both reference plants. Cables OFF."""
    legacy_parser, legacy_engine, legacy_project = legacy_layout
    kmz_path = KMZ_DIR / kmz_name
    assert kmz_path.exists(), f"missing fixture: {kmz_path}"

    # --- Legacy side ---
    legacy_parsed = legacy_parser.parse_kmz(str(kmz_path))
    legacy_params = legacy_project.LayoutParameters()
    legacy_results = legacy_engine.run_layout_multi(
        boundaries=legacy_parsed.boundaries,
        params=legacy_params,
        centroid_lat=legacy_parsed.centroid_lat,
        centroid_lon=legacy_parsed.centroid_lon,
    )

    # --- New side ---
    # Re-import after the legacy fixture is set up; pvlayout_core.* is a
    # different namespace from bare `core.*` so it resolves cleanly.
    from pvlayout_core.core.kmz_parser import parse_kmz
    from pvlayout_core.core.layout_engine import run_layout_multi
    from pvlayout_core.models.project import LayoutParameters
    new_parsed = parse_kmz(str(kmz_path))
    new_params = LayoutParameters()
    new_results = run_layout_multi(
        boundaries=new_parsed.boundaries,
        params=new_params,
        centroid_lat=new_parsed.centroid_lat,
        centroid_lon=new_parsed.centroid_lon,
    )

    # Filter to results with usable polygon — error-result entries skip
    legacy_valid = [r for r in legacy_results if r.usable_polygon is not None]
    new_valid = [r for r in new_results if r.usable_polygon is not None]

    assert len(legacy_valid) == len(new_valid), (
        f"{kmz_name} valid-result count drift: "
        f"legacy {len(legacy_valid)} vs new {len(new_valid)}"
    )

    for i, (lr, nr) in enumerate(zip(legacy_valid, new_valid)):
        label = f"{kmz_name} result[{i}] ({lr.boundary_name})"
        assert lr.boundary_name == nr.boundary_name, f"{label} boundary_name"
        assert lr.utm_epsg == nr.utm_epsg, f"{label} utm_epsg"
        assert lr.total_modules == nr.total_modules, f"{label} total_modules"
        assert len(lr.placed_tables) == len(nr.placed_tables), (
            f"{label} placed_tables count: legacy {len(lr.placed_tables)} vs new {len(nr.placed_tables)}"
        )

        # Per-table position match
        for j, (lt, nt) in enumerate(zip(lr.placed_tables, nr.placed_tables)):
            assert math.isclose(lt.x, nt.x, abs_tol=POS_TOL), f"{label} placed_tables[{j}].x"
            assert math.isclose(lt.y, nt.y, abs_tol=POS_TOL), f"{label} placed_tables[{j}].y"
            assert math.isclose(lt.width, nt.width, abs_tol=POS_TOL), f"{label} placed_tables[{j}].width"
            assert math.isclose(lt.height, nt.height, abs_tol=POS_TOL), f"{label} placed_tables[{j}].height"
            assert lt.row_index == nt.row_index, f"{label} placed_tables[{j}].row_index"
            assert lt.col_index == nt.col_index, f"{label} placed_tables[{j}].col_index"

        # Water obstacles propagated
        assert lr.water_obstacle_polygons_wgs84 == nr.water_obstacle_polygons_wgs84, (
            f"{label} water_obstacle_polygons_wgs84"
        )

        # Boundary polygon populated (contract for cable routing)
        assert nr.boundary_polygon is not None, f"{label} boundary_polygon should be populated"
```

- [ ] **Step 2: Run the parity test in isolation**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run pytest tests/parity/test_layout_engine_parity.py -v 2>&1 | tail -10
```

Expected:

```
tests/parity/test_layout_engine_parity.py::test_run_layout_multi_parity_with_legacy[phaseboundary2.kmz] PASSED
tests/parity/test_layout_engine_parity.py::test_run_layout_multi_parity_with_legacy[complex-plant-layout.kmz] PASSED
```

If `phaseboundary2.kmz` fails on a specific assertion message, that names which field drifted — investigate Tasks 1–6 against the legacy file at `/Users/arunkpatra/codebase/PVlayout_Advance/core/layout_engine.py`.

If `complex-plant-layout.kmz` hangs >2 min, surface — the timing concern from row #2's manifest was for cables-on capture; layout-only should be fast. If it's still slow, document and reduce scope to phaseboundary2-only with a `pytest.skip` on the larger plant.

---

## Task 8: Run the full pytest suite

**Files:**
- No edit. Acceptance check.

- [ ] **Step 1: Run the full suite**

Run:

```bash
uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: a line ending with `86 passed, 6 skipped`. (84 baseline + 2 new parity tests.)

If a different count is shown:
- `< 86 passed`: identify failures via `uv run pytest tests/ -q 2>&1 | grep -E "FAIL|ERROR"`. Most likely culprits if anything regressed:
  - `tests/golden/test_layout_parity.py::test_layout_matches_baseline[*]` — golden baselines may shift; this is what Task 9 addresses, so failures here are expected at this point and resolved by re-capture
  - Cable parity (P0) or LA parity (row #2) — would indicate a real regression; investigate
- `> 86 passed`: count miscalculation; check the math.

If only the golden tests fail, proceed to Task 9 — they're expected to need recapture. If cable / LA parity fails, stop and investigate before continuing.

---

## Task 9: Re-capture golden baselines + inspect

**Files:**
- Modify (recapture overwrites): `python/pvlayout_engine/tests/golden/expected/{phaseboundary2,complex-plant-layout,Kudlugi Boundary (89 acres),phaseboundary}.json`

- [ ] **Step 1: Run the capture script**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run python scripts/capture_golden.py 2>&1 | tail -10
```

Expected: four lines like `Capturing: <stem>.kmz → tests/golden/expected/<stem>.json`.

- [ ] **Step 2: Inspect the diffs**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git diff --stat python/pvlayout_engine/tests/golden/expected/
```

Expected output: a list of modified JSON files. Look for size of each diff. Big numbers (~thousands of lines) indicate substantial change; small numbers (~tens) indicate additive-only changes (water_obstacle_polygons_wgs84 newly populated).

Then inspect ONE file's actual changes:

```bash
git diff python/pvlayout_engine/tests/golden/expected/phaseboundary2.json | head -80
```

Decision tree:

- **If only `water_obstacle_polygons_wgs84` keys are newly populated** (added array entries) AND counts/totals (`total_modules`, `placed_tables` length) are unchanged → **proceed to Step 3** (commit-ready additive recapture).

- **If `total_modules` changes**, or `placed_tables` count changes, or table positions shift → **STOP**. Surface the diff to the user. This means `_make_valid_poly` is reshaping the usable polygon on a fixture we expected to be a no-op (per the spec §4 risk assessment). Discuss before committing.

- [ ] **Step 3: Re-run pytest after recapture**

Run:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: `86 passed, 6 skipped`. The golden tests now pass against the refreshed baselines.

---

## Task 10: Flip PLAN.md status

**Files:**
- Modify: `docs/PLAN.md`

- [ ] **Step 1: Update Row #6 status to `done`**

Find:

```markdown
| 6 | Layout engine + water-body integration | T2 | `core/layout_engine.py` @ `9362083` + `9c751b7` | Parity table count + position match on both reference plants; row-#4 water_obstacles bridge in `layout_engine.py:run_layout_multi` removed (water_obstacles routed through their own exclusion path with legacy's setback semantics). | todo |
```

Replace with:

```markdown
| 6 | Layout engine + water-body integration | T2 | `core/layout_engine.py` @ `9362083` + `9c751b7` | Parity table count + position match on both reference plants; row-#4 water_obstacles bridge in `layout_engine.py:run_layout_multi` removed (water_obstacles routed through their own exclusion path with legacy's setback semantics). | **done** |
```

- [ ] **Step 2: Bump the count in the header status line**

Change:

```markdown
**Status:** 5 / 12 done.
```

to:

```markdown
**Status:** 6 / 12 done.
```

---

## Task 11: Commit the row

**Files:**
- Stage and commit:
  - `python/pvlayout_engine/pvlayout_core/core/layout_engine.py`
  - `python/pvlayout_engine/tests/parity/test_layout_engine_parity.py`
  - `python/pvlayout_engine/tests/golden/expected/*.json` (whichever shifted)
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
modified:   python/pvlayout_engine/pvlayout_core/core/layout_engine.py
modified:   python/pvlayout_engine/tests/golden/expected/<some-or-all>.json

Untracked files:
        python/pvlayout_engine/tests/parity/test_layout_engine_parity.py
```

If anything else is dirty, roll back the stray changes.

- [ ] **Step 2: Stage and commit**

Run:

```bash
git add python/pvlayout_engine/pvlayout_core/core/layout_engine.py \
        python/pvlayout_engine/tests/parity/test_layout_engine_parity.py \
        python/pvlayout_engine/tests/golden/expected/ \
        docs/PLAN.md

git commit -m "$(cat <<'EOF'
parity: row #6 — layout engine + water-body integration

Port legacy core/layout_engine.py @ baseline-v1-20260429 commits
9362083 + 9c751b7. Three substantive changes:

1. Add _make_valid_poly helper — repairs self-intersecting shapely
   polygons via buffer(0) → shapely.validation.make_valid →
   convex_hull fallback.

2. Extend run_layout signature with water_obstacles_wgs84 parameter;
   add section 3a (water-obstacle subtraction with the same per-poly
   _make_valid_poly + per-poly fallback pattern legacy uses for hard
   obstacles). Hard-obstacle subtraction also switches to per-poly
   repair (was: simple unary_union + difference; now: defensive
   per-poly with fallback if union fails).

3. Populate result.water_obstacle_polygons_wgs84 (defensive
   list(...) copy) and result.boundary_polygon (full pre-setback
   boundary, contract for downstream cable routing).

Row #4 bridge removed: run_layout_multi's "merged_obstacles =
obstacles + water_obstacles" line and its preceding 8-line comment
block are gone. water_obstacles flow through their own subtraction
path via the new section 3a.

Setback semantics: legacy at this baseline does NOT use different
setbacks for water vs hard obstacles (both are subtract-from-usable
with no buffer; only LineString line_obstructions get
TL_SETBACK_M=15m buffer). The row #4 bridge comment overstated this;
it gets removed by the bridge removal.

No SAT dispatch in run_layout_multi — that's row #9's scope (adds
core/tracker_layout_engine.py and the design_type if/else branch).

New parity test tests/parity/test_layout_engine_parity.py asserts
identical layout output between new app and legacy on
phaseboundary2.kmz and complex-plant-layout.kmz via sys.path
bootstrap. Cables OFF — LA + cable parity is already tested by
rows #2 + P0. Per-table position match within 1e-6 m. Plus
result.water_obstacle_polygons_wgs84 deep-equality and
result.boundary_polygon non-None contract assertion.

Golden baselines tests/golden/expected/*.json re-captured to absorb
the row #6 layout shift (most likely additive only — newly populated
water_obstacle_polygons_wgs84 field).

Sidecar pytest: 86 passed, 6 skipped, 0 failed (was 84).

Spec: docs/superpowers/specs/2026-04-29-row-6-layout-engine-water-integration-design.md
Plan: docs/superpowers/plans/2026-04-29-row-6-layout-engine-water-integration.md
PLAN row: docs/PLAN.md row #6 (T2).
EOF
)" && git log -1 --stat
```

- [ ] **Step 3: Verify the commit landed**

Run:

```bash
git log --oneline -3
```

Expected:

```
<row6-sha>  parity: row #6 — layout engine + water-body integration
<plan-sha>  docs: implementation plan for PLAN row #6
<spec-sha>  docs: spec for PLAN row #6 — layout engine + water-body integration
```

---

## Acceptance recap (from `docs/PLAN.md` row #6)

`cd python/pvlayout_engine && uv run pytest tests/ -q` → 86 passed, 6 skipped, 0 failed.
Per-table position parity on both phaseboundary2 + complex-plant-layout.
Row #4 bridge removed (verified by Task 6 Step 3 grep).
`result.water_obstacle_polygons_wgs84` and `result.boundary_polygon` populated (verified by parity test).

Met by Task 8 (full suite) + Task 7 Step 2 (parity isolated) + Task 6 Step 3 (bridge gone).

---

## Out of scope (deferred to later rows / post-parity)

- **SAT dispatch in `run_layout_multi`** — row #9 adds when it lands `core/tracker_layout_engine.py`.
- **Cable routing using `boundary_polygon`** — already exists for Pattern V (S11.5); row #6 just populates the field for it to read.
- **Frontend rendering** of water obstacles in blue — sidecar contract is now stable; frontend rows post-parity wire it.
- **`_TL_KEYWORDS` consumption** for filtering LineStrings by name — still dormant; no row in PLAN.md owns it.
- **Refinements to `_make_valid_poly`** — port verbatim.
- **Pydantic / TS-types** — wire schema already gained `water_obstacles` in row #4; no further schema changes.
