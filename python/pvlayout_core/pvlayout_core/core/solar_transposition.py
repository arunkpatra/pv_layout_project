"""
Solar transposition: convert hourly GHI → hourly GTI.

Method
------
1. Solar position — declination δ, hour angle ω, zenith angle θz.
2. Erbs decomposition (1982) — split GHI into beam Gb and diffuse Gd
   using the clearness index kt = GHI / (I₀ × cos θz).
3. Hay-Davies isotropic tilt model —
       GTI = Gb×Rb + Gd×(1+cos β)/2 + ρ×GHI×(1-cos β)/2
   where Rb = cos θi / cos θz  (geometric factor for tilted beam),
   β = tilt angle, ρ = ground albedo (default 0.20).

Assumptions
-----------
* Panels face the equator (south in NH, north in SH) — the most common
  fixed-tilt orientation.  Azimuth offsets shift the diurnal distribution
  but have minor effect on annual totals; they are applied via a simple
  surface-azimuth correction to the incidence angle formula.
* Timestamps are treated as local solar time (i.e. UTC ≈ local solar time
  at the site's longitude — the ±15–30 min error is acceptable for hourly
  data).

References
----------
Duffie & Beckman, "Solar Engineering of Thermal Processes", 4th ed.
Erbs, D.G. et al. (1982). Estimation of the diffuse radiation fraction
    for hourly, daily and monthly-average global radiation. Solar Energy 28(4).
"""
import math
from datetime import datetime
from typing import List, Optional

import numpy as np


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def ghi_to_gti(
    ghi_wm2: List[float],
    timestamps: List[str],
    lat_deg: float,
    tilt_deg: float,
    azimuth_pvgis: float = 0.0,
    albedo: float = 0.20,
) -> np.ndarray:
    """
    Convert an hourly GHI array to an hourly GTI array.

    Parameters
    ----------
    ghi_wm2        : hourly GHI values (W/m²) — list or array, length N
    timestamps     : ISO-format strings "YYYY-MM-DD HH:MM", length N
    lat_deg        : site latitude in decimal degrees (+ = North)
    tilt_deg       : panel tilt from horizontal (degrees, 0–90)
    azimuth_pvgis  : panel azimuth in PVGIS convention
                     (0 = South / equator-facing, 90 = West, -90 = East)
    albedo         : ground reflectance (default 0.20)

    Returns
    -------
    gti : numpy array of GTI values (W/m²), same length as ghi_wm2,
          all values ≥ 0.
    """
    ghi_arr = np.asarray(ghi_wm2, dtype=float)
    n       = len(ghi_arr)
    gti     = np.zeros(n, dtype=float)

    lat  = math.radians(lat_deg)
    beta = math.radians(tilt_deg)
    # Surface azimuth γ: PVGIS 0=South → γ=0° in D&B (south-facing NH convention)
    # PVGIS +90=West → γ=+90°;  negative values = East
    gamma_s = math.radians(azimuth_pvgis)   # surface azimuth, 0=South, + = West

    cos_beta      = math.cos(beta)
    gd_sky_factor = (1.0 + cos_beta) / 2.0       # isotropic diffuse view factor
    gr_factor     = albedo * (1.0 - cos_beta) / 2.0  # ground-reflected factor

    for i in range(n):
        ghi = ghi_arr[i]
        if ghi <= 0.0:
            continue

        ts = timestamps[i]
        try:
            dt = datetime.strptime(ts[:16], "%Y-%m-%d %H:%M")
        except ValueError:
            continue

        doy  = dt.timetuple().tm_yday
        hour = dt.hour + dt.minute / 60.0 + 0.5   # midpoint of hour

        # --- Solar declination (radians) ---
        delta = math.radians(23.45 * math.sin(math.radians(360.0 * (284 + doy) / 365.0)))

        # --- Hour angle (solar noon = 0) ---
        omega = math.radians(15.0 * (hour - 12.0))

        # --- Solar zenith angle ---
        cos_theta_z = (math.sin(lat) * math.sin(delta)
                       + math.cos(lat) * math.cos(delta) * math.cos(omega))
        if cos_theta_z <= 0.01:
            continue   # sun below or at horizon

        # --- Angle of incidence on tilted surface ---
        # General formula (D&B 1.6.2) for any surface azimuth γ_s:
        # cos θi = sin δ (sin φ cos β − cos φ sin β cos γ_s)
        #        + cos δ cos ω (cos φ cos β + sin φ sin β cos γ_s)
        #        + cos δ sin β sin γ_s sin ω
        sin_lat = math.sin(lat);  cos_lat = math.cos(lat)
        sin_del = math.sin(delta); cos_del = math.cos(delta)
        cos_gam = math.cos(gamma_s); sin_gam = math.sin(gamma_s)

        cos_theta_i = (
            sin_del * (sin_lat * cos_beta - cos_lat * math.sin(beta) * cos_gam)
            + cos_del * math.cos(omega) * (cos_lat * cos_beta + sin_lat * math.sin(beta) * cos_gam)
            + cos_del * math.sin(beta) * sin_gam * math.sin(omega)
        )
        # For SH (lat < 0), equator-facing means north-facing: flip lat sign effectively
        # handled naturally by the formula above when lat_deg < 0 and gamma_s = π (north)

        cos_theta_i = max(0.0, cos_theta_i)

        # --- Geometric factor Rb ---
        Rb = min(cos_theta_i / cos_theta_z, 5.0)

        # --- Extraterrestrial radiation ---
        I0 = 1367.0 * (1.0 + 0.033 * math.cos(math.radians(360.0 * doy / 365.0)))

        # --- Clearness index kt ---
        kt = min(ghi / max(1.0, I0 * cos_theta_z), 1.0)

        # --- Erbs decomposition: diffuse fraction fd ---
        if kt <= 0.22:
            fd = 1.0 - 0.09 * kt
        elif kt <= 0.80:
            fd = (0.9511 - 0.1604 * kt + 4.388 * kt**2
                  - 16.638 * kt**3 + 12.336 * kt**4)
        else:
            fd = 0.165

        Gd = ghi * fd
        Gb = max(0.0, ghi - Gd)

        # --- Isotropic tilt (Hay-Davies simplified) ---
        gti[i] = max(0.0,
                     Gb * Rb
                     + Gd * gd_sky_factor
                     + ghi * gr_factor)

    return gti


