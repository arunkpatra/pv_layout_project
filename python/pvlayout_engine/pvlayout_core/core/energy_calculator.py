"""
Energy yield calculator for PV plants.

Irradiance fetching priority:
  1. PVGIS (EU JRC) — preferred; returns in-plane irradiance (GTI) directly
     for the specified lat/lon/tilt/azimuth.  No API key required.
  2. NASA POWER — fallback; returns monthly GHI climatology; simple isotropic
     tilt correction applied to estimate GTI.
  3. If both fail, returns zeros and source="unavailable".

Energy model:
  Specific yield  = GTI (kWh/m²/yr) × PR
  Year 1 energy   = capacity_kWp × specific_yield  [before LID]
  Year 1 (actual) = Year 1 energy × (1 – first_year_deg%)
  Year n (n≥2)    = Year 1 (actual) × (1 – annual_deg%)^(n–1)
  CUF             = Year 1 (actual) / (capacity_kWp × 8760) × 100 %

Monthly energy — IEC 61724-1 model:
  Y_r (reference yield) = H_i / G_STC  = H_i [kWh/m²] / 1 kW/m²  [h]
  Y_f (final yield)     = E_AC / P_0                               [kWh/kWp]
  PR_m                  = Y_f / Y_r                                (dimensionless)

  Monthly PR varies because module temperature changes with season:
    T_amb_m  = sinusoidal model around annual average (amplitude ∝ |lat|)
    G_m      = monthly GTI (kWh/m²/month) × 1000 / (days × 8 h/day)  [W/m²]
    T_mod_m  = T_amb_m + G_m × exp(a + b × W)   [Sandia/SAPM model]
    temp_loss_m (%/°C) × max(0, T_mod_m − 25) = monthly temperature loss

15-minute time-series export:
  Requires hourly_gti_wm2 and hourly_timestamps in EnergyParameters.
  Linear interpolation hourly → 15-min; energy = kWp × GTI/1000 × PR × LID × 0.25h
"""
import csv
import math
from datetime import datetime, timedelta
from typing import List, Optional, Tuple

import numpy as np

from pvlayout_core.models.project import EnergyParameters, EnergyResult


def _z_score(exceedance_pct: float) -> float:
    """
    Compute the z-score (inverse normal CDF) for a given exceedance probability.

    P_x = P50 × (1 − z_x × σ)

    Exceedance probability: P(annual yield ≥ P_x) = exceedance_pct / 100

    Examples
    --------
    P50  → z = 0.000  (median; P50 = P50 × 1.000)
    P75  → z = 0.674  (P75 = P50 × (1 − 0.674 × σ))
    P90  → z = 1.282  (P90 = P50 × (1 − 1.282 × σ))
    P95  → z = 1.645
    P99  → z = 2.326
    """
    p = max(0.5001, min(99.9999, exceedance_pct)) / 100.0
    if abs(p - 0.5) < 1e-9:
        return 0.0
    # Rational approximation — Abramowitz & Stegun 26.2.23 (max error < 4.5e-4)
    t = math.sqrt(-2.0 * math.log(1.0 - p))
    c = (2.515517, 0.802853, 0.010328)
    d = (1.432788, 0.189269, 0.001308)
    z = t - (c[0] + c[1]*t + c[2]*t*t) / (1.0 + d[0]*t + d[1]*t*t + d[2]*t*t*t)
    return z


def _p_label(exceedance_pct: float) -> str:
    """Return a display label like 'P50', 'P75', 'P90'."""
    return f"P{int(round(exceedance_pct))}"


# ---------------------------------------------------------------------------
# Irradiance fetching
# ---------------------------------------------------------------------------

