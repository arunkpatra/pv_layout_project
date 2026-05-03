"""
Generic hourly weather file parser.

Accepts any CSV that contains:
  • A **time** column  (flexible name and format — see below)
  • A **GHI**   column  (global horizontal irradiance, W/m²)

Optional columns that improve results if present:
  • GTI / G(i)    — in-plane (tilted) irradiance (W/m²)
  • Temperature   — ambient temperature (°C)
    When a temperature column is present the monthly average temperatures
    are derived directly from the file data and used for IEC 61724-1
    monthly PR calculation instead of the sinusoidal seasonal model.

Supported column-name variants (case-insensitive)
--------------------------------------------------
Time   : "time", "datetime", "date", "timestamp",
         "time(utc)", "time(local)", "date/time"
GHI    : "ghi", "g(h)", "gh", "global_horizontal",
         "global horizontal irradiance", "irradiance",
         "solar irradiance", "allsky_sfc_sw_dwn"
GTI    : "gti", "g(i)", "gi", "in-plane irradiance",
         "poa", "plane of array"
Temp   : "t2m", "temp", "temperature", "t_amb", "ambient_temp",
         "t_air", "tamb", "temp(degc)", "temperature(degc)",
         "temp(°c)", "temperature(°c)", "t(°c)", "t(c)",
         "ambient temperature", "air temperature",
         "dry bulb temperature", "drybulb"

Supported timestamp formats
---------------------------
  "20050101:0010"        → PVGIS seriescalc native
  "2005-01-01 00:10"     → ISO-8601 (most tools)
  "01/01/2005 00:10"     → DD/MM/YYYY
  "01-01-2005 00:10"     → DD-MM-YYYY
  "2005/01/01 00:10"     → YYYY/MM/DD
  "01/01/2005"           → date-only (time assumed 00:00)
  Excel serial numbers   → auto-detected if value is a float

Usage
-----
    from pvlayout_core.core.pvgis_file_parser import parse_pvgis_file
    data = parse_pvgis_file("hourly_ghi.csv")
    # data.ghi_wm2  — list of hourly GHI values (W/m²)
    # data.gti_wm2  — same if GTI column present, else empty
    # data.monthly_ghi_kwh_m2() — list of 12 monthly kWh/m² values
"""
import datetime
from dataclasses import dataclass, field
from typing import List, Optional


# ---------------------------------------------------------------------------
# Column name lookup tables (lower-case stripped)
# ---------------------------------------------------------------------------
_TIME_NAMES = {
    "time", "datetime", "date", "timestamp",
    "time(utc)", "time(local)", "time (utc)", "time (local)",
    "date/time", "date time", "date_time",
}
_GHI_NAMES = {
    "ghi", "g(h)", "gh", "global_horizontal",
    "global horizontal irradiance", "irradiance",
    "solar irradiance", "allsky_sfc_sw_dwn",
    "ghi_wm2", "ghi (w/m2)", "ghi(w/m2)", "ghi [w/m2]",
    "global horizontal", "g_h",
}
_GTI_NAMES = {
    "gti", "g(i)", "gi", "in-plane irradiance",
    "poa", "plane of array", "gti_wm2",
    "gti (w/m2)", "gti(w/m2)", "gti [w/m2]",
    "g(i)_wm2",
}
_TEMP_NAMES = {
    "t2m", "temp", "temperature", "t_amb", "tamb",
    "ambient_temp", "t_air", "tair",
    "t2m (degc)", "t2m(degc)",
    "temp (degc)", "temp(degc)",
    "temperature (degc)", "temperature(degc)",
    "temp (°c)", "temp(°c)", "temperature (°c)", "temperature(°c)",
    "t (°c)", "t(°c)", "t (c)", "t(c)",
    "ambient temperature", "air temperature",
    "dry bulb temperature", "drybulb",
}