def annual_gti_from_ghi(
    ghi_wm2: List[float],
    timestamps: List[str],
    lat_deg: float,
    tilt_deg: float,
    azimuth_pvgis: float = 0.0,
    albedo: float = 0.20,
) -> float:
    """Return total annual GTI in kWh/m² from hourly GHI values."""
    gti = ghi_to_gti(ghi_wm2, timestamps, lat_deg, tilt_deg, azimuth_pvgis, albedo)
    return float(gti.sum()) / 1000.0   # W/m² × 1h each → Wh/m² → /1000 = kWh/m²


# ---------------------------------------------------------------------------
# HSAT (Horizontal Single-Axis Tracker, N-S axis) transposition
# ---------------------------------------------------------------------------

def ghi_to_gti_hsat(
    ghi_wm2: List[float],
    timestamps: List[str],
    lat_deg: float,
    max_angle_deg: float = 55.0,
    albedo: float = 0.20,
) -> np.ndarray:
    """
    Convert hourly GHI to hourly GTI for a Horizontal Single-Axis Tracker
    (HSAT) with a North–South rotation axis.

    Physics
    -------
    At each hour the tracker rotates to the ideal angle that minimises the
    Angle of Incidence (AOI) on the panel surface:

        θ_T* = arctan2(cos δ · sin ω,  cos θ_z)          … (1)

    where δ = solar declination, ω = hour angle, θ_z = solar zenith.

    The rotation is clamped to ± max_angle_deg (hardware limit):

        θ_T = clip(θ_T*, −max_angle, +max_angle)

    Convention: θ_T > 0 → panel faces West (afternoon);
                θ_T < 0 → panel faces East (morning).

    The cosine of the AOI on the tracker surface at angle θ_T is:

        cos(AOI) = cos(θ_T) · cos(θ_z) + cos(δ) · sin(θ_T) · sin(ω)  … (2)

    (Derived from the panel-normal dot-product in the East–North–Up frame.)
    At the ideal angle this simplifies to the well-known result:
        cos(AOI_ideal) = √(cos²θ_z + cos²δ · sin²ω)

    GTI is then computed using the Erbs decomposition (GHI → beam/diffuse)
    and the Hay-Davies isotropic tilt model with instantaneous tilt β = |θ_T|:

        GTI = Gb · Rb + Gd · (1 + cos β) / 2 + ρ · GHI · (1 − cos β) / 2

    References
    ----------
    Duffie & Beckman, "Solar Engineering of Thermal Processes", 4th ed.
    Braun & Mitchell (1983), "Solar geometry for fixed and tracking surfaces".

    Parameters
    ----------
    ghi_wm2       : hourly GHI values (W/m²)
    timestamps    : ISO-format strings "YYYY-MM-DD HH:MM"
    lat_deg       : site latitude in decimal degrees (+ = North)
    max_angle_deg : tracker rotation limit in degrees (default 55°)
    albedo        : ground reflectance (default 0.20)

    Returns
    -------
    gti : numpy array of tracked-plane GTI values (W/m²), same length as input
    """
    ghi_arr      = np.asarray(ghi_wm2, dtype=float)
    n            = len(ghi_arr)
    gti          = np.zeros(n, dtype=float)

    lat           = math.radians(lat_deg)
    max_angle_rad = math.radians(max_angle_deg)

    for i in range(n):
        ghi = ghi_arr[i]
        if ghi <= 0.0:
            continue

        try:
            dt = datetime.strptime(timestamps[i][:16], "%Y-%m-%d %H:%M")
        except ValueError:
            continue

        doy  = dt.timetuple().tm_yday
        hour = dt.hour + dt.minute / 60.0 + 0.5   # midpoint of hour

        # --- Solar position ---
        delta = math.radians(23.45 * math.sin(math.radians(360.0 * (284 + doy) / 365.0)))
        omega = math.radians(15.0 * (hour - 12.0))

        cos_theta_z = (math.sin(lat) * math.sin(delta)
                       + math.cos(lat) * math.cos(delta) * math.cos(omega))
        if cos_theta_z <= 0.01:
            continue   # sun below horizon

        # --- Ideal HSAT tracking angle (eq. 1) ---
        theta_T = math.atan2(math.cos(delta) * math.sin(omega), cos_theta_z)

        # Clamp to hardware limit
        theta_T = max(-max_angle_rad, min(max_angle_rad, theta_T))

        # --- AOI on tracker surface (eq. 2) ---
        cos_aoi = (math.cos(theta_T) * cos_theta_z
                   + math.cos(delta) * math.sin(theta_T) * math.sin(omega))
        cos_aoi = max(0.0, cos_aoi)

        # --- Geometric factor Rb ---
        Rb = min(cos_aoi / cos_theta_z, 5.0)

        # --- Extraterrestrial radiation & clearness index ---
        I0 = 1367.0 * (1.0 + 0.033 * math.cos(math.radians(360.0 * doy / 365.0)))
        kt = min(ghi / max(1.0, I0 * cos_theta_z), 1.0)

        # --- Erbs diffuse decomposition ---
        if kt <= 0.22:
            fd = 1.0 - 0.09 * kt
        elif kt <= 0.80:
            fd = (0.9511 - 0.1604 * kt + 4.388 * kt**2
                  - 16.638 * kt**3 + 12.336 * kt**4)
        else:
            fd = 0.165

        Gd = ghi * fd
        Gb = max(0.0, ghi - Gd)

        # --- Instantaneous tilt β = |θ_T| for Hay-Davies ---
        beta_eff    = abs(theta_T)
        cos_beta    = math.cos(beta_eff)
        sky_factor  = (1.0 + cos_beta) / 2.0
        gnd_factor  = albedo * (1.0 - cos_beta) / 2.0

        gti[i] = max(0.0, Gb * Rb + Gd * sky_factor + ghi * gnd_factor)

    return gti


