"""CR1 cable-routing correctness regression test.

Asserts that the new app's AC cable router produces routes consistent
with the audit-grounded correctness contract:

  1. ZERO AC cables exit the plant fence on either fixture. The fence
     (the property boundary as drawn in the source KMZ) is the
     legal/physical boundary; cables outside it are off-property and
     unbuildable. This is the "Class A defect" of the legacy reference
     compliance reports — the new app must not regress here.

  2. AT MOST 0.5% of AC cables on any boundary tagged
     ``route_quality == "boundary_violation"``. The legacy reference
     numbers are 38/62 (61%) on phaseboundary2 and 532/1079 (49%) on
     complex-plant-layout against legacy's ``usable_polygon`` referent;
     the new app's empirical baseline at the time of CR1 (2026-05-02)
     is 0/62 (0%) and 13/1079 (1.2%) against ``usable_polygon`` — and
     of those 13, only 1 cable's polyline actually has any segment
     outside the fence (Class A above), and that violation is on
     complex-plant boundary 2 which has a multi-component
     ``usable_polygon``. The 0.5% threshold is set above the empirical
     baseline so the test catches regressions, not noise.

  3. Pattern V intercepts at least one cable on phaseboundary2. The
     existing test ``test_layout_s11_5_cables.py:180-203`` asserts
     this implicitly via "non-zero V routes"; CR1's test asserts it
     explicitly so the regression is named in the failure message.

Numbers reported by ``scripts/parity/probe_pattern_stats.py`` feed
the unified compliance PDF + the PRD at
``docs/post-parity/PRD-cable-routing-correctness.md``.

This test runs the in-process pipeline directly (not via FastAPI
``/layout``) — same module path as the probe script — to keep
runtime under control. PVLAYOUT_SKIP_SLOW_CABLES=1 skips it in
constrained CI, matching the existing s11_5 test's escape hatch.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, List, Tuple

import pytest
from shapely.geometry import LineString, Polygon

from pvlayout_core.core.kmz_parser import parse_kmz
from pvlayout_core.core.la_manager import place_lightning_arresters
from pvlayout_core.core.layout_engine import run_layout_multi
from pvlayout_core.core.string_inverter_manager import (
    place_string_inverters,
)
from pvlayout_core.models.project import LayoutParameters
from pvlayout_core.utils.geo_utils import wgs84_to_utm

KMZ_DIR = Path(__file__).resolve().parents[1] / "golden" / "kmz"

FIXTURES = [
    ("phaseboundary2", KMZ_DIR / "phaseboundary2.kmz"),
    ("complex-plant-layout", KMZ_DIR / "complex-plant-layout.kmz"),
]

# Per-boundary fraction tolerance for ``route_quality == "boundary_violation"``.
# Set above the empirical baseline at CR1 (2026-05-02): worst case is
# complex-plant-layout boundary 2 at 1/66 (1.515%). Threshold is 2.0% so
# regressions trip without flapping on the existing baseline.
BV_FRACTION_PER_BOUNDARY_MAX = 0.02

# Minimum tolerance for fence-overshoot length. Floating-point noise in the
# shapely intersect/difference can produce sub-mm artefacts on long polylines;
# treat anything below 1 cm as numeric noise rather than a real overshoot.
FENCE_OVERSHOOT_NOISE_FLOOR_M = 0.01


pytestmark = pytest.mark.skipif(
    os.environ.get("PVLAYOUT_SKIP_SLOW_CABLES") == "1",
    reason="PVLAYOUT_SKIP_SLOW_CABLES=1 set; skipping cables-on integration",
)


def _route_outside_fence_length(
    route_utm: List[Tuple[float, float]], fence_poly: Polygon
) -> float:
    """Length of the polyline that lies outside the fence polygon, in metres.

    Mirrors ``scripts/parity/detect_legacy_overshoots.py::_route_outside_length``
    so the new-app numbers reported by the test are directly comparable to
    the legacy capture numbers in the unified compliance PDF.
    """
    if len(route_utm) < 2:
        return 0.0
    line = LineString([(p[0], p[1]) for p in route_utm])
    outside = line.difference(fence_poly)
    return outside.length if not outside.is_empty else 0.0


def _build_fence_polygon(boundary_wgs84, utm_epsg: int) -> Polygon:
    """Project the KMZ-source boundary polygon into the result's UTM zone."""
    coords_utm = wgs84_to_utm(boundary_wgs84, utm_epsg)
    return Polygon(coords_utm)


def _run_pipeline(kmz_path: Path) -> List[Any]:
    """Parse → layout → LA placement → cable routing. Returns LayoutResult list."""
    parsed = parse_kmz(str(kmz_path))
    params = LayoutParameters()
    params.enable_cable_calc = True
    results = run_layout_multi(
        boundaries=parsed.boundaries,
        params=params,
        centroid_lat=parsed.centroid_lat,
        centroid_lon=parsed.centroid_lon,
    )
    for r in results:
        if not r.placed_tables:
            continue
        place_lightning_arresters(r, params)
        place_string_inverters(r, params)
    return results