# ---------------------------------------------------------------------------
# Data class
# ---------------------------------------------------------------------------
@dataclass
class PVGISFileData:
    """Parsed hourly irradiance file."""
    file_path:   str  = ""
    file_type:   str  = "generic"   # "generic", "pvgis_seriescalc", "pvgis_tmy"

    # Parallel arrays — one entry per valid data row
    timestamps: List[str]   = field(default_factory=list)   # "YYYY-MM-DD HH:MM"
    ghi_wm2:   List[float]  = field(default_factory=list)   # W/m²
    gti_wm2:   List[float]  = field(default_factory=list)   # W/m²  (may be empty)
    temp_c:    List[float]  = field(default_factory=list)   # °C    (may be empty)
    n_hours:   int = 0
    has_gti:   bool = False   # True if GTI column was present in the file

    def monthly_ghi_kwh_m2(self) -> List[float]:
        return _monthly_sum(self.timestamps, self.ghi_wm2)

    def monthly_gti_kwh_m2(self) -> List[float]:
        if not self.gti_wm2:
            return []
        return _monthly_sum(self.timestamps, self.gti_wm2)

    @property
    def has_temp(self) -> bool:
        """True if a temperature column was present in the file."""
        return len(self.temp_c) == self.n_hours and self.n_hours > 0

    def monthly_temp_c(self) -> List[float]:
        """
        12-element list of monthly average ambient temperatures (°C).
        Returns empty list if no temperature column was loaded.
        """
        if not self.has_temp:
            return []
        return _monthly_avg(self.timestamps, self.temp_c)

    def annual_avg_temp_c(self) -> float:
        """Annual average ambient temperature (°C), or 0.0 if not available."""
        if not self.has_temp:
            return 0.0
        return sum(self.temp_c) / len(self.temp_c)

    def annual_ghi_kwh_m2(self) -> float:
        return sum(v / 1000.0 for v in self.ghi_wm2)

    def annual_gti_kwh_m2(self) -> float:
        if not self.gti_wm2:
            return 0.0
        return sum(v / 1000.0 for v in self.gti_wm2)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _monthly_sum(timestamps: List[str], hourly_wm2: List[float]) -> List[float]:
    """Sum hourly W/m² values into monthly kWh/m² (÷1000 per hour)."""
    totals = [0.0] * 12
    for ts, val in zip(timestamps, hourly_wm2):
        try:
            m = int(ts[5:7]) - 1   # "YYYY-MM-DD HH:MM"
            totals[m] += val / 1000.0
        except (ValueError, IndexError):
            pass
    return totals


def _monthly_avg(timestamps: List[str], hourly_values: List[float]) -> List[float]:
    """
    Compute the monthly arithmetic mean of an hourly series.
    Returns a 12-element list (one value per calendar month).
    Months with no data return 0.0.
    """
    sums   = [0.0] * 12
    counts = [0]   * 12
    for ts, val in zip(timestamps, hourly_values):
        try:
            m = int(ts[5:7]) - 1
            sums[m]   += val
            counts[m] += 1
        except (ValueError, IndexError):
            pass
    return [
        round(sums[m] / counts[m], 2) if counts[m] > 0 else 0.0
        for m in range(12)
    ]


def _normalise_col_name(col: str) -> str:
    """Strip quotes, extra spaces; lower-case."""
    return col.strip().strip('"').strip("'").lower().strip()


def _match_col(col_lower: str, name_set: set) -> bool:
    """True if col_lower matches any name in name_set (exact or prefix)."""
    if col_lower in name_set:
        return True
    for name in name_set:
        if col_lower.startswith(name):
            return True
    return False


def _parse_timestamp(raw: str) -> Optional[str]:
    """
    Try all known formats.  Return "YYYY-MM-DD HH:MM" or None on failure.
    """
    raw = raw.strip().strip('"').strip("'")

    # PVGIS native: "YYYYMMDD:HHMM"
    if len(raw) >= 13 and raw[8] == ":" and raw[:8].isdigit():
        try:
            y, mo, d = int(raw[:4]), int(raw[4:6]), int(raw[6:8])
            hh, mm  = int(raw[9:11]), int(raw[11:13])
            return f"{y:04d}-{mo:02d}-{d:02d} {hh:02d}:{mm:02d}"
        except ValueError:
            pass

    # Try a list of explicit formats
    fmts = [
        "%Y-%m-%d %H:%M",    # ISO
        "%Y-%m-%dT%H:%M",
        "%Y/%m/%d %H:%M",
        "%d/%m/%Y %H:%M",
        "%d-%m-%Y %H:%M",
        "%m/%d/%Y %H:%M",    # US
        "%Y-%m-%d %H:%M:%S",
        "%Y/%m/%d %H:%M:%S",
        "%d/%m/%Y %H:%M:%S",
        "%d-%m-%Y %H:%M:%S",
        "%Y-%m-%d",          # date-only
        "%d/%m/%Y",
        "%d-%m-%Y",
    ]
    for fmt in fmts:
        try:
            dt = datetime.datetime.strptime(raw[:len(fmt) + 2], fmt)
            return dt.strftime("%Y-%m-%d %H:%M")
        except ValueError:
            pass

    # Excel serial number (float like "45291.0417")
    try:
        serial = float(raw)
        # Excel epoch: Dec 30 1899
        base = datetime.datetime(1899, 12, 30)
        dt = base + datetime.timedelta(days=serial)
        return dt.strftime("%Y-%m-%d %H:%M")
    except ValueError:
        pass

    return None


