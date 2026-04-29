# Row #6 — Layout engine + water-body integration (design)

**PLAN row:** [`docs/PLAN.md`](../../PLAN.md) row #6
**Tier:** T2 (port + numeric parity test)
**Source:** legacy `core/layout_engine.py` @ branch `baseline-v1-20260429`, originating commits `9362083` + `9c751b7`
**Target:** `python/pvlayout_engine/pvlayout_core/core/layout_engine.py`
**Acceptance:** sidecar pytest green; per-plant table-position parity against legacy on `phaseboundary2.kmz` and `complex-plant-layout.kmz`; row-#4 water_obstacles bridge in `run_layout_multi` removed; `result.water_obstacle_polygons_wgs84` and `result.boundary_polygon` populated.
**Date:** 2026-04-29

---

## 1. Goal

Port legacy `core/layout_engine.py` into the new project. Three substantive changes:

1. **Add `_make_valid_poly(p)` helper** — repairs self-intersecting shapely polygons via `buffer(0)` → `shapely.validation.make_valid` → `convex_hull` fallback. Used in both hard-obstacle subtraction (more robust than current new-app code) and water-obstacle subtraction (new section 3a).

2. **Add water-obstacle subtraction** — `run_layout` gains a `water_obstacles_wgs84` parameter (defaults to `None` for backward compat). Section 3a after hard-obstacle subtraction projects them to UTM, repairs each via `_make_valid_poly`, and subtracts from the usable polygon. `run_layout_multi` extracts them from the boundary via `getattr(b, "water_obstacles", [])` and passes them in. **The row #4 bridge (`merged_obstacles = obstacles + water_obstacles`) is removed.**

3. **Populate the two row #1 result fields** — `result.water_obstacle_polygons_wgs84 = list(water_obstacles_wgs84 or [])` and `result.boundary_polygon = boundary_poly` (the full pre-setback boundary, used by Pattern V cable routing per S11.5).

Direction one-way: legacy is read-only. Nothing in this row modifies any file under `/Users/arunkpatra/codebase/PVlayout_Advance`.

**Setback semantics check.** I expected legacy to use a different setback for water vs hard obstacles, since the row #4 bridge comment said "legacy layout_engine.py uses different setbacks for water vs hard obstacles." Reading the legacy code carefully: **it doesn't.** Both go through `usable_poly.difference(union)` with no buffer applied. The only buffered setback is `line_obstructions` (`TL_SETBACK_M = 15.0 m`). So functionally, the bridge is close to legacy's separate water-pass — the differences are: (a) `_make_valid_poly` repair, (b) the two new result fields, (c) keeping water polygons separated at the result-shape level for downstream consumers (frontend rendering, cable routing). The row #4 bridge comment will be corrected by removal.

**Scope is layout engine only.** No SAT dispatch (`DesignType.SINGLE_AXIS_TRACKER` branch in `run_layout_multi` calling `core.tracker_layout_engine.run_layout_tracker`) — that's row #9, which adds the new tracker engine file. Row #6's `run_layout_multi` keeps the FT path unconditionally; row #9 will add the if/else dispatch when it lands.

**Tier:** T2. No discovery memo (mechanical port; the only solar-domain question was whether legacy actually uses different setbacks, answered above).

## 2. Changes

### 2.1 `python/pvlayout_engine/pvlayout_core/core/layout_engine.py`

**Helper:** add `_make_valid_poly(p)` after the `TL_SETBACK_M` constant.

```python
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
```

**`run_layout` signature:** add `water_obstacles_wgs84` parameter at the end of the existing parameter list (after `line_obstructions_wgs84`):

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
```

Default `None` (not `[]`) matches legacy and keeps the function call-compatible from any caller that doesn't pass the new parameter.

**Result-field population:** at the top of the function, where the result is initialised:

```python
    result = LayoutResult()
    result.boundary_name = boundary_name
    # legacy uses defensive copies of the input lists
    result.obstacle_polygons_wgs84 = list(obstacles_wgs84)
    result.water_obstacle_polygons_wgs84 = list(water_obstacles_wgs84 or [])
```

**Hard-obstacle subtraction (section 3 in legacy):** replace the current new-app `unary_union + difference` with the per-poly `_make_valid_poly` + per-poly fallback pattern from legacy:

```python
    # 3. Subtract solid obstacles
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
```

**Water-obstacle subtraction (new section 3a):** insert after section 3, before the no-area-remaining check:

```python
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
```

**`result.boundary_polygon` population:** in the section where `result.usable_polygon` is set, also set `result.boundary_polygon`:

```python
    result.usable_polygon = usable_poly
    result.boundary_polygon = boundary_poly  # full boundary (pre-setback) for cable routing
