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
            f"{label} placed_tables count: "
            f"legacy {len(lr.placed_tables)} vs new {len(nr.placed_tables)}"
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
