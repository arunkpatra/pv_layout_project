"""
Parity test for energy_calculator (Row #8 of docs/PLAN.md).

Bit-exact comparison against legacy on:
  1. Full-pipeline calculate_energy (FT + SAT) with synthetic hourly inputs
  2. calculate_pr (pure loss arithmetic)
  3. _fetch_pvgis_sat (mocked PVGIS response — no live network)

All four cases run in-process via sys.path bootstrap. The legacy modules
import `core.X`/`models.X`; the new modules import `pvlayout_core.core.X`/
`pvlayout_core.models.X`. We swap by purging sys.modules entries for
`core.`/`models.` and inserting LEGACY_REPO on sys.path before legacy
imports, then removing it after.
"""

from __future__ import annotations

import math
import sys
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


LEGACY_REPO = Path("/Users/arunkpatra/codebase/PVlayout_Advance")


def _purge_legacy_modules():
    """Remove cached bare-namespace modules so legacy and new-app
    namespaces don't collide."""
    for m in list(sys.modules):
        if m == "core" or m.startswith("core."):
            del sys.modules[m]
        elif m == "models" or m.startswith("models."):
            del sys.modules[m]


@pytest.fixture(scope="module")
def legacy_energy():
    """Module-scoped: bound the sys.path mutation to this test module's lifetime."""
    if not LEGACY_REPO.exists():
        pytest.skip(f"legacy repo not at {LEGACY_REPO}")
    _purge_legacy_modules()
    sys.path.insert(0, str(LEGACY_REPO))
    try:
        from core.energy_calculator import (
            calculate_energy as legacy_calc,
            calculate_pr as legacy_pr,
            _fetch_pvgis_sat as legacy_sat_fetch,
        )
        from models.project import EnergyParameters as LegacyParams
        yield (legacy_calc, legacy_pr, legacy_sat_fetch, LegacyParams)
    finally:
        try:
            sys.path.remove(str(LEGACY_REPO))
        except ValueError:
            pass
        _purge_legacy_modules()


def _synthetic_inputs(year: int = 2023, lat_deg: float = 20.0):
    """8760-hour deterministic synthetic GHI + temperature.

    GHI: noon-peaked diurnal × seasonally-modulated amplitude, scaled to
    roughly 1900 kWh/m²/yr (Indian site).
    Temperature: sinusoidal seasonal (mean 28 °C, ±8 °C, peak DOY ~150).
    """
    timestamps = []
    ghi = []
    temp = []
    cur = datetime(year, 1, 1, 0, 30)
    for _ in range(8760):
        doy = cur.timetuple().tm_yday
        hour = cur.hour + 0.5
        # diurnal: cos((h-12)π/12), zero outside [6,18]
        diurnal = max(0.0, math.cos((hour - 12.0) * math.pi / 12.0))
        # seasonal amplitude factor (Indian site: peak around April–May,
        # trough around December)
        season = 0.7 + 0.3 * math.sin(2 * math.pi * (doy - 80) / 365.0)
        # 900 W/m² peak × shape ⇒ ~1900 kWh/m²/yr
        ghi.append(900.0 * season * diurnal)
        # Temperature: 28 + 8·cos(2π(doy-150)/365)  → peak summer at DOY 150
        t_amb = 28.0 + 8.0 * math.cos(2 * math.pi * (doy - 150) / 365.0)
        temp.append(t_amb)
        timestamps.append(cur.strftime("%Y-%m-%d %H:%M"))
        cur += timedelta(hours=1)
    return timestamps, ghi, temp