```

The exact insertion line matches legacy's structure — `boundary_poly` is the full polygon before road-setback shrinkage, kept available for cable-routing logic that needs to honor the perimeter road band but not the plant fence.

**`run_layout_multi` rewrite:** remove the row #4 bridge; pass `water_obstacles_wgs84` directly. No SAT dispatch.

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
            ...   # existing error-result construction unchanged
    return results
```

The `getattr(...)` is a small defense for the future SAT dispatch (which may pass a different boundary type); for the current FT path it's equivalent to `b.water_obstacles` since row #4's parser always populates the field on every `BoundaryInfo`.

**Imports:** the helper uses `shapely.validation.make_valid` (lazy-imported inside `_make_valid_poly`); no top-level import change.

### 2.2 `python/pvlayout_engine/tests/parity/test_layout_engine_parity.py` — new

Pattern matches `test_kmz_parser_parity.py`: `sys.path` bootstrap to import legacy under bare `core.*` namespace; module-scoped fixture; `_purge_legacy_modules` on enter and exit.

Pipeline run on both sides: parse KMZ → `run_layout_multi`. Cables OFF (default `LayoutParameters()`). LA + string-inverter placement NOT run (their parity is covered by rows #2 and P0). Per-result assertions:

- `boundary_name`, `total_modules`, `len(placed_tables)`, `gcr_achieved`, `tilt_angle_deg`, `utm_epsg`, `total_area_m2` match exactly
- Per-table `x`, `y`, `width`, `height` within 1e-6 m; `row_index`, `col_index` exact int match
- `water_obstacle_polygons_wgs84` matches legacy's content (deep equality on the list of rings)
- `boundary_polygon` non-None on the new app side (the contract for downstream cable routing)

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
    for m in list(sys.modules):
        if m == "core" or m.startswith("core.") or m == "models" or m.startswith("models.") or m == "utils" or m.startswith("utils."):
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

    # Legacy side
    legacy_parsed = legacy_parser.parse_kmz(str(kmz_path))
    legacy_params = legacy_project.LayoutParameters()
    legacy_results = legacy_engine.run_layout_multi(
        boundaries=legacy_parsed.boundaries,
        params=legacy_params,
        centroid_lat=legacy_parsed.centroid_lat,
        centroid_lon=legacy_parsed.centroid_lon,
    )

    # New side — re-import after legacy fixture (pvlayout_core.* unaffected)
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

    # Filter to results with usable polygon (legacy + new) — error results skip
    legacy_valid = [r for r in legacy_results if r.usable_polygon is not None]
    new_valid = [r for r in new_results if r.usable_polygon is not None]

    assert len(legacy_valid) == len(new_valid), (
        f"{kmz_name} valid-result count drift: legacy {len(legacy_valid)} vs new {len(new_valid)}"
    )

    for i, (lr, nr) in enumerate(zip(legacy_valid, new_valid)):
        label = f"{kmz_name} result[{i}] ({lr.boundary_name})"
        assert lr.boundary_name == nr.boundary_name, f"{label} boundary_name"
        assert lr.utm_epsg == nr.utm_epsg, f"{label} utm_epsg"
        assert lr.total_modules == nr.total_modules, f"{label} total_modules"
        assert len(lr.placed_tables) == len(nr.placed_tables), f"{label} placed_tables count"

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

The fixture purges `core.*`, `models.*`, AND `utils.*` because legacy's `core.layout_engine` imports from all three (`core.spacing_calc`, `core.icr_placer`, `core.kmz_parser`, `models.project`, `utils.geo_utils`). Without purging all three, pytest's module cache could shadow the new-app namespace on a subsequent test (defensive).

Test count: **2 parametrized** → 84 → **86 passed** expected.

### 2.3 Re-capture golden baselines

Run after the layout-engine port is in place:

```bash
cd python/pvlayout_engine && uv run python scripts/capture_golden.py
```

Expected diffs (per plant in `tests/golden/expected/`):

- **Most likely (additive):** `water_obstacle_polygons_wgs84` newly populated; `boundary_polygon` likely serialised as `null` or omitted (it's `field(default=None, repr=False, compare=False)`); table positions identical.
- **Possible (small numeric):** `_make_valid_poly` repairs the perimeter-road-shrunk polygon → usable_poly area shifts by a tiny amount → table count or per-table positions shift. If this happens, surface and discuss before committing.

Inspect the diff before staging. If only water_obstacle field changes, trivial commit. If table counts shift, pause.

### 2.4 `docs/PLAN.md`

Row #6 → **done**, status bump `5 / 12 done.` → `6 / 12 done.`

## 3. Acceptance

```bash
cd python/pvlayout_engine && uv run pytest tests/ -q
```

- All existing tests still pass (84 passed remains the floor).
- 2 new parity tests pass (`test_run_layout_multi_parity_with_legacy[phaseboundary2.kmz]`, `test_run_layout_multi_parity_with_legacy[complex-plant-layout.kmz]`).
- Expected total: **86 passed**, 6 skipped, 0 failed.
- Row #4 bridge removed (verified by reading `layout_engine.py:run_layout_multi`).
- `result.water_obstacle_polygons_wgs84` and `result.boundary_polygon` populated (verified by the parity test).

## 4. Risks

- **Row #4 bridge removal regressing other tests.** Mitigation: parity test runs without cables; cable parity tests (P0, S11.5) don't read `water_obstacles` separately. Full pytest run after the port catches anything missed.
- **`_make_valid_poly` shifts table layout on a known-good plant.** All three test KMZs pass `validate_boundaries` clean → `_make_valid_poly` should be a no-op on them (only fires when `is_valid` is False). Risk theoretical for current fixtures.
- **complex-plant-layout legacy capture timing.** Layout-only (cables OFF) should be fast. The original >20 min timeout was cable routing without S11.5 caps — not present in this row.
- **Module purging incomplete.** Legacy's `layout_engine.py` imports `core.spacing_calc`, `core.icr_placer`, `core.kmz_parser`, `models.project`, `utils.geo_utils`. Purging `core.*`, `models.*`, AND `utils.*` covers all of them. If future legacy code adds another bare-namespace import, the fixture will need updating — flag in the test docstring.
- **Golden baseline drift more than expected.** If table counts shift on more than just additive fields, surface before committing the recapture.

## 5. Out of scope

- **SAT dispatch in `run_layout_multi`** — row #9 (T3) adds when it lands `core/tracker_layout_engine.py`.
- **Cable routing using `boundary_polygon`** — already exists for Pattern V (S11.5); row #6 just populates the field for it to read.
- **Frontend rendering** of water obstacles in blue — sidecar contract is now stable; frontend rows post-parity wire the visual.
- **`_TL_KEYWORDS` consumption** for filtering LineStrings by name — still dormant; no row in PLAN.md owns it.
- **Refinements to `_make_valid_poly`** — port verbatim.
- **New tests for the SAT branch dispatch in `run_layout_multi`** — no SAT branch yet.
- **Pydantic schema / TS-types changes** — wire schema already gained `water_obstacles` in row #4; no further schema changes.

## 6. Implementation order (for the implementation plan)

1. Pre-flight: confirm legacy at `baseline-v1-20260429`; pytest baseline 84 passed.
2. Edit `pvlayout_core/core/layout_engine.py`:
   - Add `_make_valid_poly` helper.
   - Extend `run_layout` signature with `water_obstacles_wgs84`.
   - Switch hard-obstacle subtraction to per-poly `_make_valid_poly` pattern.
   - Insert section 3a (water-obstacle subtraction).
   - Populate `result.water_obstacle_polygons_wgs84` and `result.boundary_polygon`.
   - Rewrite `run_layout_multi`: remove the row #4 bridge; pass `water_obstacles_wgs84`.
3. Smoke-test the new pipeline on phaseboundary2 (manual REPL call).
4. Add `tests/parity/test_layout_engine_parity.py`.
5. Run `uv run pytest tests/ -q` from `python/pvlayout_engine/`. Expect 86 passed, 6 skipped, 0 failed.
6. Run `uv run python scripts/capture_golden.py` to refresh golden baselines. Inspect the diff:
   - Additive (only `water_obstacle_polygons_wgs84` populated): commit.
   - Numeric shifts: pause and surface to user.
7. Run pytest again post-recapture to confirm goldens still pass.
8. Flip `docs/PLAN.md` row #6 + status count.
9. Commit: `parity: row #6 — layout engine + water-body integration`.

One atomic commit on `main`.

## 7. Cross-references

- [`docs/PLAN.md`](../../PLAN.md) row #6.
- [`docs/superpowers/specs/2026-04-29-row-1-project-model-fields-design.md`](2026-04-29-row-1-project-model-fields-design.md) — added `LayoutResult.water_obstacle_polygons_wgs84` + `boundary_polygon` fields. Row #6 is the row that finally populates them.
- [`docs/superpowers/specs/2026-04-29-row-4-kmz-parser-autodetect-design.md`](2026-04-29-row-4-kmz-parser-autodetect-design.md) — row #4 added `BoundaryInfo.water_obstacles[]`. Row #6 consumes it via `getattr(b, "water_obstacles", [])`.
- Row #4 bridge cleanup: `python/pvlayout_engine/pvlayout_core/core/layout_engine.py` `run_layout_multi` — the `merged_obstacles` line + comment block annotated `ROW #4 BRIDGE — REMOVE IN ROW #6`.
- [`python/pvlayout_engine/tests/parity/test_kmz_parser_parity.py`](../../../python/pvlayout_engine/tests/parity/test_kmz_parser_parity.py) — `sys.path` bootstrap fixture pattern reused.
- Legacy source at `/Users/arunkpatra/codebase/PVlayout_Advance/core/layout_engine.py` on branch `baseline-v1-20260429`.