def annual_gti_from_ghi_hsat(
    ghi_wm2: List[float],
    timestamps: List[str],
    lat_deg: float,
    max_angle_deg: float = 55.0,
    albedo: float = 0.20,
) -> float:
    """Return total annual GTI in kWh/m² for HSAT from hourly GHI values."""
    gti = ghi_to_gti_hsat(ghi_wm2, timestamps, lat_deg, max_angle_deg, albedo)
    return float(gti.sum()) / 1000.0


def generate_synthetic_hourly_gti(
    lat_deg: float,
    monthly_gti_kwh_m2: List[float],
    year: int = 2024,
    is_sat: bool = False,
    max_angle_deg: float = 55.0,
    tilt_deg: float = 20.0,
    azimuth_pvgis: float = 0.0,
    albedo: float = 0.20,
) -> tuple:
    """
    Generate a synthetic 8760-hour GTI time series calibrated to monthly totals.

    Algorithm
    ---------
    1. For each hour of *year*, compute a "clear-sky" irradiance proportional
       to the cosine of the angle of incidence (using solar geometry only —
       no atmospheric model required).
    2. Sum the raw clear-sky values within each calendar month.
    3. Scale each month's hourly values so the monthly sum equals the
       corresponding value in *monthly_gti_kwh_m2*.

    The result captures the correct diurnal profile (bell curve per day) and
    the correct seasonal variation (higher in summer, lower in winter for NH),
    calibrated to the actual PVGIS/NASA monthly totals.

    Parameters
    ----------
    lat_deg            : site latitude (° N positive)
    monthly_gti_kwh_m2 : list of 12 monthly GTI values (kWh/m²/month)
    year               : calendar year for timestamp generation (default 2024)
    is_sat             : True → use HSAT tracking angle; False → fixed tilt
    max_angle_deg      : HSAT rotation limit (used only when is_sat=True)
    tilt_deg           : fixed tilt angle (used only when is_sat=False)
    azimuth_pvgis      : panel azimuth (0=South NH) (used only when is_sat=False)
    albedo             : ground reflectance

    Returns
    -------
    (timestamps, gti_wm2)
        timestamps : list of 8760 "YYYY-MM-DD HH:MM" strings
        gti_wm2    : list of 8760 hourly GTI values in W/m²
    """
    from datetime import datetime as _dt, timedelta as _td

    lat           = math.radians(lat_deg)
    max_angle_rad = math.radians(max_angle_deg)
    tilt_beta     = math.radians(tilt_deg)
    gamma_s_ft    = math.radians(azimuth_pvgis)
    cos_beta_ft   = math.cos(tilt_beta)
    sin_beta_ft   = math.sin(tilt_beta)
    cos_gam_ft    = math.cos(gamma_s_ft)
    sin_gam_ft    = math.sin(gamma_s_ft)

    timestamps: List[str]   = []
    raw_gti:    List[float] = []
    monthly_raw = [0.0] * 12

    start = _dt(year, 1, 1, 0, 30)
    cur   = start

    # Detect leap year
    total_hours = 8784 if (year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)) else 8760

    for _ in range(total_hours):
        m_idx = cur.month - 1
        doy   = cur.timetuple().tm_yday
        hour  = cur.hour + 0.5   # midpoint of hour

        delta = math.radians(23.45 * math.sin(math.radians(360.0 * (284 + doy) / 365.0)))
        omega = math.radians(15.0 * (hour - 12.0))

        cos_theta_z = (math.sin(lat) * math.sin(delta)
                       + math.cos(lat) * math.cos(delta) * math.cos(omega))

        if cos_theta_z <= 0.01:
            raw_gti.append(0.0)
        else:
            I0 = 1367.0 * (1.0 + 0.033 * math.cos(math.radians(360.0 * doy / 365.0)))

            if is_sat:
                theta_T = math.atan2(math.cos(delta) * math.sin(omega), cos_theta_z)
                theta_T = max(-max_angle_rad, min(max_angle_rad, theta_T))
                cos_aoi = max(0.0,
                              math.cos(theta_T) * cos_theta_z
                              + math.cos(delta) * math.sin(theta_T) * math.sin(omega))
                beta_eff   = abs(theta_T)
                cos_beta_e = math.cos(beta_eff)
                gd_sky     = (1.0 + cos_beta_e) / 2.0
                gnd        = albedo * (1.0 - cos_beta_e) / 2.0
            else:
                sin_lat = math.sin(lat); cos_lat = math.cos(lat)
                sin_del = math.sin(delta); cos_del = math.cos(delta)
                cos_aoi = max(0.0,
                    sin_del * (sin_lat * cos_beta_ft - cos_lat * sin_beta_ft * cos_gam_ft)
                    + cos_del * math.cos(omega) * (cos_lat * cos_beta_ft + sin_lat * sin_beta_ft * cos_gam_ft)
                    + cos_del * sin_beta_ft * sin_gam_ft * math.sin(omega))
                gd_sky = (1.0 + cos_beta_ft) / 2.0
                gnd    = albedo * (1.0 - cos_beta_ft) / 2.0

            Rb   = min(cos_aoi / cos_theta_z, 5.0)
            # Use a fixed diffuse fraction (fd=0.35) for the raw profile —
            # exact cloud cover doesn't matter here since we scale to monthly totals
            fd   = 0.35
            Gd0  = I0 * cos_theta_z * fd
            Gb0  = I0 * cos_theta_z * (1.0 - fd)
            val  = max(0.0, Gb0 * Rb + Gd0 * gd_sky + I0 * cos_theta_z * gnd)
            raw_gti.append(val)
            monthly_raw[m_idx] += val / 1000.0   # Wh → kWh

        timestamps.append(cur.strftime("%Y-%m-%d %H:%M"))
        cur += _td(hours=1)

    # Scale each month to match target monthly GTI
    monthly_scale = []
    for m in range(12):
        raw  = monthly_raw[m]
        tgt  = monthly_gti_kwh_m2[m] if len(monthly_gti_kwh_m2) > m else 0.0
        monthly_scale.append(tgt / raw if raw > 1.0 else 0.0)

    gti_scaled: List[float] = []
    for i, ts in enumerate(timestamps):
        m_idx = int(ts[5:7]) - 1
        gti_scaled.append(raw_gti[i] * monthly_scale[m_idx])

    return timestamps, gti_scaled