# ---------------------------------------------------------------------------
# Main parser
# ---------------------------------------------------------------------------

def parse_pvgis_file(file_path: str) -> PVGISFileData:
    """
    Parse any CSV with a time column and a GHI column.

    Returns
    -------
    PVGISFileData — hourly arrays ready for use.

    Raises
    ------
    ValueError  — if the file cannot be decoded, no header found,
                  or required columns are missing.
    """
    # --- Read file with encoding fallback ----------------------------------
    lines: List[str] = []
    for enc in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            with open(file_path, encoding=enc) as fh:
                lines = fh.readlines()
            break
        except UnicodeDecodeError:
            continue
    if not lines:
        raise ValueError("Cannot read file — tried UTF-8 and Latin-1 encodings.")

    data = PVGISFileData(file_path=file_path)

    # --- Find the header row (first row that contains a time-like column) --
    header_idx: Optional[int] = None
    col_map: dict = {}   # "time","ghi","gti","temp" → column index

    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        # Split by comma, semicolon, or tab — whichever gives more columns
        for sep in (",", ";", "\t"):
            parts = stripped.split(sep)
            if len(parts) >= 2:
                break

        cols_lower = [_normalise_col_name(c) for c in parts]

        # Check if this row contains a recognised time column
        found_time = any(_match_col(c, _TIME_NAMES) for c in cols_lower)
        found_ghi  = any(_match_col(c, _GHI_NAMES)  for c in cols_lower)

        if found_time and found_ghi:
            header_idx = i
            # Map each column
            for j, cl in enumerate(cols_lower):
                if "time" not in col_map and _match_col(cl, _TIME_NAMES):
                    col_map["time"] = j
                elif "ghi" not in col_map and _match_col(cl, _GHI_NAMES):
                    col_map["ghi"] = j
                elif "gti" not in col_map and _match_col(cl, _GTI_NAMES):
                    col_map["gti"] = j
                elif "temp" not in col_map and _match_col(cl, _TEMP_NAMES):
                    col_map["temp"] = j
            break

    if header_idx is None:
        raise ValueError(
            "No column header found.\n\n"
            "The file must have at minimum two columns:\n"
            "  • A time column   (name: Time, DateTime, Date, Timestamp, …)\n"
            "  • A GHI column    (name: GHI, G(h), Irradiance, …)\n\n"
            "Check that the first row with column names uses one of these names."
        )

    # Decide separator used in the header line
    hdr_line = lines[header_idx]
    sep = ","
    for s in (",", ";", "\t"):
        if hdr_line.count(s) >= 1:
            sep = s
            break

    # Detect PVGIS-specific file type for informational purposes
    hdr_lower = hdr_line.lower()
    if "g(i)" in hdr_lower:
        data.file_type = "pvgis_seriescalc"
    elif "g(h)" in hdr_lower and "gb(n)" in hdr_lower:
        data.file_type = "pvgis_tmy"

    # --- Parse data rows ---------------------------------------------------
    for line in lines[header_idx + 1:]:
        line = line.strip()
        if not line or line.startswith("#"):
            continue

        parts = line.split(sep)
        n_cols = len(parts)

        # Skip rows that don't have enough columns
        if n_cols <= max(col_map.get("time", 0), col_map.get("ghi", 0)):
            continue

        def _safe(idx: int, default=0.0) -> float:
            try:
                return float(parts[idx].strip()) if idx < n_cols else default
            except (ValueError, IndexError):
                return default

        ts_raw = parts[col_map["time"]].strip()
        ts_iso = _parse_timestamp(ts_raw)
        if ts_iso is None:
            continue

        ghi_val = max(0.0, _safe(col_map["ghi"]))

        data.timestamps.append(ts_iso)
        data.ghi_wm2.append(ghi_val)

        if "gti" in col_map:
            data.gti_wm2.append(max(0.0, _safe(col_map["gti"])))
            data.has_gti = True
        if "temp" in col_map:
            data.temp_c.append(_safe(col_map["temp"], 25.0))

    data.n_hours = len(data.timestamps)

    if data.n_hours < 365:
        raise ValueError(
            f"Only {data.n_hours} valid rows found — expected at least 8760 "
            f"for a full year.\n\n"
            f"Tips:\n"
            f"  • Make sure the file has one row per hour (8760 for a year).\n"
            f"  • Verify the time and GHI column names are recognised.\n"
            f"  • Confirm the file is not filtered or truncated."
        )

    return data