def fetch_solar_irradiance(
    lat: float,
    lon: float,
    tilt_deg: float,
    azimuth_deg: float = 0.0,
) -> Tuple[float, float, str, List[float], List[float]]:
    """
    Attempt to fetch annual GHI and GTI from PVGIS, then NASA POWER.

    Parameters
    ----------
    lat, lon      : site coordinates (WGS84 decimal degrees)
    tilt_deg      : panel tilt angle in degrees
    azimuth_deg   : panel azimuth in PVGIS convention (0=South, 90=West,
                    -90=East, 180=North).  Pass 0 for north-hemisphere sites.

    Returns
    -------
    (ghi_kwh_m2_yr, gti_kwh_m2_yr, source_name, monthly_ghi_12, monthly_gti_12)
    monthly_ghi_12 / monthly_gti_12 are lists of 12 floats (kWh/m²/month).
    Both monthly lists are empty on failure.
    """
    try:
        return _fetch_pvgis(lat, lon, tilt_deg, azimuth_deg)
    except Exception:
        pass
    try:
        return _fetch_nasa_power(lat, lon, tilt_deg)
    except Exception:
        pass
    return 0.0, 0.0, "unavailable", [], []


def _fetch_pvgis(lat, lon, tilt_deg, azimuth_deg
                 ) -> Tuple[float, float, str, List[float], List[float]]:
    """
    PVGIS 5.2 PVcalc endpoint.
    With loss=0 and peakpower=1, E_y ≈ specific yield without system losses
    (kWh/kWp/year).  H(i)_y is the actual in-plane irradiation (kWh/m²/yr).
    Also captures monthly H(i)_m and H(h)_m.
    """
    import requests
    url = (
        "https://re.jrc.ec.europa.eu/api/v5_2/PVcalc"
        f"?lat={lat:.4f}&lon={lon:.4f}"
        "&peakpower=1&loss=0"
        f"&angle={tilt_deg:.1f}&aspect={azimuth_deg:.1f}"
        "&outputformat=json&browser=0"
    )
    resp = requests.get(url, timeout=20)
    resp.raise_for_status()
    data = resp.json()
    totals = data["outputs"]["totals"]["fixed"]
    gti = float(totals["H(i)_y"])   # in-plane irradiation kWh/m²/yr
    ghi = float(totals["H(h)_y"])   # horizontal irradiation kWh/m²/yr

    # Monthly data: list of 12 dicts with keys "month", "H(i)_m", "H(h)_m"
    monthly_data = data["outputs"]["monthly"]["fixed"]
    monthly_gti = [float(m["H(i)_m"]) for m in monthly_data]
    monthly_ghi = [float(m["H(h)_m"]) for m in monthly_data]

    return ghi, gti, "pvgis", monthly_ghi, monthly_gti


