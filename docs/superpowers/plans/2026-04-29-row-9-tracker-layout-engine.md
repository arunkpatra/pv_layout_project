# Row #9 Implementation Plan — Single-axis-tracker layout mode

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the legacy Single-Axis-Tracker (SAT) layout engine into the new app as a new `core/tracker_layout_engine.py`, wire it into `run_layout_multi` via `params.design_type` dispatch, and verify bit-exact parity on real KMZ fixtures.

**Architecture:** One new file (~301 lines, verbatim port from legacy `baseline-v1-20260429` @ `9362083` with `core.X`/`models.X`/`utils.X` import-prefix substitution to `pvlayout_core.X`) + a 14-line dispatch edit in `layout_engine.py`'s `run_layout_multi`. No data-model or wire-schema changes — `LayoutParameters.tracker_*` fields, `DesignType.SINGLE_AXIS_TRACKER`, and `LayoutResult` shape are all already present. Parity verified via a new `tests/parity/test_tracker_layout_engine_parity.py` mirroring row #6's pattern: legacy and new run in the same pytest process via sys.path bootstrap on `phaseboundary2.kmz` + `complex-plant-layout.kmz`.

**Tech Stack:** Python 3.13, shapely 2.x, pyproj, pytest, numpy. uv-managed venv.

**Spec:** [docs/superpowers/specs/2026-04-29-row-9-tracker-layout-engine-design.md](../specs/2026-04-29-row-9-tracker-layout-engine-design.md)

---

## File map

- **Create:** `python/pvlayout_engine/pvlayout_core/core/tracker_layout_engine.py` (~301 lines, verbatim port).
- **Modify:** `python/pvlayout_engine/pvlayout_core/core/layout_engine.py` — `run_layout_multi` body (lines ~259-290): add SAT dispatch branch.
- **Create:** `python/pvlayout_engine/tests/parity/test_tracker_layout_engine_parity.py` (~150 lines, 3 tests).
- **Create:** `docs/parity/findings/2026-04-29-005-tracker-layout-engine-port.md`.
- **Modify:** `docs/PLAN.md` — row #9 status `todo` → `done`; header `8 / 12 done` → `9 / 12 done`.

---

## Pre-flight (one-time)

- [ ] **Step 0.1: Verify legacy repo state**

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance && git rev-parse baseline-v1-20260429
```

Expected: `397aa2ab460d8f773376f51b393407e5be67dca0` (the SHA must resolve, not error).

- [ ] **Step 0.2: Verify clean working tree**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git status -s
```

Expected: empty output.

- [ ] **Step 0.3: Verify baseline pytest is green**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: `98 passed, 6 skipped` (or similar with `0 failed`). If pytest is missing, run `uv sync --extra dev` first.

- [ ] **Step 0.4: Verify required KMZ fixtures exist**

```bash
ls /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/tests/golden/kmz/{phaseboundary2,complex-plant-layout}.kmz
```

Expected: both files listed (no "No such file" errors).

---

## Task 1: Create `tracker_layout_engine.py`

**Files:**
- Create: `python/pvlayout_engine/pvlayout_core/core/tracker_layout_engine.py`

This is a verbatim port of legacy `core/tracker_layout_engine.py` (301 lines @ commit `9362083`) with three import-prefix substitutions:
- `from models.project import …` → `from pvlayout_core.models.project import …`
- `from core.icr_placer import place_icrs` → `from pvlayout_core.core.icr_placer import place_icrs`
- `from core.kmz_parser import BoundaryInfo` → `from pvlayout_core.core.kmz_parser import BoundaryInfo`
- `from utils.geo_utils import …` → `from pvlayout_core.utils.geo_utils import …` (both at top and the lazy import inside section 3b)

- [ ] **Step 1.1: Write the new file**

Create `python/pvlayout_engine/pvlayout_core/core/tracker_layout_engine.py` with this exact content:

