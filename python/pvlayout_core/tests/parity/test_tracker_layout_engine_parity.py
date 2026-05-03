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
KMZ_DIR = REPO_ROOT / "python/pvlayout_core/tests/golden/kmz"
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
            assert math.isclose(li.x, ni.x, abs_tol=POS_TOL), f"{label} placed_icrs[{j}].x"
            assert math.isclose(li.y, ni.y, abs_tol=POS_TOL), f"{label} placed_icrs[{j}].y"
            assert li.index == ni.index, f"{label} placed_icrs[{j}].index"

        # --- Boundary polygon contract ---
        assert nr.boundary_polygon is not None, (
            f"{label} boundary_polygon should be populated"
        )
