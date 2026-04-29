"""
Parity test for LA placement (Row #2 of docs/PLAN.md).

Asserts the new app's place_lightning_arresters produces identical
PlacedLA records to the legacy reference at baseline-v1-20260429
on phaseboundary2.kmz, given LayoutParameters() defaults +
enable_cable_calc=True.

Skips when baseline JSON lacks placed_las[] (capture script not yet
extended); fails when la_manager port is missing.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from pvlayout_core.core.kmz_parser import parse_kmz
from pvlayout_core.core.la_manager import place_lightning_arresters
from pvlayout_core.core.layout_engine import run_layout_multi
from pvlayout_core.models.project import (
    DesignType,
    LayoutParameters,
    LayoutResult,
    PlacedTable,
)


REPO_ROOT = Path(__file__).resolve().parents[4]
KMZ_DIR = REPO_ROOT / "python/pvlayout_engine/tests/golden/kmz"
BASELINE_DIR = (
    REPO_ROOT / "docs/parity/baselines/baseline-v1-20260429/ground-truth"
)
POS_TOL = 1e-6   # metres


def _load_baseline(plant: str) -> dict:
    p = BASELINE_DIR / plant / "numeric-baseline.json"
    if not p.exists():
        pytest.skip(f"baseline missing: {p}")
    return json.loads(p.read_text())


def _run_pipeline_through_la(kmz_path: Path):
    """Run new app pipeline up to LA placement (skip string inverters)."""
    parsed = parse_kmz(str(kmz_path))
    assert parsed.boundaries, f"no boundaries from {kmz_path}"
    params = LayoutParameters()
    params.enable_cable_calc = True
    results = run_layout_multi(
        boundaries=parsed.boundaries,
        params=params,
        centroid_lat=parsed.centroid_lat,
        centroid_lon=parsed.centroid_lon,
    )
    valid = []
    for r in results:
        if r.usable_polygon is None:
            continue
        place_lightning_arresters(r, params)
        valid.append(r)
    return valid


def test_phaseboundary2_la_parity():
    """Row #2 acceptance: count + per-position match against legacy."""
    baseline = _load_baseline("phaseboundary2")
    if "placed_las" not in baseline:
        pytest.skip(
            "baseline JSON has no placed_las[]; recapture with extended "
            "capture_legacy_baseline.py"
        )

    expected = baseline["placed_las"]
    results = _run_pipeline_through_la(KMZ_DIR / "phaseboundary2.kmz")
    actual = [la for r in results for la in r.placed_las]

    # Count parity
    assert len(actual) == len(expected), (
        f"LA count drift: new app {len(actual)} vs legacy {len(expected)}"
    )
    assert len(actual) == 22, f"phaseboundary2 should have 22 LAs, got {len(actual)}"

    # Per-position parity (bit-exact in practice)
    for i, (a, e) in enumerate(zip(actual, expected)):
        assert math.isclose(a.x,      e["x"],      abs_tol=POS_TOL), f"LA[{i}].x"
        assert math.isclose(a.y,      e["y"],      abs_tol=POS_TOL), f"LA[{i}].y"
        assert math.isclose(a.width,  e["width"],  abs_tol=POS_TOL), f"LA[{i}].width"
        assert math.isclose(a.height, e["height"], abs_tol=POS_TOL), f"LA[{i}].height"
        assert math.isclose(a.radius, e["radius"], abs_tol=POS_TOL), f"LA[{i}].radius"
        assert a.index == e["index"], f"LA[{i}].index"


def test_sat_branch_smoke():
    """SAT branch executes without exception on a synthetic 200×200 m polygon
    with two tracker tables; produces ≥1 LA. No parity assertion — phaseboundary2
    is FT. Functional SAT verification is row #9's job."""
    from shapely.geometry import Polygon as ShapelyPolygon

    poly = ShapelyPolygon([(0, 0), (200, 0), (200, 200), (0, 200)])

    # Two synthetic tracker tables 5.5 m apart in E-W → one inter-row gap
    tables = [
        PlacedTable(x=50.0, y=80.0, width=2.0, height=63.8, row_index=0, col_index=0),
        PlacedTable(x=55.5, y=80.0, width=2.0, height=63.8, row_index=0, col_index=1),
    ]

    result = LayoutResult(
        boundary_name="sat-smoke",
        design_type=DesignType.SINGLE_AXIS_TRACKER,
        placed_tables=tables,
        usable_polygon=poly,
    )

    place_lightning_arresters(result, params=None)

    assert result.num_las >= 1, "SAT smoke: expected at least one LA"
    # SAT pole footprint
    for la in result.placed_las:
        assert la.width  == 1.0
        assert la.height == 1.0
    # Step 3 must NOT remove tables in SAT mode
    assert len(result.placed_tables) == 2, "SAT must not remove tracker tables"
