"""Tests for domain validation (levels 1-3; L4 dropped post-prod-smoke)."""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from parse_kmz_lambda.validator import ValidationError, validate_parsed_kmz


def _boundary(name: str, coords: list[tuple[float, float]]):
    return SimpleNamespace(
        name=name,
        coords=coords,
        obstacles=[],
        water_obstacles=[],
        line_obstructions=[],
    )


def _parsed(boundaries: list):
    return SimpleNamespace(
        boundaries=boundaries,
        centroid_lat=12.0,
        centroid_lon=78.0,
    )


def _square(name="boundary"):
    return _boundary(name, [(78.0, 12.0), (78.1, 12.0), (78.1, 12.1), (78.0, 12.1), (78.0, 12.0)])


def test_valid_input_passes():
    validate_parsed_kmz(_parsed([_square()]))  # no exception


def test_level1_no_boundaries_fails():
    with pytest.raises(ValidationError, match="no boundary placemarks"):
        validate_parsed_kmz(_parsed([]))


def test_level2_two_vertex_fails():
    with pytest.raises(ValidationError, match="minimum is 3"):
        validate_parsed_kmz(_parsed([_boundary("a", [(78.0, 12.0), (78.1, 12.0)])]))


def test_level3_out_of_range_lon_fails():
    with pytest.raises(ValidationError, match="out-of-range"):
        validate_parsed_kmz(_parsed([_boundary("a", [(200.0, 12.0), (200.1, 12.0), (200.0, 12.1), (200.0, 12.0)])]))


def test_level3_out_of_range_lat_fails():
    with pytest.raises(ValidationError, match="out-of-range"):
        validate_parsed_kmz(_parsed([_boundary("a", [(78.0, 95.0), (78.1, 95.0), (78.0, 95.1), (78.0, 95.0)])]))


def test_self_intersecting_polygon_passes():
    """L4 (Shapely is_valid) was dropped post-prod-smoke — real customer
    KMZs from CAD/KML editors / surveyed boundaries routinely have
    minor topological imperfections (one-vertex kinks) that Shapely
    flags but downstream rendering + compute-layout handle fine. The
    legacy sidecar didn't do this check; we matched legacy behavior."""
    bow_tie = _boundary("a", [(78.0, 12.0), (78.1, 12.1), (78.1, 12.0), (78.0, 12.1), (78.0, 12.0)])
    validate_parsed_kmz(_parsed([bow_tie]))  # no exception


def test_multi_boundary_first_failure_wins():
    """If boundary A is valid but B is not, the error names B."""
    good = _square(name="A")
    bad = _boundary("B", [(78.0, 12.0), (78.1, 12.0)])
    with pytest.raises(ValidationError, match="'B'"):
        validate_parsed_kmz(_parsed([good, bad]))