```python
"""
Single Axis Tracker (SAT / HSAT) Layout Engine
===============================================
Places horizontal single-axis tracker units inside the plant boundary.

Tracker geometry
----------------
  • Rotation axis runs **North–South** (torque tube is a N-S line).
  • Panels sweep **East–West** (tracker rotates ±max_angle from horizontal).
  • Each "tracker unit" placed as a PlacedTable:
        width  = E-W aperture  = tracker_modules_across × module.width
        height = N-S length    = tracker_modules_per_string × module.length
  • Tracker rows (multiple units end-to-end N-S) are spaced E-W:
        E-W pitch = aperture_width / GCR
  • A service gap separates successive tracker units within the same N-S row:
        N-S step = tracker_ns_length + tracker_ns_gap_m

The layout sweep is the mirror of fixed-tilt:
  Fixed tilt: outer loop = N-S (rows), inner loop = E-W (tables in row)
  SAT       : outer loop = E-W (tracker row columns), inner loop = N-S (units in column)
"""
from typing import List, Tuple

from shapely.geometry import Polygon, box
from shapely.ops import unary_union

from pvlayout_core.models.project import (
    LayoutParameters, LayoutResult, PlacedTable, TableConfig,
    DesignType, M2_PER_ACRE,
)
from pvlayout_core.core.icr_placer import place_icrs
from pvlayout_core.core.kmz_parser import BoundaryInfo
from pvlayout_core.utils.geo_utils import get_utm_epsg, wgs84_to_utm

TL_SETBACK_M = 15.0   # setback each side of line obstructions


def _make_valid_poly(p):
    """Repair a self-intersecting Shapely polygon (same logic as layout_engine)."""
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


def run_layout_tracker(
    boundary_wgs84: List[Tuple[float, float]],
    obstacles_wgs84: List[List[Tuple[float, float]]],
    params: LayoutParameters,
    centroid_lat: float,
    centroid_lon: float,
    boundary_name: str = "",
    line_obstructions_wgs84: List[List[Tuple[float, float]]] = None,
    water_obstacles_wgs84: List[List[Tuple[float, float]]] = None,
) -> LayoutResult:
    """
    Run Single Axis Tracker layout for one boundary polygon.
    Returns a LayoutResult with PlacedTable objects representing tracker units.
    """
    result = LayoutResult()
    result.boundary_name  = boundary_name
    result.design_type    = DesignType.SINGLE_AXIS_TRACKER
    result.boundary_wgs84 = boundary_wgs84
    result.obstacle_polygons_wgs84      = list(obstacles_wgs84)
    result.water_obstacle_polygons_wgs84 = list(water_obstacles_wgs84 or [])

    # ------------------------------------------------------------------
    # 1. UTM projection
    # ------------------------------------------------------------------
    epsg = get_utm_epsg(centroid_lon, centroid_lat)
    result.utm_epsg = epsg

    boundary_utm  = wgs84_to_utm(boundary_wgs84, epsg)
    obstacles_utm = [wgs84_to_utm(obs, epsg) for obs in obstacles_wgs84]

    boundary_poly = _make_valid_poly(Polygon(boundary_utm))
    if boundary_poly.geom_type == "MultiPolygon":
        boundary_poly = max(boundary_poly.geoms, key=lambda g: g.area)

    result.total_area_m2    = boundary_poly.area
    result.total_area_acres = round(boundary_poly.area / M2_PER_ACRE, 3)

    # ------------------------------------------------------------------
    # 2. Perimeter road setback
    # ------------------------------------------------------------------
    road_w = params.perimeter_road_width
    try:
        usable_poly = boundary_poly.buffer(-road_w, join_style=2)
    except Exception:
        usable_poly = boundary_poly.convex_hull.buffer(-road_w, join_style=2)

    if usable_poly.is_empty:
        raise ValueError(
            f"Perimeter road width ({road_w} m) leaves no usable area."
        )

    # ------------------------------------------------------------------
    # 3. Subtract solid obstacles
    # ------------------------------------------------------------------
    if obstacles_utm:
        obs_polys = []
        for o in obstacles_utm:
            if len(o) < 3:
                continue
            op = _make_valid_poly(Polygon(o))
            if op.geom_type == "MultiPolygon":
                op = max(op.geoms, key=lambda g: g.area)
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

    # ------------------------------------------------------------------
    # 3a. Subtract water obstacles
    # ------------------------------------------------------------------
    if water_obstacles_wgs84:
        w_polys = []
        for wo in [wgs84_to_utm(w, epsg) for w in water_obstacles_wgs84]:
            if len(wo) < 3:
                continue
            wp = _make_valid_poly(Polygon(wo))
            if wp.geom_type == "MultiPolygon":
                wp = max(wp.geoms, key=lambda g: g.area)
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
    # 3b. Buffer line obstructions (TL, canals) and subtract
    # ------------------------------------------------------------------
    if line_obstructions_wgs84:
        from shapely.geometry import LineString as _LS
        line_polys = []
        for lc in line_obstructions_wgs84:
            line_utm = wgs84_to_utm(lc, epsg)
            try:
                sline   = _LS(line_utm)
                buffered = sline.buffer(TL_SETBACK_M, cap_style=2)
                if not buffered.is_empty:
                    line_polys.append(buffered)
            except Exception:
                pass
        if line_polys:
            line_union = unary_union(line_polys)
            usable_poly = usable_poly.difference(line_union)
            from pvlayout_core.utils.geo_utils import utm_to_wgs84
            for bp in line_polys:
                try:
                    if bp.geom_type == "Polygon":
                        result.obstacle_polygons_wgs84.append(
                            utm_to_wgs84(list(bp.exterior.coords), epsg)
                        )
                    elif bp.geom_type == "MultiPolygon":
                        for sub in bp.geoms:
                            result.obstacle_polygons_wgs84.append(
                                utm_to_wgs84(list(sub.exterior.coords), epsg)
                            )
                except Exception:
                    pass

    result.net_layout_area_m2 = usable_poly.area

    # ------------------------------------------------------------------
    # 4. Tracker unit dimensions
    #
    #  Orientation determines which module edge runs N-S (along the tube):
    #    Portrait  (P): long side (module.length) runs N-S,
    #                   short side (module.width) runs E-W
    #    Landscape (L): short side (module.width) runs N-S,
    #                   long side  (module.length) runs E-W
    #
    #  E-W aperture  = modules_across × mod_ew
    #  N-S unit span = strings_per_tracker × modules_per_string × mod_ns
    # ------------------------------------------------------------------
    module = params.module
    # Orientation convention:
    #   Portrait  (P): module long side (length) runs E-W across the aperture
    #   Landscape (L): module long side (length) runs N-S along the torque tube
    portrait = (params.tracker_orientation.lower() != "landscape")
    mod_ew = module.length if portrait else module.width    # E-W dim per module
    mod_ns = module.width  if portrait else module.length   # N-S dim per module

    trk_w  = params.tracker_modules_across * mod_ew                          # E-W aperture (m)
    trk_ns = (params.tracker_strings_per_tracker *
              params.tracker_modules_per_string * mod_ns)                     # N-S length  (m)

    if trk_w <= 0 or trk_ns <= 0:
        raise ValueError("Tracker dimensions must be positive.")

    # ------------------------------------------------------------------
    # 5. Row spacing — user specifies E-W pitch directly
    # ------------------------------------------------------------------
    pitch_ew = max(trk_w + 0.5, params.tracker_pitch_ew_m)   # must be > aperture
    ns_step  = trk_ns + params.tracker_ns_gap_m               # N-S step inside one row

    result.tilt_angle_deg = params.tracker_max_angle_deg      # max rotation angle stored here
    result.row_pitch_m    = round(pitch_ew, 3)
    result.gcr_achieved   = round(trk_w / pitch_ew, 4) if pitch_ew > 0 else 0

    # ------------------------------------------------------------------
    # 6. Place tracker units
    #    Outer loop: E-W  (x = tracker row column index)
    #    Inner loop: N-S  (y = position within the N-S column)
    # ------------------------------------------------------------------
    minx, miny, maxx, maxy = usable_poly.bounds

    placed: List[PlacedTable] = []
    col_ew = 0          # which E-W tracker column (used as row_index)
    x = minx
    while x + trk_w <= maxx:
        col_ns = 0      # N-S position within this column (used as col_index)
        y = miny
        while y + trk_ns <= maxy:
            trk_box = box(x, y, x + trk_w, y + trk_ns)
            if usable_poly.contains(trk_box):
                placed.append(PlacedTable(
                    x=x, y=y,
                    width=trk_w, height=trk_ns,
                    row_index=col_ew,
                    col_index=col_ns,
                ))
                col_ns += 1
            y += ns_step
        col_ew += 1
        x += pitch_ew

    # ------------------------------------------------------------------
    # 7. Initial capacity
    # ------------------------------------------------------------------
    modules_per_unit = (params.tracker_modules_across *
                        params.tracker_strings_per_tracker *
                        params.tracker_modules_per_string)
    total_modules_pre = len(placed) * modules_per_unit
    total_kwp_pre     = total_modules_pre * module.wattage / 1000.0
    total_mwp_pre     = total_kwp_pre / 1000.0

    # ------------------------------------------------------------------
    # 8. ICR placement (same logic as fixed-tilt)
    # ------------------------------------------------------------------
    tables_pre_icr = list(placed)
    placed, icrs   = place_icrs(placed, total_mwp_pre, usable_poly)

    # ------------------------------------------------------------------
    # 9. Final statistics (after ICR clearance)
    # ------------------------------------------------------------------
    total_modules = len(placed) * modules_per_unit
    total_kwp     = total_modules * module.wattage / 1000.0

    # Map tracker config onto LayoutParameters.table so downstream cable /
    # inverter code (place_string_inverters) can compute strings_per_table.
    #
    # For a tracker unit:
    #   • One string = modules_per_string modules in one N-S column.
    #   • strings_per_tracker strings share the torque-tube unit.
    #   • modules_across additional parallel columns (E-W).
    # Total strings per tracker unit = strings_per_tracker × modules_across.
    # We map: rows_per_table = total strings/unit (for inverter sizing).
    total_strings_per_unit = (params.tracker_strings_per_tracker *
                              params.tracker_modules_across)
    params.table = TableConfig(
        modules_in_row=params.tracker_modules_per_string,
        rows_per_table=max(1, total_strings_per_unit),
    )

    result.placed_tables      = placed
    result.placed_icrs        = icrs
    result.tables_pre_icr     = tables_pre_icr
    result.usable_polygon     = usable_poly
    result.boundary_polygon   = boundary_poly     # full boundary (pre-setback) for cable routing
    result.total_modules      = total_modules
    result.total_capacity_kwp = round(total_kwp, 2)
    result.total_capacity_mwp = round(total_kwp / 1000.0, 4)

    return result
```

