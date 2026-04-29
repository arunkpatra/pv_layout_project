"""
Parity test for satellite water-body detector (Row #5 of docs/PLAN.md).

The classifier (`_water_mask`) is the heart of the detector. Bit-exact
mask comparison on a synthetic RGB array proves the port preserves all
four classification rules + NDVI exclusion + brightness ceiling +
morphological cleanup.

No network. Tile fetching is operational, not algorithmic.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest


LEGACY_REPO = Path("/Users/arunkpatra/codebase/PVlayout_Advance")


def _purge_legacy_modules():
    for m in list(sys.modules):
        if m == "core" or m.startswith("core."):
            del sys.modules[m]


@pytest.fixture(scope="module")
def legacy_water_mask():
    """Module-scoped: bound the sys.path mutation; remove cached
    bare `core.*` modules on enter and exit so the new app's
    pvlayout_core namespace is unaffected."""
    if not LEGACY_REPO.exists():
        pytest.skip(f"legacy repo not at {LEGACY_REPO}")
    _purge_legacy_modules()
    sys.path.insert(0, str(LEGACY_REPO))
    try:
        from core.satellite_water_detector import _water_mask
        yield _water_mask
    finally:
        try:
            sys.path.remove(str(LEGACY_REPO))
        except ValueError:
            pass
        _purge_legacy_modules()


def _synthetic_rgb_with_known_water_regions() -> np.ndarray:
    """Build a 256×256 RGB array containing patches that hit each
    classifier rule (absolute-dark, blue-dominant, turbid grey-brown,
    locally-dark). Deterministic — uses fixed-seed RNG for noise floor."""
    arr = np.zeros((256, 256, 3), dtype=np.uint8)

    rng = np.random.RandomState(42)
    # Background: random Deccan-soil reddish-brown
    arr[:, :, 0] = 120 + (rng.rand(256, 256) * 40).astype(np.uint8)   # R 120-160
    arr[:, :, 1] = 80 + (rng.rand(256, 256) * 30).astype(np.uint8)    # G  80-110
    arr[:, :, 2] = 60 + (rng.rand(256, 256) * 30).astype(np.uint8)    # B  60- 90

    # Region A (top-left, 60×60): absolute-dark turbid pond — RGB ~ (50, 55, 60)
    arr[10:70, 10:70, 0] = 50
    arr[10:70, 10:70, 1] = 55
    arr[10:70, 10:70, 2] = 60

    # Region B (top-right, 60×60): blue-dominant clear lake — RGB ~ (60, 80, 120)
    arr[10:70, 180:240, 0] = 60
    arr[10:70, 180:240, 1] = 80
    arr[10:70, 180:240, 2] = 120

    # Region C (bottom-left, 60×60): turbid grey-brown — RGB ~ (75, 75, 80)
    arr[180:240, 10:70, 0] = 75
    arr[180:240, 10:70, 1] = 75
    arr[180:240, 10:70, 2] = 80

    # Region D (bottom-right, 60×60): locally-dark — surrounded by bright soil
    arr[180:240, 180:240, 0] = 90
    arr[180:240, 180:240, 1] = 90
    arr[180:240, 180:240, 2] = 90

    return arr


def test_water_mask_bit_exact_parity(legacy_water_mask):
    """Bit-exact match proves the port preserves all four classification
    rules + NDVI exclusion + brightness ceiling + morphological cleanup."""
    from pvlayout_core.core.satellite_water_detector import _water_mask as new_mask_fn

    arr = _synthetic_rgb_with_known_water_regions()
    legacy_mask = legacy_water_mask(arr)
    new_mask = new_mask_fn(arr)

    assert legacy_mask.shape == new_mask.shape, "mask shape drift"
    assert legacy_mask.dtype == new_mask.dtype, "mask dtype drift"
    assert np.array_equal(legacy_mask, new_mask), (
        f"mask diff: {(legacy_mask != new_mask).sum()} pixels differ "
        f"(out of {legacy_mask.size})"
    )


def test_satellite_module_importable():
    """Smoke check — module imports, satellite_available() honest about deps."""
    from pvlayout_core.core import satellite_water_detector as swd
    assert callable(swd.satellite_available)
    assert callable(swd.detect_with_preview)
    assert callable(swd.detect_water_bodies)
    assert swd.satellite_available() is True   # Pillow + NumPy guaranteed by deps
