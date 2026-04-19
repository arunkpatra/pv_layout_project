"""
Row spacing / pitch calculator for solar panels.

For fixed-tilt arrays the minimum row pitch is determined by the no-shading
criterion: on the winter solstice at solar noon the shadow of the front row
must not fall on the next row.

Reference formula:
    pitch = L * cos(tilt) + L * sin(tilt) / tan(solar_elevation)

where:
    L              = table height in the tilt plane (metres)
    tilt           = panel tilt angle (degrees from horizontal)
    solar_elevation = sun elevation at worst case (winter solstice solar noon)

For single-axis trackers the concept of fixed pitch does not apply in the
same way, but a GCR-based pitch is standard practice:
    pitch_tracker = table_width / GCR

Default GCR for trackers is typically 0.40.
"""
import math
from typing import Optional

# ---------------------------------------------------------------------------
# Tilt angle recommendation
# ---------------------------------------------------------------------------

def recommended_tilt(latitude_deg: float) -> float:
    """
    Return a rule-of-thumb optimal tilt angle for annual energy maximisation.
    A common approximation: tilt ≈ 0.76 * |latitude| + 3.1  (for |lat| < 60°)
    Clipped to sensible range [5°, 40°].
    """
    lat = abs(latitude_deg)
    tilt = 0.76 * lat + 3.1
    return max(5.0, min(40.0, tilt))


# ---------------------------------------------------------------------------
# Solar elevation at winter solstice solar noon
# ---------------------------------------------------------------------------

def _solar_elevation_winter_solstice(latitude_deg: float) -> float:
    """
    Solar elevation at solar noon on winter solstice.
    For northern hemisphere: Dec 21 → declination ≈ -23.45°
    For southern hemisphere: Jun 21 → declination ≈ +23.45°
    Formula: elev = 90° - |lat| - 23.45°  (simplified)
    Clamped to minimum 5° to avoid division by near-zero.
    """
    elev = 90.0 - abs(latitude_deg) - 23.45
    return max(5.0, elev)


# ---------------------------------------------------------------------------
# Pitch / row spacing
# ---------------------------------------------------------------------------

def calculate_row_pitch(
    table_height_m: float,
    tilt_deg: float,
    latitude_deg: float,
    shade_limit_hours: float = 0.0,
) -> float:
    """
    Calculate minimum row pitch (centre-to-centre distance between rows)
    for no shading at solar noon on the winter solstice.

    Parameters
    ----------
    table_height_m   : height of the panel table in the slope direction (metres)
    tilt_deg         : panel tilt angle (degrees)
    latitude_deg     : site latitude (positive = N, negative = S)
    shade_limit_hours: additional shade-free hours either side of solar noon
                       (0 = noon-only, typical value 1–2 h). Currently used
                       to reduce the effective solar elevation conservatively.

    Returns
    -------
    Pitch in metres (centre-to-centre row spacing).
    """
    tilt_rad = math.radians(tilt_deg)

    # Effective solar elevation — reduce by shade_limit_hours
    # Each hour from noon ≈ 15° azimuth change; elevation drops roughly
    # 0.5–0.8° per degree of hour angle at this geometry.  A simple
    # conservative correction: subtract 0.6° per shade-limit hour.
    base_elev = _solar_elevation_winter_solstice(latitude_deg)
    elev_correction = shade_limit_hours * 0.6 * 15.0  # rough deg
    effective_elev = max(5.0, base_elev - elev_correction)
    elev_rad = math.radians(effective_elev)

    # Shadow length cast by the vertical component of the tilted panel
    vertical_component = table_height_m * math.sin(tilt_rad)
    horizontal_component = table_height_m * math.cos(tilt_rad)

    shadow_length = vertical_component / math.tan(elev_rad)
    pitch = horizontal_component + shadow_length
    return round(pitch, 3)


def calculate_gcr(table_height_m: float, pitch_m: float) -> float:
    """Ground Coverage Ratio = table_height / pitch."""
    if pitch_m <= 0:
        return 0.0
    return round(table_height_m / pitch_m, 4)


def pitch_from_gcr(table_height_m: float, gcr: float) -> float:
    """Inverse of calculate_gcr."""
    if gcr <= 0:
        raise ValueError("GCR must be > 0")
    return round(table_height_m / gcr, 3)


# ---------------------------------------------------------------------------
# Tracker pitch
# ---------------------------------------------------------------------------

def tracker_pitch(table_width_m: float, gcr: float = 0.40) -> float:
    """
    Row-to-row pitch for a single-axis tracker array.
    Uses GCR-based formula: pitch = table_width / GCR
    """
    return round(table_width_m / gcr, 3)


# ---------------------------------------------------------------------------
# Convenience wrapper
# ---------------------------------------------------------------------------

def auto_spacing(
    table_height_m: float,
    table_width_m: float,
    latitude_deg: float,
    design_type: str = "fixed_tilt",
    tilt_deg: Optional[float] = None,
    gcr: Optional[float] = None,
    shade_limit_hours: float = 0.0,
) -> dict:
    """
    Single entry point that returns a dict with:
        tilt_deg, pitch_m, gcr
    for either fixed_tilt or tracker design.

    If tilt_deg is None it is calculated from latitude.
    If gcr is provided it overrides the shadow-based pitch for fixed tilt.
    """
    result = {}

    used_tilt = tilt_deg if tilt_deg is not None else recommended_tilt(latitude_deg)
    if gcr is not None:
        pitch = pitch_from_gcr(table_height_m, gcr)
        used_gcr = gcr
    else:
        pitch = calculate_row_pitch(table_height_m, used_tilt, latitude_deg, shade_limit_hours)
        used_gcr = calculate_gcr(table_height_m, pitch)
    result["tilt_deg"] = round(used_tilt, 2)
    result["pitch_m"] = pitch
    result["gcr"] = used_gcr

    return result