- [ ] **Step 1.2: Verify the new module imports cleanly**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run python -c "
from pvlayout_core.core.tracker_layout_engine import run_layout_tracker, _make_valid_poly, TL_SETBACK_M
import inspect
sig = inspect.signature(run_layout_tracker)
print('signature:', list(sig.parameters))
print('TL_SETBACK_M =', TL_SETBACK_M)
"
```

Expected:
```
signature: ['boundary_wgs84', 'obstacles_wgs84', 'params', 'centroid_lat', 'centroid_lon', 'boundary_name', 'line_obstructions_wgs84', 'water_obstacles_wgs84']
TL_SETBACK_M = 15.0
```

- [ ] **Step 1.3: Smoke test with a tiny synthetic boundary**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run python -c "
from pvlayout_core.core.tracker_layout_engine import run_layout_tracker
from pvlayout_core.models.project import LayoutParameters, DesignType

# 1 km × 1 km box near (20°N, 78°E)
boundary = [(78.000, 20.000), (78.010, 20.000), (78.010, 20.010), (78.000, 20.010), (78.000, 20.000)]
params = LayoutParameters(design_type=DesignType.SINGLE_AXIS_TRACKER)

r = run_layout_tracker(
    boundary_wgs84=boundary,
    obstacles_wgs84=[],
    params=params,
    centroid_lat=20.005,
    centroid_lon=78.005,
    boundary_name='smoke',
)
print(f'placed: {len(r.placed_tables)}, modules: {r.total_modules}, capacity: {r.total_capacity_mwp} MWp')
print(f'gcr: {r.gcr_achieved}, pitch: {r.row_pitch_m} m, max_angle: {r.tilt_angle_deg}°')
assert len(r.placed_tables) > 0, 'expected tracker units to be placed'
assert r.design_type == DesignType.SINGLE_AXIS_TRACKER
print('ok')
"
```

Expected: prints non-zero placed count, GCR ratio, pitch in meters, max angle, and `ok`. The exact numbers depend on default `LayoutParameters`; just verify the function runs end-to-end without raising.

- [ ] **Step 1.4: Run existing pytest to confirm no regression**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: `98 passed, 6 skipped` — no regression. The new file is not imported by any existing test or production caller.

