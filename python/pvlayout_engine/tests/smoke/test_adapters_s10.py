"""
Unit tests for the S10 WGS84 geometry additions in `pvlayout_engine.adapters`.

S10 adds five pre-projected fields to ``LayoutResult`` so the desktop
MapCanvas can render inverters / cables / LAs / LA protection circles
without client-side UTM↔WGS84 projection:

  * ``placed_string_inverters_wgs84`` — rect rings (5 points, closed)
  * ``dc_cable_runs_wgs84``           — polylines
  * ``ac_cable_runs_wgs84``           — polylines
  * ``placed_las_wgs84``              — rect rings
  * ``placed_las_circles_wgs84``      — 65-point circle polygons (64 segments)

Rather than drive a full ``/layout`` request (``enable_cable_calc=True``
is O(minutes) on phaseboundary2), this test constructs a synthetic core
``LayoutResult`` dataclass with one of each object and exercises
``result_from_core`` directly. That's the layer these new fields are
produced at, and it's where regression risk actually lives.

The integration test in ``tests/integration/test_layout_s10_wgs84.py``
covers the "fields present on real /layout output" smoke for LAs,
which don't depend on cable-calc.
"""
from __future__ import annotations

import math

import pytest

from pvlayout_core.models import project as core

from pvlayout_engine.adapters import result_from_core


# UTM Zone 44N is appropriate for central India (the phaseboundary KMZs
# live here). Any valid EPSG works — we only care about the round-trip.
TEST_EPSG = 32644


def _haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Great-circle distance in metres between two (lon, lat) points."""
    lon1, lat1 = math.radians(a[0]), math.radians(a[1])
    lon2, lat2 = math.radians(b[0]), math.radians(b[1])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    h = (math.sin(dlat / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2)
    return 2 * 6_371_008.8 * math.asin(math.sqrt(h))


def _make_synthetic_result() -> core.LayoutResult:
    """Minimal LayoutResult with one of each S10 object kind.

    UTM coordinates in Zone 44N that project to somewhere in central
    India (lat ~21, lon ~81) — within range of the WGS84 sanity bounds
    the tests use.
    """
    r = core.LayoutResult()
    r.utm_epsg = TEST_EPSG
    r.boundary_name = "synthetic"

    r.placed_string_inverters = [
        core.PlacedStringInverter(
            x=500_000.0, y=2_400_000.0,
            width=2.0, height=1.0,
            index=1, capacity_kwp=250.0, assigned_table_count=10,
        ),
    ]

    # DC cable with a routed path (3 segments).
    r.dc_cable_runs = [
        core.CableRun(
            start_utm=(500_000.0, 2_400_000.0),
            end_utm=(500_100.0, 2_400_050.0),
            route_utm=[
                (500_000.0, 2_400_000.0),
                (500_050.0, 2_400_000.0),
                (500_050.0, 2_400_050.0),
                (500_100.0, 2_400_050.0),
            ],
            index=1, cable_type="dc", length_m=200.0,
        ),
    ]

    # AC cable WITHOUT a route — exercises the [start, end] fallback.
    r.ac_cable_runs = [
        core.CableRun(
            start_utm=(500_100.0, 2_400_050.0),
            end_utm=(500_200.0, 2_400_150.0),
            route_utm=[],
            index=1, cable_type="ac", length_m=141.4,
        ),
    ]

    r.placed_las = [
        core.PlacedLA(
            x=500_000.0, y=2_400_000.0,
            width=40.0, height=14.0,
            radius=100.0, index=1,
        ),
    ]

    return r


def test_string_inverter_wgs84_has_closed_rect_ring() -> None:
    result = result_from_core(_make_synthetic_result())

    assert len(result.placed_string_inverters_wgs84) == 1
    ring = result.placed_string_inverters_wgs84[0]
    assert len(ring) == 5, f"got {len(ring)} points, expected 5"
    assert ring[0] == ring[-1], "ring not closed"
    for lon, lat in ring:
        assert -180.0 <= lon <= 180.0
        assert -90.0 <= lat <= 90.0


def test_dc_cable_wgs84_projects_full_route() -> None:
    result = result_from_core(_make_synthetic_result())

    assert len(result.dc_cable_runs_wgs84) == 1
    line = result.dc_cable_runs_wgs84[0]
    # Synthetic route has 4 UTM points → 4 WGS84 points.
    assert len(line) == 4, f"expected 4-point route projection, got {len(line)}"
    for lon, lat in line:
        assert -180.0 <= lon <= 180.0
        assert -90.0 <= lat <= 90.0


def test_ac_cable_wgs84_falls_back_to_start_end_when_route_empty() -> None:
    """Cable runs with empty route_utm are projected as a straight segment."""
    result = result_from_core(_make_synthetic_result())

    assert len(result.ac_cable_runs_wgs84) == 1
    line = result.ac_cable_runs_wgs84[0]
    assert len(line) == 2, (
        f"empty route should project as 2-point segment, got {len(line)}"
    )


def test_la_rect_wgs84_has_closed_ring() -> None:
    result = result_from_core(_make_synthetic_result())

    assert len(result.placed_las_wgs84) == 1
    ring = result.placed_las_wgs84[0]
    assert len(ring) == 5
    assert ring[0] == ring[-1]


def test_la_circle_wgs84_samples_radius_accurately() -> None:
    """The 64-segment approximation should sit within 1% of the stated radius.

    Measured as the great-circle distance from the LA rect centroid to
    the first circle sample point — regression guard against getting the
    center wrong (e.g. using (x, y) instead of (x + w/2, y + h/2)) or
    losing the projection along the way.
    """
    result = result_from_core(_make_synthetic_result())

    assert len(result.placed_las_circles_wgs84) == 1
    ring = result.placed_las_circles_wgs84[0]
    # 64 segments + closing point.
    assert len(ring) == 65
    assert ring[0] == ring[-1]

    # Rect centroid (from first 4 points of the placed_las_wgs84 ring).
    rect = result.placed_las_wgs84[0]
    centroid = (
        sum(p[0] for p in rect[:4]) / 4.0,
        sum(p[1] for p in rect[:4]) / 4.0,
    )
    first_sample = (ring[0][0], ring[0][1])
    la = result.placed_las[0]
    dist_m = _haversine_m(centroid, first_sample)
    assert abs(dist_m - la.radius) / la.radius < 0.01, (
        f"sampled radius {dist_m:.2f}m differs from stated "
        f"{la.radius}m by more than 1%"
    )


def test_empty_core_result_emits_empty_wgs84_lists() -> None:
    """Regression guard: empty core lists → empty WGS84 lists, not missing fields."""
    r = core.LayoutResult()
    r.utm_epsg = TEST_EPSG
    result = result_from_core(r)

    assert result.placed_string_inverters_wgs84 == []
    assert result.dc_cable_runs_wgs84 == []
    assert result.ac_cable_runs_wgs84 == []
    assert result.placed_las_wgs84 == []
    assert result.placed_las_circles_wgs84 == []