def _fetch_nasa_power(lat, lon, tilt_deg
                      ) -> Tuple[float, float, str, List[float], List[float]]:
    """
    NASA POWER climatology endpoint.
    Returns monthly GHI (kWh/m²/day); summed to annual; tilt correction applied.
    Monthly GHI and GTI are both returned as 12-element lists.
    """
    import requests
    url = (
        "https://power.larc.nasa.gov/api/temporal/climatology/point"
        "?parameters=ALLSKY_SFC_SW_DWN"
        f"&community=RE&longitude={lon:.4f}&latitude={lat:.4f}"
        "&format=JSON"
    )
    resp = requests.get(url, timeout=25)
    resp.raise_for_status()
    monthly_raw = resp.json()["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]

    months   = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN",
                 "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
    days     = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

    # Monthly GHI in kWh/m²/month
    monthly_ghi = [float(monthly_raw[m]) * d for m, d in zip(months, days)]
    ghi_annual  = sum(monthly_ghi)

    # Simple isotropic sky-model tilt correction (Hay-Davies simplified)
    tilt_rad = math.radians(tilt_deg)
    lat_rad  = math.radians(abs(lat))
    rb = math.cos(lat_rad - tilt_rad) / math.cos(lat_rad)
    rb = max(rb, 0.85)
    diffuse_frac = 0.35
    albedo = 0.20
    tilt_factor = (
        rb * (1 - diffuse_frac)
        + diffuse_frac * (1 + math.cos(tilt_rad)) / 2
        + albedo * (1 - math.cos(tilt_rad)) / 2
    )
    monthly_gti = [g * tilt_factor for g in monthly_ghi]
    gti_annual  = sum(monthly_gti)

    return ghi_annual, gti_annual, "nasa_power", monthly_ghi, monthly_gti


# ---------------------------------------------------------------------------
# Sandia / SAPM mounting-type coefficients
# ---------------------------------------------------------------------------

#: Empirical (a, b) coefficients for the Sandia exponential thermal model.
#: Source: King et al. (2004), Sandia Report SAND2004-3535.
#:   T_module = T_ambient + G × exp(a + b × W)
#: where G is irradiance (W/m²) and W is wind speed (m/s).
SANDIA_MOUNT_COEFFS: dict[str, tuple[float, float]] = {
    "Open Rack – Ground Mount":  (-3.56, -0.075),
    "Roof Mount – Close":        (-2.81, -0.0455),
    "Stand-off Mount":           (-3.23, -0.130),
    "Insulated Back":            (-2.81, -0.0455),
}

# Default mounting type key
SANDIA_DEFAULT_MOUNT = "Open Rack – Ground Mount"


# ---------------------------------------------------------------------------
# Temperature loss from PAN file parameters
# ---------------------------------------------------------------------------

def calculate_temperature_loss(
    mu_pmpp_pct: float,
    noct_c: float,
    ambient_temp_c: float,
    irradiance_w_m2: float = 600.0,
) -> tuple:
    """
    Calculate the annual average module temperature loss from PAN parameters.

    Model (NOCT method — IEC 61215 / industry standard)
    -----
    Annual average cell temperature:
        T_cell = T_ambient + (NOCT − 20) / 800 × G

    where
        G    = average operating irradiance (W/m²) — derived from site GTI
               Default 600 W/m² when no GTI data is available.
        NOCT = Nominal Operating Cell Temperature from the PAN file (°C)
               (defined at G = 800 W/m², T_amb = 20 °C, wind = 1 m/s)

    Temperature loss:
        Loss (%) = |mu_Pmpp| × max(0, T_cell − 25)

    Example — India (T_amb = 28 °C, NOCT = 45 °C, G = 616 W/m²):
        T_cell = 28 + (45 − 20) / 800 × 616 = 47.25 °C
        Loss   = 0.35 × (47.25 − 25) = 7.79 %   ← typical site value

    Parameters
    ----------
    mu_pmpp_pct    : power temp. coefficient (%/°C) from PAN — may be negative
    noct_c         : NOCT from PAN (°C)
    ambient_temp_c : average annual ambient temperature at the site (°C)
    irradiance_w_m2: average operating irradiance in W/m² (default 600)
                     Derived from: GTI_kWh_m2_yr × 1000 / (365 × 8 h/day)

    Returns
    -------
    (loss_pct, t_cell_avg_c)  — temperature loss in % and average cell temp in °C
    """
    irradiance_factor = irradiance_w_m2 / 800.0
    t_cell = ambient_temp_c + (noct_c - 20.0) * irradiance_factor
    loss_pct = abs(mu_pmpp_pct) * max(0.0, t_cell - 25.0)
    return round(loss_pct, 4), round(t_cell, 2)


def calculate_temperature_loss_sandia(
    mu_pmpp_pct: float,
    ambient_temp_c: float,
    irradiance_w_m2: float,
    wind_speed_m_s: float,
    coeff_a: float = -3.56,
    coeff_b: float = -0.075,
) -> tuple:
    """
    Calculate module temperature loss using the Sandia / SAPM thermal model.

    Model (King et al., Sandia SAND2004-3535)
    ------------------------------------------
        T_module = T_ambient + G × exp(a + b × W)

    where
        G    = irradiance (W/m²) — average operating irradiance derived from GTI
        W    = wind speed (m/s) — annual average at hub height
        a, b = empirical mounting coefficients (see SANDIA_MOUNT_COEFFS)

    Advantage over NOCT model
    -------------------------
    The exponential term G × exp(a + b×W) accounts for wind cooling:
      • Higher wind (W ↑) → lower T_module → lower loss
      • Open-rack ground mounts (a=-3.56, b=-0.075) cool better than
        roof mounts (a=-2.81, b=-0.0455) because rear airflow is unrestricted

    Temperature loss:
        Loss (%) = |mu_Pmpp| × max(0, T_module − 25)

    Example (open rack, G=616 W/m², W=3 m/s, T_amb=28°C, NOCT=45°C, μ=-0.35):
        T_module = 28 + 616 × exp(-3.56 + (-0.075 × 3)) = 28 + 14.01 = 42.01 °C
        Loss     = 0.35 × (42.01 − 25) = 5.95 %

    Parameters
    ----------
    mu_pmpp_pct    : power temp. coefficient (%/°C) from PAN — may be negative
    ambient_temp_c : average annual ambient temperature (°C)
    irradiance_w_m2: average operating irradiance (W/m²), derived from GTI
    wind_speed_m_s : average annual wind speed at site (m/s)
    coeff_a        : Sandia 'a' coefficient (depends on mounting type)
    coeff_b        : Sandia 'b' coefficient (depends on mounting type)

    Returns
    -------
    (loss_pct, t_module_avg_c)  — temperature loss in % and average module temp in °C
    """
    t_module = ambient_temp_c + irradiance_w_m2 * math.exp(coeff_a + coeff_b * wind_speed_m_s)
    loss_pct = abs(mu_pmpp_pct) * max(0.0, t_module - 25.0)
    return round(loss_pct, 4), round(t_module, 2)


# ---------------------------------------------------------------------------
# Bifacial gain model
# ---------------------------------------------------------------------------

def _bifacial_gain(
    bifaciality: float,
    albedo: float,
    gcr: float,
    tilt_deg: float,
) -> float:
    """
    Estimate the fractional bifacial energy gain using a simplified view-factor
    model (NREL / IEC 60904-1-2 approach).

    Physics
    -------
    The rear surface of a tilted panel receives ground-reflected irradiance:

      GTI_rear ≈ GHI × ρ × F_ground_rear × (1 − GCR)

    where
      ρ             = ground albedo
      F_ground_rear = (1 + cos(tilt)) / 2   — view factor rear face → ground
      (1 − GCR)     — fraction of ground not self-shaded by the row in front

    Bifacial gain   = φ × GTI_rear / GTI_front
    GTI_front / GHI ≈ 1 + 0.4 × sin(tilt)   — approximate tilt factor

    Typical results
    ---------------
    φ=0.70, ρ=0.25, GCR=0.35, tilt=20° → ~9–10 % gain
    φ=0.70, ρ=0.20, GCR=0.40, tilt=20° → ~7–8  % gain

    Return value is a fraction (e.g. 0.09 = 9 %), capped at 0.20 (20 %).
    """
    tilt_rad      = math.radians(max(0.0, min(90.0, tilt_deg)))
    f_ground_rear = (1.0 + math.cos(tilt_rad)) / 2.0      # rear→ground view factor
    tilt_factor   = 1.0 + 0.4 * math.sin(tilt_rad)        # GTI_front / GHI approx
    rear_fraction = albedo * f_ground_rear * (1.0 - gcr) / tilt_factor
    gain = bifaciality * rear_fraction
    return min(round(gain, 4), 0.20)


# ---------------------------------------------------------------------------
# Energy calculation
# ---------------------------------------------------------------------------

def calculate_pr(params: EnergyParameters) -> float:
    """Compute the overall Performance Ratio from component losses."""
    pr = (
        (params.inverter_efficiency_pct / 100.0)
        * (1.0 - params.dc_cable_loss_pct      / 100.0)
        * (1.0 - params.ac_cable_loss_pct      / 100.0)
        * (1.0 - params.soiling_loss_pct        / 100.0)
        * (1.0 - params.temperature_loss_pct    / 100.0)
        * (1.0 - params.mismatch_loss_pct       / 100.0)
        * (1.0 - params.shading_loss_pct        / 100.0)
        * (params.availability_pct              / 100.0)
        * (1.0 - params.transformer_loss_pct    / 100.0)
        * (1.0 - params.other_loss_pct          / 100.0)
    )
    return pr


def calculate_energy(
    capacity_kwp: float,
    gti_kwh_m2_yr: float,
    params: EnergyParameters,
) -> EnergyResult:
    """
    Calculate annual, lifetime, probabilistic and monthly energy yield.

    Parameters
    ----------
    capacity_kwp   : installed DC capacity (kWp)
    gti_kwh_m2_yr  : annual in-plane irradiance (kWh/m²/year)
    params         : EnergyParameters (PR breakdown + degradation + lifetime
                     + optional monthly_gti_kwh_m2 for monthly breakdown)

    Returns
    -------
    EnergyResult
    """
    if capacity_kwp <= 0 or gti_kwh_m2_yr <= 0:
        return EnergyResult()

    pr = calculate_pr(params)

    # Specific yield (ideal, no degradation)
    specific_yield = gti_kwh_m2_yr * pr   # kWh/kWp/year

    # Year 1 energy before LID
    year1_pre_lid_kwh = capacity_kwp * specific_yield

    # Apply first-year LID degradation
    lid_factor  = 1.0 - params.first_year_degradation_pct / 100.0
    year1_kwh   = year1_pre_lid_kwh * lid_factor

    # ---- Bifacial gain -------------------------------------------------------
    bifacial_boost = 0.0
    if params.is_bifacial and params.bifaciality_factor > 0:
        gcr = max(0.01, min(0.99, params.site_gcr if params.site_gcr > 0 else 0.35))
        bifacial_boost = _bifacial_gain(
            params.bifaciality_factor,
            params.ground_albedo,
            gcr,
            params.site_tilt_deg,
        )
        year1_kwh *= (1.0 + bifacial_boost)

    # ---- PVGIS API correction factor -----------------------------------------
    # PVGIS API irradiance is derived from satellite/reanalysis data and can
    # slightly underestimate in-plane irradiance compared to on-site measurements.
    # A factor of 1.05 is applied to the energy yield when the weather source
    # is the PVGIS API to account for this conservative bias.
    # No correction is applied when the user supplies an actual measured hourly file.
    pvgis_factor = 1.05 if params.weather_source == "pvgis_api" else 1.0
    year1_kwh *= pvgis_factor

    year1_mwh   = year1_kwh / 1000.0

    # CUF (based on year 1 actual output)
    cuf_pct = (year1_kwh / (capacity_kwp * 8760.0)) * 100.0

    # 25-year (or lifetime) model
    annual_deg  = params.annual_degradation_pct / 100.0
    yearly: list = []
    for yr in range(1, params.plant_lifetime_years + 1):
        if yr == 1:
            e = year1_mwh
        else:
            e = year1_mwh * ((1.0 - annual_deg) ** (yr - 1))
        yearly.append(round(e, 4))

    lifetime_mwh = sum(yearly)

    # ---- Probabilistic yields (P50 / P75 / P90) -------------------------
    sigma = params.combined_uncertainty_pct / 100.0

    def _pval_year1(exceedance_pct):
        z = _z_score(exceedance_pct)
        return round(year1_mwh * max(0.0, 1.0 - z * sigma), 2)

    def _pval_lifetime(exceedance_pct):
        z = _z_score(exceedance_pct)
        return round(lifetime_mwh * max(0.0, 1.0 - z * sigma), 2)

    # ---- Monthly breakdown (Year 1) --------------------------------------
    # If only GHI hourly data is available (no monthly_gti yet), compute
    # GTI from GHI via solar transposition and derive monthly totals.
    monthly_params_gti = list(params.monthly_gti_kwh_m2)
    monthly_params_ghi = list(params.monthly_ghi_kwh_m2)

    if len(monthly_params_gti) != 12 and params.hourly_ghi_wm2:
        gti_hourly = _ensure_gti(params)
        if gti_hourly:
            # Aggregate hourly GTI → monthly kWh/m²
            from core.pvgis_file_parser import _monthly_sum as _ms
            monthly_params_gti = _ms(params.hourly_timestamps, gti_hourly)
            if params.hourly_ghi_wm2:
                monthly_params_ghi = _ms(params.hourly_timestamps,
                                         params.hourly_ghi_wm2)

    monthly_ghi:      List[float] = []
    monthly_gti:      List[float] = []
    monthly_energy:   List[float] = []
    monthly_pr_pct:   List[float] = []
    monthly_amb_temp: List[float] = []
    monthly_cell_tmp: List[float] = []
    monthly_yr_list:  List[float] = []
    monthly_yf_list:  List[float] = []

    # Days per month (non-leap year) — used to convert monthly GTI to avg W/m²
    _DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

    if len(monthly_params_gti) == 12:
        # ---- IEC 61724-1 monthly PR with Sandia/SAPM temperature model ----
        #
        # Step 1: derive effective temperature coefficient μ_eff (%/°C)
        #   If PAN data present: use params.mu_pmpp_pct_per_c directly.
        #   Otherwise: back-calculate from annual temperature_loss_pct using
        #              the Sandia model with the annual-average irradiance G.
        mu_eff = abs(params.mu_pmpp_pct_per_c)

        # Sandia model parameters from EnergyParameters
        _sa  = params.sandia_coeff_a        # e.g. -3.56 (open rack)
        _sb  = params.sandia_coeff_b        # e.g. -0.075
        _sw  = params.sandia_wind_speed_m_s # annual avg wind speed (m/s)
        _g0  = params.sandia_irradiance_w_m2  # annual avg operating irradiance (W/m²)

        if mu_eff == 0.0:
            # Back-calculate μ_eff from the Sandia-model annual temperature
            t_mod_ann = (params.ambient_temp_avg_c
                         + _g0 * math.exp(_sa + _sb * _sw))
            t_excess  = max(0.01, t_mod_ann - 25.0)
            mu_eff    = params.temperature_loss_pct / t_excess   # %/°C

        # Step 2: monthly ambient temperatures
        #   Priority 1 — actual hourly temperature data from the loaded CSV file
        #   Priority 2 — sinusoidal seasonal model (fallback)
        if (len(params.hourly_temp_c) >= 365
                and len(params.hourly_timestamps) == len(params.hourly_temp_c)):
            from core.pvgis_file_parser import _monthly_avg as _mavg
            t_amb_monthly = _mavg(params.hourly_timestamps, params.hourly_temp_c)
        else:
            t_amb_monthly = _seasonal_temperatures(
                params.ambient_temp_avg_c, params.site_lat
            )

        # Step 3: PR base (all losses except temperature — applied per month)
        pr_base = _pr_without_temp(params)

        # Step 4: per-month IEC 61724 quantities using Sandia thermal model
        for m, gti_m in enumerate(monthly_params_gti):
            t_amb_m = t_amb_monthly[m]

            # Derive monthly average operating irradiance G_m from monthly GTI.
            # GTI_m (kWh/m²/month) → W/m² assuming 8 daylight hours/day.
            g_m = min(900.0,
                      gti_m * 1000.0 / (_DAYS_PER_MONTH[m] * 8.0))

            # Sandia/SAPM module temperature for this month
            t_mod_m = t_amb_m + g_m * math.exp(_sa + _sb * _sw)

            temp_loss_m = mu_eff * max(0.0, t_mod_m - 25.0) / 100.0   # fraction
            pr_m        = pr_base * (1.0 - temp_loss_m)

            # IEC 61724-1 yields
            # Y_r = H_i / G_STC  (G_STC = 1 kW/m²)  → Y_r [h] = H_i [kWh/m²]
            yr_m = gti_m                              # peak sun hours [h]
            # Y_f = E_AC / P_0  [kWh/kWp]
            # Apply bifacial boost + PVGIS correction to monthly energy
            e_kwh_m = (capacity_kwp * gti_m * pr_m
                       * lid_factor * (1.0 + bifacial_boost) * pvgis_factor)
            yf_m    = e_kwh_m / max(1.0, capacity_kwp)   # [kWh/kWp]
            e_mwh_m = e_kwh_m / 1000.0

            monthly_energy.append(round(e_mwh_m, 4))
            monthly_pr_pct.append(round(pr_m * 100.0, 3))
            monthly_amb_temp.append(t_amb_m)
            monthly_cell_tmp.append(round(t_mod_m, 2))   # now Sandia T_module
            monthly_yr_list.append(round(yr_m, 2))
            monthly_yf_list.append(round(yf_m, 2))

        monthly_gti = list(monthly_params_gti)
        monthly_ghi = (list(monthly_params_ghi)
                       if len(monthly_params_ghi) == 12 else [0.0] * 12)

    return EnergyResult(
        performance_ratio=pr,
        gti_kwh_m2_yr=gti_kwh_m2_yr,
        specific_yield_kwh_kwp_yr=specific_yield,
        bifacial_gain_pct=round(bifacial_boost * 100, 2),
        pvgis_correction_factor=pvgis_factor,
        year1_energy_mwh=year1_mwh,
        cuf_pct=cuf_pct,
        lifetime_energy_mwh=lifetime_mwh,
        yearly_energy_mwh=yearly,
        # P-value labels
        p1_label=_p_label(params.p1_exceedance),
        p2_label=_p_label(params.p2_exceedance),
        p3_label=_p_label(params.p3_exceedance),
        # Year 1 P-values
        p1_year1_mwh=_pval_year1(params.p1_exceedance),
        p2_year1_mwh=_pval_year1(params.p2_exceedance),
        p3_year1_mwh=_pval_year1(params.p3_exceedance),
        # Lifetime P-values
        p1_lifetime_mwh=_pval_lifetime(params.p1_exceedance),
        p2_lifetime_mwh=_pval_lifetime(params.p2_exceedance),
        p3_lifetime_mwh=_pval_lifetime(params.p3_exceedance),
        # Monthly breakdown (IEC 61724-1)
        monthly_ghi_kwh_m2=monthly_ghi,
        monthly_gti_kwh_m2=monthly_gti,
        monthly_energy_mwh=monthly_energy,
        monthly_pr=monthly_pr_pct,
        monthly_amb_temp_c=monthly_amb_temp,
        monthly_cell_temp_c=monthly_cell_tmp,
        monthly_yr=monthly_yr_list,
        monthly_yf=monthly_yf_list,
    )


# ---------------------------------------------------------------------------
# 15-minute time-series CSV export
# ---------------------------------------------------------------------------

MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
               "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]


# ---------------------------------------------------------------------------
# IEC 61724-1 helpers
# ---------------------------------------------------------------------------

def _seasonal_temperatures(annual_avg_c: float, lat_deg: float) -> List[float]:
    """
    Estimate monthly average ambient temperatures using a sinusoidal model.

    T_m = T_annual + A × cos(2π(m − phase) / 12)

    phase = 6  for Northern Hemisphere (hottest month: July, m=6, 0-indexed)
    phase = 0  for Southern Hemisphere (hottest month: January, m=0)
    A     = max(3.0, |lat| × 0.45)  [°C] — seasonal swing amplitude
    """
    amplitude = max(3.0, abs(lat_deg) * 0.45)
    phase = 6 if lat_deg >= 0.0 else 0
    return [
        round(annual_avg_c + amplitude * math.cos(2 * math.pi * (m - phase) / 12), 2)
        for m in range(12)
    ]


def _pr_without_temp(params: 'EnergyParameters') -> float:
    """
    PR calculated from all loss components EXCEPT the temperature loss.
    Used for monthly IEC 61724 PR where temperature is applied per-month.
    """
    return (
        (params.inverter_efficiency_pct  / 100.0)
        * (1.0 - params.dc_cable_loss_pct      / 100.0)
        * (1.0 - params.ac_cable_loss_pct      / 100.0)
        * (1.0 - params.soiling_loss_pct        / 100.0)
        # temperature_loss_pct excluded — applied per-month separately
        * (1.0 - params.mismatch_loss_pct       / 100.0)
        * (1.0 - params.shading_loss_pct        / 100.0)
        * (params.availability_pct              / 100.0)
        * (1.0 - params.transformer_loss_pct    / 100.0)
        * (1.0 - params.other_loss_pct          / 100.0)
    )


def _ensure_gti(params: EnergyParameters) -> List[float]:
    """
    Return the hourly GTI array from params.
    If params.hourly_gti_wm2 is empty but params.hourly_ghi_wm2 is present,
    compute GTI via solar transposition (Erbs + Hay-Davies).
    """
    if params.hourly_gti_wm2:
        return params.hourly_gti_wm2

    if not params.hourly_ghi_wm2:
        return []

    from core.solar_transposition import ghi_to_gti
    gti_arr = ghi_to_gti(
        params.hourly_ghi_wm2,
        params.hourly_timestamps,
        lat_deg=params.site_lat,
        tilt_deg=params.site_tilt_deg,
        azimuth_pvgis=params.site_azimuth_pvgis,
    )
    return gti_arr.tolist()


def export_15min_csv(
    output_path: str,
    capacity_kwp: float,
    params: EnergyParameters,
) -> int:
    """
    Interpolate the hourly irradiance data stored in *params* to 15-minute
    intervals and write a CSV file.

    Requires params.hourly_gti_wm2 and params.hourly_timestamps to be
    populated (done when user loads a PVGIS hourly file).

    Each 15-min energy:
        E_15min (kWh) = capacity_kWp × GTI (W/m²) / 1000 × PR × LID × 0.25 h

    Parameters
    ----------
    output_path  : full path for the output CSV
    capacity_kwp : combined DC capacity of the plant(s)
    params       : EnergyParameters with hourly_gti_wm2 / hourly_ghi_wm2 filled

    Returns
    -------
    Number of rows written (35040 for a standard 8760-hour year).
    """
    # Resolve GTI — compute from GHI via solar transposition if necessary
    gti_hourly = _ensure_gti(params)
    if not gti_hourly:
        raise ValueError(
            "No hourly irradiance data available.\n"
            "Please load an hourly GHI file (CSV with Time + GHI columns) first.\n\n"
            "Then click 'Calculate Energy' so the tilt correction can run."
        )

    pr  = calculate_pr(params)
    lid = 1.0 - params.first_year_degradation_pct / 100.0

    n_hours = len(gti_hourly)
    x_h    = np.arange(n_hours, dtype=float)
    x_15   = np.arange(0, n_hours, 0.25)          # 4× as many points

    gti_arr = np.maximum(0.0, np.interp(x_15, x_h,
                                         np.array(gti_hourly, dtype=float)))
    ghi_arr = (np.maximum(0.0, np.interp(x_15, x_h,
                                          np.array(params.hourly_ghi_wm2, dtype=float)))
               if params.hourly_ghi_wm2
               else gti_arr.copy())

    energy_arr = capacity_kwp * gti_arr / 1000.0 * pr * lid * 0.25   # kWh per 15 min

    n_15 = len(gti_arr)

    with open(output_path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow([
            "DateTime (UTC)",
            "GHI (W/m²)",
            "GTI (W/m²)",
            f"Energy (kWh)  [plant {capacity_kwp:.1f} kWp]",
        ])

        for i in range(n_15):
            hour_idx  = int(i // 4)
            q_idx     = int(i % 4)

            # Compute timestamp
            if hour_idx < len(params.hourly_timestamps):
                ts_base = params.hourly_timestamps[hour_idx]
                try:
                    dt_base = datetime.strptime(ts_base, "%Y-%m-%d %H:%M")
                    ts_out  = (dt_base + timedelta(minutes=q_idx * 15)
                               ).strftime("%Y-%m-%d %H:%M")
                except ValueError:
                    ts_out = f"{ts_base}+{q_idx*15:02d}m"
            else:
                ts_out = f"H{hour_idx:04d}+{q_idx*15:02d}m"

            writer.writerow([
                ts_out,
                f"{ghi_arr[i]:.2f}",
                f"{gti_arr[i]:.2f}",
                f"{max(0.0, energy_arr[i]):.4f}",
            ])

    return n_15
