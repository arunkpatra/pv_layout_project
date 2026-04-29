"""
P0 parity regression test — bundled DC + MST AC port.

Runs the new project's pipeline on the same KMZs that produced the legacy
baseline JSON, asserts that counts + totals match within tolerance.

Pattern V divergence: on phaseboundary2, 15 AC cables route INSIDE the polygon
in the new app (via Pattern V) vs OUTSIDE in legacy (via Pattern F best-effort).
The new app's total_ac_cable_m is therefore expected to be LOWER than legacy by
roughly the outside-detour length sum (~14474.8 m legacy → ~12361.0 m new app on
phaseboundary2 per S11.5 gate memo).

This delta is documented in docs/parity/findings/2026-04-29-001-pattern-v.md
and acknowledged here as expected.

Test skips when baseline JSON missing (Task 2 not yet run); fails when bundled
DC + MST AC port is missing (Tasks 5/6 not yet landed); passes after Tasks 5/6.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from pvlayout_core.core.kmz_parser import parse_kmz
from pvlayout_core.core.la_manager import place_lightning_arresters
from pvlayout_core.core.layout_engine import run_layout_multi
from pvlayout_core.core.string_inverter_manager import place_string_inverters
from pvlayout_core.models.project import (
    DesignMode,
    LayoutParameters,
    ModuleSpec,
    TableConfig,
)


REPO_ROOT = Path(__file__).resolve().parents[4]
KMZ_DIR = REPO_ROOT / "python/pvlayout_engine/tests/golden/kmz"
BASELINE_DIR = (
    REPO_ROOT / "docs/parity/baselines/baseline-v1-20260429/ground-truth"
)


def _build_default_params() -> LayoutParameters:
    """Match the params used by capture_legacy_baseline.py — dataclass defaults
    plus enable_cable_calc=True. The defaults (wattage=580, max_strings=20,
    design_mode=STRING_INVERTER) produce the S11.5 reference numbers
    (placed_tables=611, placed_string_inverters=62, placed_las=22 on phaseboundary2)."""
    p = LayoutParameters()
    p.enable_cable_calc = True
    return p


def _run_pipeline(kmz_path: Path):
    """Run the new project's full pipeline. Aggregates across all valid
    LayoutResult objects (single-boundary plants in our test set will have
    exactly one)."""
    parsed = parse_kmz(str(kmz_path))
    assert parsed.boundaries, f"no boundaries from {kmz_path}"
    params = _build_default_params()
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
        place_string_inverters(r, params)
        valid.append(r)
    return valid


def _aggregate(results):
    """Aggregate counts and totals across valid LayoutResult objects."""
    return {
        "counts": {
            "placed_tables": sum(len(r.placed_tables) for r in results),
            "placed_string_inverters": sum(
                len(r.placed_string_inverters) for r in results
            ),
            "placed_las": sum(len(r.placed_las) for r in results),
            "placed_icrs": sum(len(r.placed_icrs) for r in results),
            "dc_cable_runs": sum(len(r.dc_cable_runs) for r in results),
            "ac_cable_runs": sum(len(r.ac_cable_runs) for r in results),
        },
        "totals": {
            # Only the totals the tests actually assert against. total_capacity_kwp
            # was removed because no test reads it — keeping it in the aggregate
            # would imply false coverage. Capacity drift is caught indirectly
            # via placed_tables count (capacity = tables × strings × kwp/string).
            "total_dc_cable_m": round(
                sum(r.total_dc_cable_m for r in results), 1
            ),
            "total_ac_cable_m": round(
                sum(r.total_ac_cable_m for r in results), 1
            ),
        },
    }


def _load_baseline(plant: str) -> dict:
    """Load legacy baseline JSON, skipping the test if not yet captured."""
    p = BASELINE_DIR / plant / "numeric-baseline.json"
    if not p.exists():
        pytest.skip(
            f"baseline JSON missing: {p.relative_to(REPO_ROOT)}. "
            "Run P0 Task 2 (capture_legacy_baseline.py) to generate."
        )
    return json.loads(p.read_text())


# P0 scope note: only `phaseboundary2` is parametrized at this point.
# `complex-plant-layout` is deferred — capturing legacy's baseline on it
# took >20 min wall-clock without completing (legacy lacks the S11.5
# search-space caps, so the per-cable AC quantity routing on a large
# multi-plot KMZ is computationally heavy). Re-add when the perf issue
# is resolved (separate work; tracked outside P0 scope).
#
# Expected Pattern V deltas per plant (AC total only; DC + counts are exact-match).
# Documented in docs/parity/findings/2026-04-29-001-pattern-v.md.
# NOTE: phaseboundary2 delta is preliminary (-1500m approx based on
# legacy=12974.5m capture vs S11.5 gate memo's pre-V 14474.8m vs post-V 12361.0m).
# Recalibrated against actual capture in the JSON; tolerance is generous because
# the new project will not match legacy until Tasks 5+6 land bundling/MST port
# (and even then, only modulo S11.5 additions).
PATTERN_V_AC_DELTA_M = {
    "phaseboundary2": -613.5,   # legacy 12974.5 → new ~12361.0; delta ≈ -613.5m (post-Tasks-5/6, post-V)
}
PATTERN_V_AC_DELTA_TOL_M = 200.0  # generous tolerance until Tasks 5/6 calibrate


@pytest.mark.parametrize("plant", ["phaseboundary2"])
def test_p00_counts_match_legacy(plant: str) -> None:
    """Counts must match exactly. Pattern V doesn't change cable count — only routing."""
    baseline = _load_baseline(plant)
    results = _run_pipeline(KMZ_DIR / f"{plant}.kmz")
    actual = _aggregate(results)

    for key, expected in baseline["counts"].items():
        assert actual["counts"][key] == expected, (
            f"{plant}: count mismatch on {key}: "
            f"legacy={expected} new={actual['counts'][key]}"
        )


