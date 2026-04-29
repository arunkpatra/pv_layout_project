"""
Parity test for solar transposition (Row #7 of docs/PLAN.md).

Bit-exact comparison against legacy on synthetic GHI / monthly inputs.
Pure functions, no I/O — deterministic across runs.
"""

from __future__ import annotations

import math
import sys
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np
import pytest


LEGACY_REPO = Path("/Users/arunkpatra/codebase/PVlayout_Advance")


def _purge_legacy_modules():
    """Remove cached bare-namespace modules so legacy and new-app
    namespaces don't collide."""
    for m in list(sys.modules):
        if m == "core" or m.startswith("core."):
            del sys.modules[m]


@pytest.fixture(scope="module")
def legacy_solar():
    """Module-scoped: bound the sys.path mutation to this test module's lifetime."""
    if not LEGACY_REPO.exists():
        pytest.skip(f"legacy repo not at {LEGACY_REPO}")
    _purge_legacy_modules()
    sys.path.insert(0, str(LEGACY_REPO))
    try:
        from core.solar_transposition import (
            ghi_to_gti_hsat as legacy_hsat,
            annual_gti_from_ghi_hsat as legacy_annual,
            generate_synthetic_hourly_gti as legacy_synth,
        )
        yield (legacy_hsat, legacy_annual, legacy_synth)
    finally:
        try:
            sys.path.remove(str(LEGACY_REPO))
        except ValueError:
            pass
        _purge_legacy_modules()


def _synthetic_ghi_year(year=2024, lat_deg=12.0):
    """Deterministic 8760- or 8784-hour GHI array. Noon-peaked diurnal,
    seasonally modulated. Returns (timestamps, ghi_wm2)."""
    is_leap = (year % 4 == 0 and (year % 100 != 0 or year % 400 == 0))
    n = 8784 if is_leap else 8760
    timestamps = []
    ghi = []
    cur = datetime(year, 1, 1, 0, 30)
    for _ in range(n):
        doy = cur.timetuple().tm_yday
        hour = cur.hour + 0.5
        season = 0.7 + 0.3 * math.sin(2 * math.pi * (doy - 80) / 365.0)
        diurnal = max(0.0, math.cos((hour - 12.0) * math.pi / 12.0))
        ghi.append(900.0 * season * diurnal)
        timestamps.append(cur.strftime("%Y-%m-%d %H:%M"))
        cur += timedelta(hours=1)
    return timestamps, ghi


def test_solar_transposition_module_importable():
    """All three new functions resolve from the new app."""
    from pvlayout_core.core.solar_transposition import (
        ghi_to_gti_hsat,
        annual_gti_from_ghi_hsat,
        generate_synthetic_hourly_gti,
    )
    assert callable(ghi_to_gti_hsat)
    assert callable(annual_gti_from_ghi_hsat)
    assert callable(generate_synthetic_hourly_gti)


def test_ghi_to_gti_hsat_bit_exact_parity(legacy_solar):
    """Hour-by-hour HSAT GTI bit-exact match on a year of synthetic GHI."""
    legacy_hsat, _, _ = legacy_solar
    from pvlayout_core.core.solar_transposition import ghi_to_gti_hsat as new_hsat

    timestamps, ghi = _synthetic_ghi_year(year=2024, lat_deg=12.0)
    legacy_gti = legacy_hsat(ghi, timestamps, lat_deg=12.0)
    new_gti = new_hsat(ghi, timestamps, lat_deg=12.0)

    assert legacy_gti.shape == new_gti.shape, "shape drift"
    assert np.array_equal(legacy_gti, new_gti), (
        f"GTI diff: {(legacy_gti != new_gti).sum()} of {legacy_gti.size} hours differ"
    )


def test_annual_gti_from_ghi_hsat_parity(legacy_solar):
    """Annual-total wrapper bit-exact match."""
    _, legacy_annual, _ = legacy_solar
    from pvlayout_core.core.solar_transposition import annual_gti_from_ghi_hsat as new_annual

    timestamps, ghi = _synthetic_ghi_year(year=2024, lat_deg=12.0)
    legacy_total = legacy_annual(ghi, timestamps, lat_deg=12.0)
    new_total = new_annual(ghi, timestamps, lat_deg=12.0)

    assert math.isclose(legacy_total, new_total, abs_tol=1e-9), (
        f"annual GTI drift: legacy {legacy_total} vs new {new_total}"
    )


@pytest.mark.parametrize("is_sat", [False, True])
@pytest.mark.parametrize("year", [2024, 2023])   # leap + non-leap
def test_generate_synthetic_hourly_gti_parity(legacy_solar, is_sat, year):
    """Synthetic-GTI generator bit-exact match on both FT and SAT branches,
    leap and non-leap years."""
    _, _, legacy_synth = legacy_solar
    from pvlayout_core.core.solar_transposition import generate_synthetic_hourly_gti as new_synth

    monthly = [120.0, 130.0, 145.0, 150.0, 160.0, 155.0,
               150.0, 150.0, 145.0, 140.0, 130.0, 125.0]
    legacy_ts, legacy_gti = legacy_synth(
        lat_deg=12.0, monthly_gti_kwh_m2=monthly, year=year, is_sat=is_sat,
    )
    new_ts, new_gti = new_synth(
        lat_deg=12.0, monthly_gti_kwh_m2=monthly, year=year, is_sat=is_sat,
    )

    assert legacy_ts == new_ts, f"timestamps drift (year={year}, is_sat={is_sat})"
    assert len(legacy_gti) == len(new_gti), (
        f"GTI len drift: legacy {len(legacy_gti)} vs new {len(new_gti)}"
    )
    legacy_arr = np.asarray(legacy_gti)
    new_arr = np.asarray(new_gti)
    assert np.allclose(legacy_arr, new_arr, atol=1e-9, rtol=0.0), (
        f"GTI value drift (year={year}, is_sat={is_sat}): "
        f"max abs diff {np.abs(legacy_arr - new_arr).max()}"
    )