def _build_params(LegacyOrNewParams, *, is_sat: bool):
    """Construct an EnergyParameters with hourly inputs filled.

    Works for both the legacy and new dataclass — both share the same
    field names (the new app's models/project.py was pre-populated for
    SAT before the row-#8 port).
    """
    timestamps, ghi, temp = _synthetic_inputs(year=2023, lat_deg=20.0)
    p = LegacyOrNewParams(
        is_sat=is_sat,
        sat_max_angle_deg=55.0,
        site_lat=20.0,
        site_tilt_deg=20.0,
        site_azimuth_pvgis=0.0,
        weather_source="pvgis_api",
        plant_lifetime_years=25,
        is_bifacial=False,
        # PR loss components — defaults are fine; set explicitly to be
        # robust against drift in dataclass defaults across legacy/new.
        inverter_efficiency_pct=97.0,
        dc_cable_loss_pct=2.0,
        ac_cable_loss_pct=1.0,
        soiling_loss_pct=4.0,
        temperature_loss_pct=6.0,
        mismatch_loss_pct=2.0,
        shading_loss_pct=2.0,
        availability_pct=98.0,
        transformer_loss_pct=1.0,
        other_loss_pct=1.0,
        first_year_degradation_pct=2.0,
        annual_degradation_pct=0.5,
        combined_uncertainty_pct=7.5,
        p1_exceedance=50.0,
        p2_exceedance=75.0,
        p3_exceedance=90.0,
        # Sandia/SAPM
        sandia_mounting_type="Open Rack – Ground Mount",
        sandia_wind_speed_m_s=3.0,
        sandia_coeff_a=-3.56,
        sandia_coeff_b=-0.075,
        sandia_irradiance_w_m2=600.0,
        ambient_temp_avg_c=28.0,
        # PAN-derived (zero → energy_calculator back-calculates μ_eff)
        mu_pmpp_pct_per_c=0.0,
        noct_c=0.0,
        # Hourly inputs
        hourly_timestamps=timestamps,
        hourly_ghi_wm2=ghi,
        hourly_temp_c=temp,
    )
    return p


def test_energy_calculator_module_importable():
    """The new module exposes the four touched symbols + the new SAT helper."""
    from pvlayout_core.core.energy_calculator import (
        fetch_solar_irradiance,
        _fetch_pvgis,
        _fetch_pvgis_sat,
        _ensure_gti,
        calculate_energy,
        calculate_pr,
    )
    assert callable(fetch_solar_irradiance)
    assert callable(_fetch_pvgis)
    assert callable(_fetch_pvgis_sat)
    assert callable(_ensure_gti)
    assert callable(calculate_energy)
    assert callable(calculate_pr)


def test_calculate_pr_bit_exact(legacy_energy):
    """Pure loss-stack arithmetic; should match bit-exact."""
    _, legacy_pr, _, LegacyParams = legacy_energy
    from pvlayout_core.core.energy_calculator import calculate_pr as new_pr
    from pvlayout_core.models.project import EnergyParameters as NewParams

    legacy_p = _build_params(LegacyParams, is_sat=False)
    new_p = _build_params(NewParams, is_sat=False)

    legacy_v = legacy_pr(legacy_p)
    new_v = new_pr(new_p)
    assert legacy_v == new_v, f"PR drift: legacy {legacy_v} vs new {new_v}"


def _assert_energy_result_bit_exact(legacy_r, new_r, *, label: str):
    """Compare two EnergyResult instances field-by-field with strict equality."""
    # Scalars
    for name in (
        "performance_ratio",
        "gti_kwh_m2_yr",
        "specific_yield_kwh_kwp_yr",
        "year1_energy_mwh",
        "cuf_pct",
        "lifetime_energy_mwh",
        "p1_year1_mwh", "p2_year1_mwh", "p3_year1_mwh",
        "p1_lifetime_mwh", "p2_lifetime_mwh", "p3_lifetime_mwh",
        "bifacial_gain_pct",
        "pvgis_correction_factor",
    ):
        lv = getattr(legacy_r, name)
        nv = getattr(new_r, name)
        assert lv == nv, f"[{label}] {name} drift: legacy {lv} vs new {nv}"

    # Lists (12-element monthly + 25-element yearly)
    for name in (
        "yearly_energy_mwh",
        "monthly_ghi_kwh_m2", "monthly_gti_kwh_m2",
        "monthly_energy_mwh", "monthly_pr",
        "monthly_amb_temp_c", "monthly_cell_temp_c",
        "monthly_yr", "monthly_yf",
    ):
        lv = list(getattr(legacy_r, name))
        nv = list(getattr(new_r, name))
        assert lv == nv, (
            f"[{label}] {name} drift: legacy {lv} vs new {nv}"
        )