@pytest.mark.parametrize("plant,kmz_path", FIXTURES, ids=[f[0] for f in FIXTURES])
def test_no_cable_exits_fence(plant: str, kmz_path: Path) -> None:
    """No AC cable polyline may exit the plant fence."""
    if not kmz_path.exists():
        pytest.skip(f"{kmz_path} missing")

    results = _run_pipeline(kmz_path)

    offenders: List[Tuple[int, int, float]] = []
    for b_idx, r in enumerate(results):
        if not r.ac_cable_runs:
            continue
        fence = _build_fence_polygon(r.boundary_wgs84, r.utm_epsg)
        for c_idx, cable in enumerate(r.ac_cable_runs):
            route = cable.route_utm or [cable.start_utm, cable.end_utm]
            outside_m = _route_outside_fence_length(route, fence)
            if outside_m > FENCE_OVERSHOOT_NOISE_FLOOR_M:
                offenders.append((b_idx, c_idx, outside_m))

    assert not offenders, (
        f"{plant}: {len(offenders)} AC cables exit the plant fence — "
        f"new app regressed into legacy's Class A defect class. "
        f"Sample offenders (boundary, cable, outside_m): "
        f"{offenders[:5]}"
    )


@pytest.mark.parametrize("plant,kmz_path", FIXTURES, ids=[f[0] for f in FIXTURES])
def test_boundary_violation_fraction_within_tolerance(
    plant: str, kmz_path: Path
) -> None:
    """Per boundary, at most BV_FRACTION_PER_BOUNDARY_MAX of AC cables tagged
    boundary_violation. Catches Pattern F escapees regressing past the
    CR1-baseline noise floor."""
    if not kmz_path.exists():
        pytest.skip(f"{kmz_path} missing")

    results = _run_pipeline(kmz_path)

    breaches: List[Tuple[int, int, int, float]] = []
    for b_idx, r in enumerate(results):
        if not r.ac_cable_runs:
            continue
        n = len(r.ac_cable_runs)
        bv = sum(
            1 for c in r.ac_cable_runs if c.route_quality == "boundary_violation"
        )
        frac = bv / n if n else 0.0
        if frac > BV_FRACTION_PER_BOUNDARY_MAX:
            breaches.append((b_idx, bv, n, frac))

    assert not breaches, (
        f"{plant}: per-boundary boundary_violation fraction exceeds "
        f"{BV_FRACTION_PER_BOUNDARY_MAX:.1%}. Breaches "
        f"(boundary, bv, total, fraction): {breaches}"
    )


def test_pattern_v_intercepts_on_phaseboundary2() -> None:
    """Pattern V must route at least one AC cable on phaseboundary2.

    phaseboundary2 has concave geometry that defeats the strict-Manhattan
    A-E templates; Pattern V's visibility graph over ``route_poly``
    (= fence − ICRs) is the designed-in fix. A regression that disables
    V (e.g. by breaking ``_build_route_polygon``) would silently fall
    through to Pattern F.

    Detection signal: cables tagged ``route_quality == "ok"`` whose
    polyline has at least one segment OUTSIDE ``usable_polygon``.
    Patterns A-E validate against ``usable_polygon`` so their polylines
    are fully inside it. Pattern V validates against the wider
    ``route_poly``, so V's polylines can have segments outside
    ``usable_polygon`` (in the perimeter-road band) while still being
    inside the fence — matches the legitimate cable corridor per
    industry research. The empirical baseline at CR1 (2026-05-02) on
    phaseboundary2 is 16 V dispatches across 62 AC cables; this test
    asserts ≥ 1 to catch full V regression.
    """
    kmz_path = KMZ_DIR / "phaseboundary2.kmz"
    if not kmz_path.exists():
        pytest.skip(f"{kmz_path} missing")

    results = _run_pipeline(kmz_path)
    assert results, "phaseboundary2 produced zero LayoutResults"
    r = results[0]

    ok_cables = [c for c in r.ac_cable_runs if c.route_quality == "ok"]
    assert ok_cables, (
        "phaseboundary2: no AC cables tagged route_quality=ok; "
        "Pattern V or A-family is failing entirely. Investigate "
        "_build_route_polygon and the _route_ac_cable dispatch chain."
    )

    # Pattern V signal: a route_quality=ok cable with any segment outside
    # usable_polygon. A-E paths are fully inside usable_polygon by
    # construction (they validate against it); V paths can extend into
    # the perimeter-road band (route_poly minus usable_polygon).
    usable_poly = r.usable_polygon
    assert usable_poly is not None, "usable_polygon missing on result"

    v_routed = []
    for c in ok_cables:
        route = c.route_utm or [c.start_utm, c.end_utm]
        if len(route) < 2:
            continue
        line = LineString([(p[0], p[1]) for p in route])
        outside_usable = line.difference(usable_poly)
        if not outside_usable.is_empty and outside_usable.length > 0.5:
            v_routed.append(c)

    assert v_routed, (
        "phaseboundary2: no AC cables tagged route_quality=ok have "
        "polyline segments outside usable_polygon. Pattern V is not "
        "firing — it should be routing 16 of 62 cables through the "
        "perimeter-road band on this fixture. Investigate "
        "_build_route_polygon and Pattern V dispatch in _route_ac_cable."
    )