- [ ] **Step 1.5: Commit (wip)**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git add python/pvlayout_engine/pvlayout_core/core/tracker_layout_engine.py && git commit -m "wip: row #9 — port tracker_layout_engine.py (verbatim from legacy)"
```

---

## Task 2: Wire SAT dispatch into `run_layout_multi`

**Files:**
- Modify: `python/pvlayout_engine/pvlayout_core/core/layout_engine.py:259-290`

The current `run_layout_multi` (post-row-#6) calls `run_layout(...)` unconditionally for every boundary. Add a `params.design_type` branch that dispatches SAT-mode boundaries to `run_layout_tracker`.

- [ ] **Step 2.1: Replace `run_layout_multi` body**

Open `python/pvlayout_engine/pvlayout_core/core/layout_engine.py`. Locate the existing `run_layout_multi` definition. Replace its body with the following. The function signature and return statement are unchanged; only the per-boundary `try` block is updated.

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
            water_obs = getattr(b, "water_obstacles", [])
            if params.design_type == DesignType.SINGLE_AXIS_TRACKER:
                from pvlayout_core.core.tracker_layout_engine import run_layout_tracker
                r = run_layout_tracker(
                    boundary_wgs84=b.coords,
                    obstacles_wgs84=b.obstacles,
                    params=params,
                    centroid_lat=centroid_lat,
                    centroid_lon=centroid_lon,
                    boundary_name=name,
                    line_obstructions_wgs84=b.line_obstructions,
                    water_obstacles_wgs84=water_obs,
                )
            else:
                r = run_layout(
                    boundary_wgs84=b.coords,
                    obstacles_wgs84=b.obstacles,
                    params=params,
                    centroid_lat=centroid_lat,
                    centroid_lon=centroid_lon,
                    boundary_name=name,
                    line_obstructions_wgs84=b.line_obstructions,
                    water_obstacles_wgs84=water_obs,
                )
            results.append(r)
        except Exception as exc:
            empty = LayoutResult()
            empty.boundary_name  = f"{name} [ERROR: {exc}]"
            empty.boundary_wgs84 = b.coords
            results.append(empty)
    return results
```

The lazy `from pvlayout_core.core.tracker_layout_engine import run_layout_tracker` inside the SAT branch matches legacy's lazy-import pattern and avoids loading `tracker_layout_engine` for FT-only callers.

