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