@pytest.mark.parametrize("plant", ["phaseboundary2"])
def test_p00_total_dc_matches_legacy(plant: str) -> None:
    """DC total must match within ±0.1m. Pattern V doesn't affect DC routing."""
    baseline = _load_baseline(plant)
    results = _run_pipeline(KMZ_DIR / f"{plant}.kmz")
    actual = _aggregate(results)

    legacy_dc = baseline["totals"]["total_dc_cable_m"]
    new_dc = actual["totals"]["total_dc_cable_m"]
    assert abs(new_dc - legacy_dc) < 0.1, (
        f"{plant}: DC total drift > ±0.1m: legacy={legacy_dc} new={new_dc} "
        f"delta={new_dc - legacy_dc:.3f}"
    )


@pytest.mark.parametrize("plant", ["phaseboundary2"])
def test_p00_total_ac_matches_legacy_modulo_pattern_v(plant: str) -> None:
    """AC total: legacy expects ±0.1m match; new app's Pattern V re-routes 15
    boundary-violation cables on phaseboundary2 inside the polygon, producing
    a known delta. Assert the delta is within the documented expected range."""
    baseline = _load_baseline(plant)
    results = _run_pipeline(KMZ_DIR / f"{plant}.kmz")
    actual = _aggregate(results)

    legacy_ac = baseline["totals"]["total_ac_cable_m"]
    new_ac = actual["totals"]["total_ac_cable_m"]
    delta = new_ac - legacy_ac

    expected_delta = PATTERN_V_AC_DELTA_M.get(plant)
    if expected_delta is None:
        # complex-plant-layout: Pattern V firing rate unknown until first measurement.
        # Just assert delta is reasonable (less than 10% of total).
        assert abs(delta) < legacy_ac * 0.10, (
            f"{plant}: AC total delta exceeds 10%: legacy={legacy_ac} new={new_ac} "
            f"delta={delta:.1f}m. If Pattern V fires extensively on this plant, "
            f"update PATTERN_V_AC_DELTA_M to record the calibrated expected value."
        )
    else:
        assert abs(delta - expected_delta) < PATTERN_V_AC_DELTA_TOL_M, (
            f"{plant}: AC delta drift > tolerance: legacy={legacy_ac} new={new_ac} "
            f"delta={delta:.1f}m expected={expected_delta:.1f}m "
            f"tolerance=±{PATTERN_V_AC_DELTA_TOL_M:.1f}m"
        )