- [ ] **Step 2.2: Verify FT path still works (no regression)**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: `98 passed, 6 skipped` — the FT regression net (rows #4, #6) plus all existing tests.

- [ ] **Step 2.3: Smoke test SAT dispatch end-to-end**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run python -c "
from pvlayout_core.core.kmz_parser import parse_kmz
from pvlayout_core.core.layout_engine import run_layout_multi
from pvlayout_core.models.project import LayoutParameters, DesignType
from pathlib import Path

kmz = Path('tests/golden/kmz/phaseboundary2.kmz')
parsed = parse_kmz(str(kmz))
params = LayoutParameters(design_type=DesignType.SINGLE_AXIS_TRACKER)
results = run_layout_multi(
    boundaries=parsed.boundaries,
    params=params,
    centroid_lat=parsed.centroid_lat,
    centroid_lon=parsed.centroid_lon,
)
print(f'results: {len(results)}')
for r in results:
    print(f'  {r.boundary_name}: design={r.design_type.value}, tables={len(r.placed_tables)}, modules={r.total_modules}')
    assert r.design_type.value == 'single_axis_tracker'
print('ok')
"
```

Expected: prints results with `design=single_axis_tracker` for each boundary, non-zero table count, and `ok`.

- [ ] **Step 2.4: Commit (wip)**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git add python/pvlayout_engine/pvlayout_core/core/layout_engine.py && git commit -m "wip: row #9 — run_layout_multi dispatches FT/SAT on params.design_type"
```

---

## Task 3: Parity test

**Files:**
- Create: `python/pvlayout_engine/tests/parity/test_tracker_layout_engine_parity.py`

Mirrors row #6's `test_layout_engine_parity.py`. Same module-scoped fixture pattern: purge `core.*`/`models.*`/`utils.*`, insert `LEGACY_REPO` on `sys.path`, import legacy modules, yield, teardown.

- [ ] **Step 3.1: Create the parity test file**

Save this exact content at `python/pvlayout_engine/tests/parity/test_tracker_layout_engine_parity.py`:

```python
"""
Parity test for tracker layout engine (Row #9 of docs/PLAN.md).

Live cross-compare via sys.path bootstrap. Runs legacy run_layout_multi
and new-app run_layout_multi on the same KMZ fixtures with
LayoutParameters(design_type=SINGLE_AXIS_TRACKER) and tracker defaults.
Asserts per-result + per-table parity within 1e-6 m on placed tracker
unit coords + integer counts/scalars.

The `params.table = TableConfig(...)` mutation at the end of
run_layout_tracker is symmetric across legacy and new (both implementations
mutate identically), so reusing a single params instance per side is safe.
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
    namespaces don't collide. Legacy's tracker_layout_engine imports
    from core.*, models.*, and utils.*, all of which need purging."""
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


def test_tracker_module_importable():
    """The new module exposes run_layout_tracker."""
    from pvlayout_core.core.tracker_layout_engine import run_layout_tracker
    assert callable(run_layout_tracker)


@pytest.mark.parametrize("kmz_name", [
    "phaseboundary2.kmz",
    "complex-plant-layout.kmz",
])
def test_run_layout_tracker_parity_with_legacy(legacy_layout, kmz_name):
    """SAT layout pipeline parity on both reference plants."""
    legacy_parser, legacy_engine, legacy_project = legacy_layout
    kmz_path = KMZ_DIR / kmz_name
    assert kmz_path.exists(), f"missing fixture: {kmz_path}"

    # --- Legacy side ---
    legacy_parsed = legacy_parser.parse_kmz(str(kmz_path))
    legacy_params = legacy_project.LayoutParameters(
        design_type=legacy_project.DesignType.SINGLE_AXIS_TRACKER,
    )
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
    from pvlayout_core.models.project import LayoutParameters, DesignType
    new_parsed = parse_kmz(str(kmz_path))
    new_params = LayoutParameters(design_type=DesignType.SINGLE_AXIS_TRACKER)
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

        # --- Scalars ---
        assert lr.boundary_name == nr.boundary_name, f"{label} boundary_name"
        assert lr.utm_epsg == nr.utm_epsg, f"{label} utm_epsg"
        assert lr.design_type.value == nr.design_type.value == "single_axis_tracker", (
            f"{label} design_type drift: legacy {lr.design_type} vs new {nr.design_type}"
        )
        assert lr.total_modules == nr.total_modules, f"{label} total_modules"
        assert lr.total_capacity_kwp == nr.total_capacity_kwp, f"{label} total_capacity_kwp"
        assert lr.total_capacity_mwp == nr.total_capacity_mwp, f"{label} total_capacity_mwp"
        assert lr.gcr_achieved == nr.gcr_achieved, f"{label} gcr_achieved"
        assert lr.row_pitch_m == nr.row_pitch_m, f"{label} row_pitch_m"
        assert lr.tilt_angle_deg == nr.tilt_angle_deg, f"{label} tilt_angle_deg (= max_angle)"
        assert math.isclose(lr.total_area_m2, nr.total_area_m2, abs_tol=POS_TOL), (
            f"{label} total_area_m2"
        )
        assert lr.total_area_acres == nr.total_area_acres, f"{label} total_area_acres"
        assert math.isclose(
            lr.net_layout_area_m2, nr.net_layout_area_m2, abs_tol=POS_TOL
        ), f"{label} net_layout_area_m2"

        # --- Per-tracker-unit position match ---
        assert len(lr.placed_tables) == len(nr.placed_tables), (
            f"{label} placed_tables count: "
            f"legacy {len(lr.placed_tables)} vs new {len(nr.placed_tables)}"
        )
        for j, (lt, nt) in enumerate(zip(lr.placed_tables, nr.placed_tables)):
            assert math.isclose(lt.x, nt.x, abs_tol=POS_TOL), f"{label} placed_tables[{j}].x"
            assert math.isclose(lt.y, nt.y, abs_tol=POS_TOL), f"{label} placed_tables[{j}].y"
            assert math.isclose(lt.width, nt.width, abs_tol=POS_TOL), (
                f"{label} placed_tables[{j}].width"
            )
            assert math.isclose(lt.height, nt.height, abs_tol=POS_TOL), (
                f"{label} placed_tables[{j}].height"
            )
            assert lt.row_index == nt.row_index, f"{label} placed_tables[{j}].row_index"
            assert lt.col_index == nt.col_index, f"{label} placed_tables[{j}].col_index"

        # --- ICR placement match ---
        assert len(lr.placed_icrs) == len(nr.placed_icrs), (
            f"{label} placed_icrs count: "
            f"legacy {len(lr.placed_icrs)} vs new {len(nr.placed_icrs)}"
        )
        for j, (li, ni) in enumerate(zip(lr.placed_icrs, nr.placed_icrs)):
            assert math.isclose(li.cx, ni.cx, abs_tol=POS_TOL), f"{label} placed_icrs[{j}].cx"
            assert math.isclose(li.cy, ni.cy, abs_tol=POS_TOL), f"{label} placed_icrs[{j}].cy"
            assert li.mwp == ni.mwp, f"{label} placed_icrs[{j}].mwp"

        # --- Boundary polygon contract ---
        assert nr.boundary_polygon is not None, (
            f"{label} boundary_polygon should be populated"
        )
```

- [ ] **Step 3.2: Run only the new parity test**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run pytest tests/parity/test_tracker_layout_engine_parity.py -v 2>&1 | tail -20
```

Expected: 3 tests pass —
- `test_tracker_module_importable`
- `test_run_layout_tracker_parity_with_legacy[phaseboundary2.kmz]`
- `test_run_layout_tracker_parity_with_legacy[complex-plant-layout.kmz]`

If a parity assertion fails on a specific field with a tiny diff: capture the actual max-abs-diff (the assertion message includes index and field name). For shapely-derived coordinates, drift up to ~1e-9 m is FP-floor; we already use 1e-6 m tolerance which absorbs that. For larger diffs, treat as port bug — re-read the relevant section of `tracker_layout_engine.py` against legacy.

If `total_capacity_kwp` or `total_capacity_mwp` fails on equality: the legacy `round(total_kwp, 2)` and `round(total_kwp / 1000.0, 4)` should produce identical results in same-process bootstrap. If they don't, something diverged in the placement loop upstream.

- [ ] **Step 3.3: Run full pytest suite**

```bash
uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: `101 passed, 6 skipped` (was 98 → +3 new tracker parity tests). Contract is `0 failed`.

- [ ] **Step 3.4: Commit (wip)**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git add python/pvlayout_engine/tests/parity/test_tracker_layout_engine_parity.py && git commit -m "wip: row #9 — bit-exact parity test for tracker layout engine"
```

---

## Task 4: T3 discovery memo

**Files:**
- Create: `docs/parity/findings/2026-04-29-005-tracker-layout-engine-port.md`

- [ ] **Step 4.1: Create the memo**

Save this exact content at `docs/parity/findings/2026-04-29-005-tracker-layout-engine-port.md`:

```markdown
# Finding #005 — Tracker layout engine port

**Row:** [docs/PLAN.md](../../PLAN.md) row #9 (T3)
**Date:** 2026-04-29
**Author:** Arun (port) — solar-domain decisions captured for Prasanta's end-of-port review
**Status:** committed; deferred review

## Background

Legacy added `core/tracker_layout_engine.py` (single function
`run_layout_tracker`, ~301 lines) on `baseline-v1-20260429` commit
`9362083` to enable Single Axis Tracker (HSAT) layouts. Row #9 ports
this verbatim into the new project as
`pvlayout_core/core/tracker_layout_engine.py` and wires it into
`run_layout_multi` via a `params.design_type` dispatch.

`LayoutParameters` already had all `tracker_*` fields, the
`DesignType.SINGLE_AXIS_TRACKER` enum, and the relevant `LayoutResult`
fields (`tilt_angle_deg`, `row_pitch_m`, `gcr_achieved`,
`boundary_polygon`, etc.). No data-model or wire-schema changes this
row.

## What landed

Two touch-points:

1. **NEW** `python/pvlayout_engine/pvlayout_core/core/tracker_layout_engine.py`
   (~301 lines, verbatim port of legacy with `core.X`/`models.X`/`utils.X`
   → `pvlayout_core.X` import-prefix substitution).

2. **EDIT** `python/pvlayout_engine/pvlayout_core/core/layout_engine.py`
   `run_layout_multi`: add `params.design_type ==
   DesignType.SINGLE_AXIS_TRACKER` branch that calls
   `run_layout_tracker(...)`. FT path unchanged. ~14 lines added.

Bit-exact parity verified on `phaseboundary2.kmz` and
`complex-plant-layout.kmz` in
`tests/parity/test_tracker_layout_engine_parity.py`:
- per-tracker-unit `(x, y, width, height, row_index, col_index)` within
  1e-6 m / strict equality
- per-result scalars: `total_modules`, `total_capacity_kwp`,
  `total_capacity_mwp`, `gcr_achieved`, `row_pitch_m`, `tilt_angle_deg`,
  `utm_epsg`, `design_type`, `total_area_acres`
- per-result areas: `total_area_m2`, `net_layout_area_m2` within 1e-6 m
- per-ICR `(cx, cy, mwp)` within 1e-6 m / strict equality

Full sidecar pytest: 101 passed, 6 skipped, 0 failed (was 98 → +3).

## Algorithm summary

### Tracker geometry

Legacy implements horizontal single-axis tracker (HSAT) layout. The
tracker has a North-South torque tube; modules are mounted across the
tube and rotate ±`max_angle_deg` from horizontal during the day to
follow the sun (East-West sweep).

Each tracker unit is placed as a `PlacedTable` with:
- `width`  = E-W aperture = `tracker_modules_across × mod_ew`
- `height` = N-S length   = `tracker_strings_per_tracker × tracker_modules_per_string × mod_ns`

where `(mod_ew, mod_ns)` depend on portrait/landscape orientation.

### Placement loop

The placement loop is the **mirror** of fixed-tilt:

| | Outer loop | Inner loop |
|---|---|---|
| FT | N-S (rows) | E-W (tables in row) |
| SAT | E-W (tracker columns) | N-S (units in column) |

`row_index` = E-W column number, `col_index` = N-S position within
column. (Naming follows the FT convention; semantics differ.)

E-W pitch: `max(trk_w + 0.5, params.tracker_pitch_ew_m)` (50 cm
clearance floor).
N-S step: `trk_ns + params.tracker_ns_gap_m`.

### ICR placement reuse

`place_icrs(placed, total_mwp_pre, usable_poly)` is called identically
to FT. The ICR clearance algorithm is layout-engine-agnostic — it
operates on placed boxes and the usable polygon.

### Downstream cabling hook

End-of-function mutation: `params.table = TableConfig(...)` repurposes
the FT-tilt `LayoutParameters.table` field so
`place_string_inverters` (which expects `modules_in_row` and
`rows_per_table`) can compute strings-per-tracker-unit. Mapping:

- `modules_in_row` ← `tracker_modules_per_string`
- `rows_per_table` ← `tracker_strings_per_tracker × tracker_modules_across`
  (clamped to ≥1)

This is an input-mutation-as-output side-effect (anti-pattern). See §6d
below.

## Open questions / refinement candidates (for end-of-port review)

a. **Portrait/Landscape docstring contradiction.** The legacy file
   contains two comment blocks describing the orientation convention
   inside `run_layout_tracker`. They contradict each other:

   - Lines 193–197 (block above section 4):
     "Portrait (P): long side (module.length) runs N-S"
   - Lines 203–205 (block above the orientation logic):
     "Portrait (P): module long side (length) runs E-W across the
     aperture"

   The implemented logic (`mod_ew = module.length if portrait else
   module.width`) matches the second comment. The first comment is
   stale. Trivial doc-only fix candidate post-parity.

b. **`+ 0.5 m` minimum pitch increment.** Hardcoded floor in
   `pitch_ew = max(trk_w + 0.5, params.tracker_pitch_ew_m)`. The 50 cm
   clearance prevents overlap when `tracker_pitch_ew_m` is set to or
   below `trk_w`, but the magnitude is unjustified in code. Should be
   either configurable on `LayoutParameters` or documented as
   industry-standard.

c. **`result.tilt_angle_deg` overload.** The field is documented as
   "static panel tilt from horizontal (degrees)" — appropriate for
   FT. SAT engine writes `params.tracker_max_angle_deg` here. Adds
   ambiguity for downstream consumers (exporters, UI inspectors). Two
   fix paths: (i) add a dedicated `LayoutResult.tracker_max_angle_deg`
   field and update the wire schema, or (ii) document the overload
   formally (FT writes static tilt, SAT writes max rotation).

d. **`params.table = TableConfig(...)` side-effect.** `run_layout_tracker`
   mutates the input dataclass as a way of communicating SAT-mode
   table geometry to `place_string_inverters` downstream. This is an
   input-mutated-as-output anti-pattern. Verbatim-ported; future
   cleanup options: return alongside `LayoutResult`, or set
   `LayoutResult.effective_table_config` so consumers read from the
   result instead of the input.

e. **`_make_valid_poly` duplication.** Verbatim copies in
   `pvlayout_core/core/layout_engine.py` (added in row #6) and
   `pvlayout_core/core/tracker_layout_engine.py`. Post-parity
   consolidation: extract to `pvlayout_core.utils.geo_utils` or a new
   `pvlayout_core.core._shapely_helpers` module.

f. **`TL_SETBACK_M = 15.0` duplicated module-level constant.** Also
   defined in `pvlayout_core/core/layout_engine.py` at the same value.
   Currently consistent; consolidate post-parity.

## For end-of-port review

When Prasanta reviews the accumulated memos at end-of-port, the
decision points for this finding are:

1. Is `+ 0.5 m` the right minimum E-W pitch clearance for HSAT
   trackers, or should it be configurable / a different magnitude?
2. Should `LayoutResult.tilt_angle_deg` be split into FT-specific
   and SAT-specific fields, or is the overload acceptable with a
   docstring fix?
3. Is the `params.table` mutation an acceptable downstream interface
   for `place_string_inverters`, or should we restructure to a
   pull-from-result pattern?
4. Are the trivial doc-only / dedup fixes (portrait/landscape,
   `_make_valid_poly`, `TL_SETBACK_M`) worth a follow-up cleanup
   row, or live with the duplication post-parity?

Refinements, if any, become follow-up rows in PLAN.md raised after
the parity sweep is complete.
```

- [ ] **Step 4.2: Verify the memo file exists**

```bash
ls -la /Users/arunkpatra/codebase/pv_layout_project/docs/parity/findings/2026-04-29-005-tracker-layout-engine-port.md
```

Expected: file exists, non-zero size (~5 KB).

- [ ] **Step 4.3: Commit (wip)**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git add docs/parity/findings/2026-04-29-005-tracker-layout-engine-port.md && git commit -m "wip: row #9 — T3 discovery memo (tracker layout engine)"
```

---

## Task 5: Flip PLAN.md, run final pytest, squash to `parity:` commit

- [ ] **Step 5.1: Update PLAN.md row #9 status and header**

Open `docs/PLAN.md`. Two edits:

(a) Header status — change:

```markdown
**Status:** 8 / 12 done.
```

to:

```markdown
**Status:** 9 / 12 done.
```

(b) Row #9 — change:

```markdown
| 9 | Single-axis-tracker layout mode | T3 | `core/tracker_layout_engine.py` (new) @ `9362083` | New mode produces output; parity check on a SAT plant; discovery memo committed. | todo |
```

to:

```markdown
| 9 | Single-axis-tracker layout mode | T3 | `core/tracker_layout_engine.py` (new) @ `9362083` | New mode produces output; parity check on a SAT plant; discovery memo committed. | **done** |
```

- [ ] **Step 5.2: Final pytest gate**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: `101 passed, 6 skipped, 0 failed`.

- [ ] **Step 5.3: Inspect commits to squash**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git log --oneline origin/main..HEAD
```

Expected ordering (top = most recent):
1. `wip: row #9 — T3 discovery memo (tracker layout engine)`
2. `wip: row #9 — bit-exact parity test for tracker layout engine`
3. `wip: row #9 — run_layout_multi dispatches FT/SAT on params.design_type`
4. `wip: row #9 — port tracker_layout_engine.py (verbatim from legacy)`
5. `docs: row #9 spec — single-axis-tracker layout mode`

The spec commit (5) is *not* squashed — kept separate per the established rows-#4–#8 pattern.

```bash
SPEC_COMMIT=$(git log --grep="docs: row #9 spec" --format=%H -n 1) && \
echo "Reset target (spec commit): $SPEC_COMMIT" && \
git diff --stat $SPEC_COMMIT..HEAD
```

Expected: 4 files in the diff stat — the new `tracker_layout_engine.py`, the modified `layout_engine.py`, the new parity test, and the new discovery memo. (PLAN.md is in the working tree from Step 5.1, not yet committed.)

- [ ] **Step 5.4: Soft reset to spec commit and stage everything**

```bash
SPEC_COMMIT=$(git log --grep="docs: row #9 spec" --format=%H -n 1) && \
git reset --soft $SPEC_COMMIT
```

Stage all five row-#9 outputs (PLAN.md edit + 4 squashed-from-wip files):

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git add \
    docs/PLAN.md \
    docs/parity/findings/2026-04-29-005-tracker-layout-engine-port.md \
    python/pvlayout_engine/pvlayout_core/core/tracker_layout_engine.py \
    python/pvlayout_engine/pvlayout_core/core/layout_engine.py \
    python/pvlayout_engine/tests/parity/test_tracker_layout_engine_parity.py
```

Verify staging:

```bash
git status -s
```

Expected: 5 files staged (`A` for the new files, `M` for `docs/PLAN.md` and `layout_engine.py`), working tree otherwise clean.

- [ ] **Step 5.5: Create the final atomic commit**

```bash
git commit -m "$(cat <<'EOF'
parity: row #9 — single-axis-tracker layout mode

Port legacy core/tracker_layout_engine.py (~301 lines, single function
run_layout_tracker) into the new app at
pvlayout_core/core/tracker_layout_engine.py. Verbatim port from
baseline-v1-20260429 commit 9362083 with import-prefix substitution
(core.X / models.X / utils.X → pvlayout_core.X). HSAT geometry: N-S
torque tube, E-W tracker columns, +0.5m pitch clearance floor.
Includes water-obstacle subtraction (3a) and TL line-obstruction
buffering (3b) symmetric with run_layout. Reuses place_icrs verbatim.
Mutates params.table = TableConfig(...) at end so
place_string_inverters can compute strings-per-tracker-unit (legacy
side-effect; flagged in finding #005 §6d).

run_layout_multi in pvlayout_core/core/layout_engine.py gains a
params.design_type branch: SINGLE_AXIS_TRACKER → run_layout_tracker;
else → existing run_layout. Lazy import of run_layout_tracker keeps
it out of the FT-only call path (matches legacy).

LayoutParameters tracker_* fields, DesignType.SINGLE_AXIS_TRACKER,
and the LayoutResult fields the SAT engine writes (tilt_angle_deg,
row_pitch_m, gcr_achieved, boundary_polygon, etc.) were already
present in the new app — no data-model or wire-schema changes this
row.

Bit-exact parity verified on phaseboundary2.kmz and
complex-plant-layout.kmz in
tests/parity/test_tracker_layout_engine_parity.py:
  - per-tracker-unit (x, y, width, height, row_index, col_index)
    within 1e-6 m / strict equality
  - per-result scalars: total_modules, total_capacity_kwp/mwp,
    gcr_achieved, row_pitch_m, tilt_angle_deg, utm_epsg, design_type,
    total_area_acres
  - per-result areas: total_area_m2, net_layout_area_m2 within 1e-6 m
  - per-ICR (cx, cy, mwp) within 1e-6 m / strict equality
Sidecar pytest: 101 passed, 6 skipped, 0 failed (was 98 → +3).

T3 discovery memo at
docs/parity/findings/2026-04-29-005-tracker-layout-engine-port.md
captures: portrait/landscape docstring contradiction, +0.5m pitch
floor magnitude, tilt_angle_deg field overload (FT static tilt vs
SAT max rotation), params.table side-effect anti-pattern,
_make_valid_poly + TL_SETBACK_M duplication. Routes to Prasanta's
end-of-port review.

PLAN.md row #9 flipped to done; status header bumped 8/12 → 9/12.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5.6: Final verification**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git log --oneline origin/main..HEAD
```

Expected: exactly 2 commits ahead of `origin/main`:
1. `docs: row #9 spec — single-axis-tracker layout mode`
2. `parity: row #9 — single-axis-tracker layout mode`

```bash
cd python/pvlayout_engine && uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: `101 passed, 6 skipped, 0 failed`.

- [ ] **Step 5.7: Hand off to user**

Report:
- Pytest count (e.g., `101 passed, 6 skipped`)
- The 2 unpushed commits' shortlog
- Reminder: `git push` is the next user-controlled step (not auto-pushed)
- Note that next row is #10 (DXF exporter, T1)

---

## Verification matrix

| Spec section | Plan task | Verification |
|---|---|---|
| 2.1 NEW `tracker_layout_engine.py` | Task 1 | Step 1.2 import + 1.3 smoke + Task 3 parity |
| 2.2 EDIT `run_layout_multi` SAT dispatch | Task 2 | Step 2.3 smoke + Task 3 parity (calls `run_layout_multi` end-to-end) |
| 2.3 No other touch-points | (implicit) | Step 1.4 + 2.2 confirm no FT regression |
| 3 Parity test (3 cases) | Task 3 | 3 tests pass |
| 4 Discovery memo | Task 4 | File exists at `docs/parity/findings/2026-04-29-005-tracker-layout-engine-port.md` |
| 5 Acceptance: 0 failed pytest, memo committed, PLAN flipped | Task 5 | Steps 5.2 + 5.6 |
| 5 Acceptance: atomic `parity:` commit | Task 5 | Steps 5.4–5.5 squash |

---

## Edge cases / known gotchas

- **`params.table` mutation.** `run_layout_tracker` mutates the input `params.table` at end. The parity test uses separate `legacy_params` and `new_params` instances, so mutations don't cross-contaminate. For multi-boundary KMZs, the second-and-later boundaries see the first's mutation — but this is symmetric across legacy and new, so bit-exact equality holds. Documented in the test file's docstring.
- **Module identity collision.** Legacy and new both name `tracker_layout_engine`, `layout_engine`, `kmz_parser`. The fixture's `_purge_legacy_modules()` deletes `core.*`, `models.*`, and `utils.*` from `sys.modules` before legacy imports and after the fixture yields, so the new app's `pvlayout_core.*` namespace re-resolves cleanly per test.
- **Tolerance choice.** Coordinates use `math.isclose(abs_tol=1e-6)` (matches row #6's pattern). Integers and rounded scalars (`total_capacity_kwp`, `gcr_achieved`, `row_pitch_m`) use strict `==`. If a strict assertion fails on a rounded scalar with a tiny diff, that's a port bug — re-read the relevant section of the new file against legacy.
- **`uv sync` strips dev extras.** Don't run bare `uv sync` during this row. Row #9 doesn't add deps, but if you find yourself debugging "No module named pytest" or shapely import errors with mixed Python versions, run `uv sync --extra dev` (per `feedback_uv_sync_dev_extras.md`).
- **Lazy import inside `run_layout_multi`.** The SAT branch does `from pvlayout_core.core.tracker_layout_engine import run_layout_tracker` inside the function body. This matches legacy and keeps `tracker_layout_engine` out of the import graph for FT-only callers. If a static-analysis tool (mypy, ruff) flags this, leave it — it's intentional.
