"""
Parity test for KMZ parser (Row #4 of docs/PLAN.md).

Live cross-compare: imports both legacy core.kmz_parser (via sys.path
bootstrap) and the new app's pvlayout_core.core.kmz_parser, runs them
on the same test KMZ fixtures, asserts identical output:
  - boundary count + names + coords
  - per-boundary obstacles[], water_obstacles[], line_obstructions[]
  - centroid_lat, centroid_lon

Skips if the legacy repo isn't on disk (CI / fresh checkout). Fails
if the port hasn't landed yet (the new app's pre-port parse_kmz
mishandles water-named polygons in the test fixtures).
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import pytest


REPO_ROOT = Path(__file__).resolve().parents[4]
KMZ_DIR = REPO_ROOT / "python/pvlayout_core/tests/golden/kmz"
LEGACY_REPO = Path("/Users/arunkpatra/codebase/PVlayout_Advance")


def _purge_legacy_modules():
    """Remove cached `core` and `core.*` modules so legacy and new-app
    namespaces don't collide. Safe because pvlayout_core.* is a different
    namespace; we only touch bare `core.*`."""
    for m in list(sys.modules):
        if m == "core" or m.startswith("core."):
            del sys.modules[m]


@pytest.fixture(scope="module")
def legacy_parser():
    """Import legacy parse_kmz via sys.path bootstrap. Module-scoped to
    bound the sys.path mutation to this test module's lifetime."""
    if not LEGACY_REPO.exists():
        pytest.skip(f"legacy repo not at {LEGACY_REPO}")

    _purge_legacy_modules()
    sys.path.insert(0, str(LEGACY_REPO))
    try:
        from core import kmz_parser as legacy
        yield legacy
    finally:
        try:
            sys.path.remove(str(LEGACY_REPO))
        except ValueError:
            pass
        _purge_legacy_modules()


@pytest.mark.parametrize("kmz_name", [
    "phaseboundary2.kmz",
    "complex-plant-layout.kmz",
    "Kudlugi Boundary (89 acres).kmz",
])
def test_parse_kmz_parity_with_legacy(legacy_parser, kmz_name):
    kmz_path = KMZ_DIR / kmz_name
    assert kmz_path.exists(), f"missing fixture: {kmz_path}"

    # Import new parser AFTER the legacy fixture is set up; pvlayout_core.*
    # is a different namespace from bare `core.*` so this resolves cleanly.
    from pvlayout_core.core.kmz_parser import parse_kmz as new_parse

    legacy_result = legacy_parser.parse_kmz(str(kmz_path))
    new_result = new_parse(str(kmz_path))

    # Centroid
    assert math.isclose(legacy_result.centroid_lat, new_result.centroid_lat, abs_tol=1e-9), (
        f"{kmz_name} centroid_lat drift"
    )
    assert math.isclose(legacy_result.centroid_lon, new_result.centroid_lon, abs_tol=1e-9), (
        f"{kmz_name} centroid_lon drift"
    )

    # Boundaries
    assert len(legacy_result.boundaries) == len(new_result.boundaries), (
        f"{kmz_name} boundary count drift: "
        f"legacy {len(legacy_result.boundaries)} vs new {len(new_result.boundaries)}"
    )

    for i, (lb, nb) in enumerate(zip(legacy_result.boundaries, new_result.boundaries)):
        assert lb.name == nb.name, f"{kmz_name} boundary[{i}].name"
        assert lb.coords == nb.coords, f"{kmz_name} boundary[{i}].coords"
        assert lb.obstacles == nb.obstacles, f"{kmz_name} boundary[{i}].obstacles"
        assert lb.water_obstacles == nb.water_obstacles, (
            f"{kmz_name} boundary[{i}].water_obstacles"
        )
        assert lb.line_obstructions == nb.line_obstructions, (
            f"{kmz_name} boundary[{i}].line_obstructions"
        )


@pytest.mark.parametrize("kmz_name", [
    "phaseboundary2.kmz",
    "complex-plant-layout.kmz",
    "Kudlugi Boundary (89 acres).kmz",
])
def test_validate_boundaries_clean_on_known_fixtures(kmz_name):
    """All three test KMZs are known-good; validate_boundaries returns []."""
    from pvlayout_core.core.kmz_parser import validate_boundaries

    kmz_path = KMZ_DIR / kmz_name
    problems = validate_boundaries(str(kmz_path))
    assert problems == [], (
        f"{kmz_name}: validate_boundaries returned issues: {problems}"
    )