def test_calculate_energy_ft_bit_exact(legacy_energy):
    """Fixed-tilt full-pipeline 25-year yield bit-exact match."""
    legacy_calc, _, _, LegacyParams = legacy_energy
    from pvlayout_core.core.energy_calculator import calculate_energy as new_calc
    from pvlayout_core.models.project import EnergyParameters as NewParams

    legacy_p = _build_params(LegacyParams, is_sat=False)
    new_p = _build_params(NewParams, is_sat=False)

    capacity_kwp = 50_000.0      # 50 MWp
    gti_yr = 1900.0              # kWh/m²/yr — represents the auto-fetched GTI

    legacy_r = legacy_calc(capacity_kwp, gti_yr, legacy_p)
    new_r = new_calc(capacity_kwp, gti_yr, new_p)
    _assert_energy_result_bit_exact(legacy_r, new_r, label="FT")


def test_calculate_energy_sat_bit_exact(legacy_energy):
    """SAT full-pipeline 25-year yield bit-exact match.

    Drives _ensure_gti's SAT branch (calls ghi_to_gti_hsat from row #7).
    """
    legacy_calc, _, _, LegacyParams = legacy_energy
    from pvlayout_core.core.energy_calculator import calculate_energy as new_calc
    from pvlayout_core.models.project import EnergyParameters as NewParams

    legacy_p = _build_params(LegacyParams, is_sat=True)
    new_p = _build_params(NewParams, is_sat=True)

    capacity_kwp = 50_000.0
    gti_yr = 1900.0

    legacy_r = legacy_calc(capacity_kwp, gti_yr, legacy_p)
    new_r = new_calc(capacity_kwp, gti_yr, new_p)
    _assert_energy_result_bit_exact(legacy_r, new_r, label="SAT")


def _build_pvgis_horizontal_response():
    """Fixed PVGIS-shaped JSON for the horizontal endpoint.

    `_fetch_pvgis_sat` calls PVGIS with angle=0 (horizontal panel), so
    H(i)_y / H(i)_m = GHI annual / GHI monthly.
    """
    monthly = [120.0, 130.0, 160.0, 180.0, 200.0, 190.0,
               170.0, 170.0, 160.0, 150.0, 130.0, 110.0]
    return {
        "outputs": {
            "totals": {"fixed": {"H(i)_y": sum(monthly)}},
            "monthly": {"fixed": [{"H(i)_m": v} for v in monthly]},
        }
    }


def test_fetch_pvgis_sat_synthetic_pipeline_bit_exact(legacy_energy):
    """_fetch_pvgis_sat's deterministic core (synthesize → ghi_to_gti_hsat
    → sum → 1.2× factor) bit-exact across legacy/new with mocked HTTP."""
    _, _, legacy_sat_fetch, _ = legacy_energy
    from pvlayout_core.core.energy_calculator import _fetch_pvgis_sat as new_sat_fetch

    payload = _build_pvgis_horizontal_response()

    def _make_resp():
        r = MagicMock()
        r.json.return_value = payload
        r.raise_for_status = lambda: None
        return r

    # Patch BOTH sides' requests.get. Legacy and new each `import requests`
    # inside the function body, so the module-level `requests.get` symbol
    # is shared by both — a single patch covers both calls.
    with patch("requests.get", return_value=_make_resp()):
        legacy_out = legacy_sat_fetch(20.0, 78.0, 55.0)
        new_out = new_sat_fetch(20.0, 78.0, 55.0)

    legacy_ghi, legacy_gti, legacy_src, legacy_m_ghi, legacy_m_gti = legacy_out
    new_ghi, new_gti, new_src, new_m_ghi, new_m_gti = new_out

    assert legacy_src == new_src == "pvgis"
    assert legacy_ghi == new_ghi, f"annual GHI drift: {legacy_ghi} vs {new_ghi}"
    assert legacy_gti == new_gti, f"annual GTI drift: {legacy_gti} vs {new_gti}"
    assert legacy_m_ghi == new_m_ghi, f"monthly GHI drift: {legacy_m_ghi} vs {new_m_ghi}"
    assert legacy_m_gti == new_m_gti, f"monthly GTI drift: {legacy_m_gti} vs {new_m_gti}"
