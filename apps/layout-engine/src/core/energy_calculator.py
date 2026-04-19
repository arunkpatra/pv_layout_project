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
"""
import math
from typing import Tuple

from models.project import EnergyParameters, EnergyResult

# ---------------------------------------------------------------------------
# Irradiance fetching
# ---------------------------------------------------------------------------

def fetch_solar_irradiance(
    lat: float,
    lon: float,
    tilt_deg: float,
    azimuth_deg: float = 0.0,
) -> Tuple[float, float, str]:
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
    (ghi_kwh_m2_yr, gti_kwh_m2_yr, source_name)
    """
    try:
        return _fetch_pvgis(lat, lon, tilt_deg, azimuth_deg)
    except Exception:
        pass
    try:
        return _fetch_nasa_power(lat, lon, tilt_deg)
    except Exception:
        pass
    return 0.0, 0.0, "unavailable"


def _fetch_pvgis(lat, lon, tilt_deg, azimuth_deg) -> Tuple[float, float, str]:
    """
    PVGIS 5.2 PVcalc endpoint.
    With loss=0 and peakpower=1, E_y ≈ specific yield without system losses
    (kWh/kWp/year).  H(i)_y is the actual in-plane irradiation (kWh/m²/yr).
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
    return ghi, gti, "pvgis"


def _fetch_nasa_power(lat, lon, tilt_deg) -> Tuple[float, float, str]:
    """
    NASA POWER climatology endpoint.
    Returns monthly GHI (kWh/m²/day); summed to annual; tilt correction applied.
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
    monthly = resp.json()["properties"]["parameter"]["ALLSKY_SFC_SW_DWN"]

    months   = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN",
                 "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]
    days     = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    ghi_annual = sum(float(monthly[m]) * d for m, d in zip(months, days))

    # Simple isotropic sky-model tilt correction for south-facing panels
    tilt_rad = math.radians(tilt_deg)
    lat_rad  = math.radians(abs(lat))
    # Rb factor approximation for annual average
    rb = math.cos(lat_rad - tilt_rad) / math.cos(lat_rad)
    rb = max(rb, 0.85)   # guard against negative at high latitudes
    diffuse_frac = 0.35  # typical diffuse fraction
    # Hay-Davies simplified:
    # GTI = GHI × [Rb × (1-diffuse_frac) + diffuse_frac × (1+cos(tilt))/2 + ρ×(1-cos(tilt))/2]
    albedo = 0.20
    gti_annual = ghi_annual * (
        rb * (1 - diffuse_frac)
        + diffuse_frac * (1 + math.cos(tilt_rad)) / 2
        + albedo * (1 - math.cos(tilt_rad)) / 2
    )
    return ghi_annual, gti_annual, "nasa_power"


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
    Calculate annual and lifetime energy yield.

    Parameters
    ----------
    capacity_kwp   : installed DC capacity (kWp)
    gti_kwh_m2_yr  : annual in-plane irradiance (kWh/m²/year)
    params         : EnergyParameters (PR breakdown + degradation + lifetime)

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
            # Each subsequent year degrades from year-1 value
            e = year1_mwh * ((1.0 - annual_deg) ** (yr - 1))
        yearly.append(round(e, 4))

    lifetime_mwh = sum(yearly)

    return EnergyResult(
        performance_ratio=pr,
        gti_kwh_m2_yr=gti_kwh_m2_yr,
        specific_yield_kwh_kwp_yr=specific_yield,
        year1_energy_mwh=year1_mwh,
        cuf_pct=cuf_pct,
        lifetime_energy_mwh=lifetime_mwh,
        yearly_energy_mwh=yearly,
    )
