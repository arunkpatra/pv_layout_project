"""
Parser for PVsyst .OND (inverter/onduleur) files.

OND files are text-based key=value files with the same PVObject structure as PAN files.
This parser extracts the electrically relevant parameters needed for:
  - Auto-filling inverter efficiency in the PR breakdown
  - Displaying inverter specification in the energy yield report

Handles both PVsyst 6.x and 7.x file formats.

Key parameters extracted
------------------------
  pnom_conv_w      : Nominal AC output power (W)
  pmax_out_w       : Maximum AC output power (W)
  effic_euro_pct   : European weighted efficiency (%) — preferred for PR calc
  effic_max_pct    : Maximum efficiency (%)
  effic_cec_pct    : CEC weighted efficiency (%)
  vmpp_min / vmpp_max : MPPT voltage range (V)
  v_nom_ac         : Nominal AC voltage (V)
  manufacturer     : Manufacturer name string
  model            : Model name string

Efficiency priority for auto-fill
----------------------------------
  1. EfficEuro  (weighted; best for annual energy estimate)
  2. EfficCEC   (CEC-weighted; common for US market)
  3. EfficMax   (peak efficiency; slightly optimistic for annual average)
"""
from dataclasses import dataclass


@dataclass
class ONDData:
    """Parsed data from a PVsyst .OND inverter file."""
    manufacturer: str = ""
    model: str = ""
    # Power ratings (W)
    pnom_conv_w: float = 0.0    # nominal AC output power
    pmax_out_w: float = 0.0     # max AC output power
    # Efficiency (%)
    effic_max_pct: float = 0.0
    effic_euro_pct: float = 0.0
    effic_cec_pct: float = 0.0
    # Voltage / electrical specs
    v_nom_ac: float = 0.0       # nominal AC voltage (V)
    vmpp_min: float = 0.0       # MPPT minimum voltage (V)
    vmpp_max: float = 0.0       # MPPT maximum voltage (V)
    # Metadata
    file_path: str = ""

    @property
    def best_efficiency_pct(self) -> float:
        """
        Return the most representative annual efficiency value.
        Priority: EfficEuro > EfficCEC > EfficMax.
        """
        for v in (self.effic_euro_pct, self.effic_cec_pct, self.effic_max_pct):
            if v > 0:
                return v
        return 0.0

    @property
    def efficiency_label(self) -> str:
        """Short label indicating which efficiency value was used."""
        if self.effic_euro_pct > 0:
            return f"η_Euro = {self.effic_euro_pct:.2f} %"
        if self.effic_cec_pct > 0:
            return f"η_CEC = {self.effic_cec_pct:.2f} %"
        if self.effic_max_pct > 0:
            return f"η_Max = {self.effic_max_pct:.2f} %"
        return "Efficiency unknown"

    @property
    def label(self) -> str:
        """Short display label: 'Manufacturer Model (power kW)'."""
        parts = []
        if self.manufacturer:
            parts.append(self.manufacturer)
        if self.model:
            parts.append(self.model)
        if self.pnom_conv_w > 0:
            parts.append(f"({self.pnom_conv_w:.0f} kW)")
        return "  ".join(parts) if parts else "Unknown inverter"


def parse_ond(file_path: str) -> ONDData:
    """
    Parse a PVsyst .OND file and return an ONDData instance.

    Raises
    ------
    ValueError   if the file does not look like an OND file or critical data is missing
    FileNotFoundError  if the path does not exist
    """
    data = ONDData(file_path=file_path)
    kv = _extract_kv(file_path)

    # ---- Manufacturer / Model ----------------------------------------
    data.manufacturer = kv.get("Manufacturer", "").strip()
    data.model        = kv.get("Model", "").strip()

    # ---- Power ratings -----------------------------------------------
    data.pnom_conv_w = _float(kv, ("PNomConv", "PNomInv", "PNom"))
    data.pmax_out_w  = _float(kv, ("PMaxOUT",  "PMaxOut", "PMaxDC"))

    # ---- Efficiency --------------------------------------------------
    # EfficMax / EfficEuro / EfficCEC may be stored as percentage (e.g. 98.50)
    # or as a ratio (e.g. 0.9850).  Detect and normalise.
    data.effic_max_pct  = _effic(kv, ("EfficMax",  "effic_max",  "MaxEff"))
    data.effic_euro_pct = _effic(kv, ("EfficEuro", "effic_euro", "EuroEff"))
    data.effic_cec_pct  = _effic(kv, ("EfficCEC",  "effic_cec",  "CECEff"))

    # ---- Voltage specs -----------------------------------------------
    data.vmpp_min  = _float(kv, ("VMPPMin", "VmpMin", "VDCMin"))
    data.vmpp_max  = _float(kv, ("VMPPMax", "VmpMax", "VDCMax"))
    data.v_nom_ac  = _float(kv, ("VNomAC",  "VAC",    "VNominal"))

    # ---- Sanity check ------------------------------------------------
    if data.pnom_conv_w <= 0 and data.best_efficiency_pct <= 0:
        raise ValueError(
            f"Could not read power or efficiency from '{file_path}'. "
            "Check that the file is a valid PVsyst .OND inverter file."
        )

    return data


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _extract_kv(file_path: str) -> dict:
    """Read file and return flat key→value dict (same logic as pan_parser)."""
    for enc in ("utf-8", "latin-1", "cp1252"):
        try:
            with open(file_path, encoding=enc) as fh:
                lines = fh.readlines()
            break
        except (UnicodeDecodeError, FileNotFoundError):
            continue
    else:
        raise FileNotFoundError(f"Cannot open file: {file_path}")

    kv = {}
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith(";") or line.startswith("//"):
            continue
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().split(";")[0].strip()
        if key.startswith("PVObject_") or key.startswith("End of"):
            continue
        if key and val:
            kv[key] = val
    return kv


def _float(kv: dict, keys) -> float:
    """Try one or more keys; return the first parsed float, else 0.0."""
    if isinstance(keys, str):
        keys = (keys,)
    for k in keys:
        if k in kv:
            try:
                return float(kv[k])
            except ValueError:
                pass
    return 0.0


def _effic(kv: dict, keys) -> float:
    """
    Extract an efficiency value and normalise to percentage (0–100 scale).
    If the raw value is ≤ 1.0 it is assumed to be a ratio and converted to %.
    """
    v = _float(kv, keys)
    if v <= 0:
        return 0.0
    # Normalise ratio → percentage
    if v <= 1.0:
        v *= 100.0
    return v
