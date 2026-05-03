"""
Parser for PVsyst .PAN (module/panel) files.

PAN files are text-based key=value files with a hierarchical PVObject structure.
This parser extracts the physically and electrically relevant parameters needed for:
  - Auto-filling module dimensions and wattage in the layout tool
  - Calculating module temperature losses in the energy yield model
  - Auto-detecting bifacial modules and reading the bifaciality factor

Handles both PVsyst 6.x and 7.x file formats.
Dimension values may be in metres (< 100) or millimetres (≥ 100) — both handled.

Key parameters extracted
------------------------
  pnom_wp            : Nominal power at STC (Wp)
  width_m            : Module short side (m)
  height_m           : Module long side (m)
  mu_pmpp_pct        : Power temperature coefficient (%/°C), typically –0.35 to –0.40
  noct_c             : Nominal Operating Cell Temperature (°C)
  isc, voc           : Short-circuit current (A) and open-circuit voltage (V)
  imp, vmp           : Current (A) and voltage (V) at MPP
  manufacturer       : Manufacturer name string
  model              : Model name string
  is_bifacial        : True when the PAN file describes a bifacial module
  bifaciality_factor : Rear/front efficiency ratio φ (e.g. 0.70); 0.0 if monofacial

Bifacial detection
------------------
PVsyst 6.8+ / 7.x stores bifacial parameters using these keys:
  BifacialityFactor  — φ as a decimal (0.60–0.85); present only in bifacial modules
  Bifaciality        — older alias for BifacialityFactor
  BifacialModel      — integer flag (non-zero = bifacial model active)
A module is classified as bifacial when BifacialityFactor (or Bifaciality) > 0,
OR when BifacialModel is non-zero.
"""
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class PANData:
    """Parsed data from a PVsyst .PAN module file."""
    manufacturer: str = ""
    model: str = ""
    # STC electrical parameters
    pnom_wp: float = 0.0      # nominal power (Wp)
    isc: float = 0.0          # short-circuit current (A)
    voc: float = 0.0          # open-circuit voltage (V)
    imp: float = 0.0          # current at MPP (A)
    vmp: float = 0.0          # voltage at MPP (V)
    # Physical dimensions (metres)
    width_m: float = 0.0      # short side
    height_m: float = 0.0     # long side
    # Temperature model
    mu_pmpp_pct: float = 0.0  # power temp. coefficient (%/°C); negative for power loss
    noct_c: float = 45.0      # Nominal Operating Cell Temperature (°C)
    # Bifacial parameters (0.0 / False → monofacial)
    is_bifacial: bool = False
    bifaciality_factor: float = 0.0   # φ = rear efficiency / front efficiency
    # Metadata
    file_path: str = ""

    @property
    def label(self) -> str:
        """Short display label: 'Manufacturer Model (Pnom Wp) [Bifacial φ=0.70]'."""
        parts = []
        if self.manufacturer:
            parts.append(self.manufacturer)
        if self.model:
            parts.append(self.model)
        if self.pnom_wp > 0:
            parts.append(f"({self.pnom_wp:.0f} Wp)")
        if self.is_bifacial:
            parts.append(f"[Bifacial φ={self.bifaciality_factor:.2f}]")
        return "  ".join(parts) if parts else "Unknown module"


def parse_pan(file_path: str) -> PANData:
    """
    Parse a PVsyst .PAN file and return a PANData instance.

    Raises
    ------
    ValueError   if the file does not look like a PAN file or critical data is missing
    FileNotFoundError  if the path does not exist
    """
    data = PANData(file_path=file_path)
    kv = _extract_kv(file_path)

    # ---- Manufacturer / Model ----------------------------------------
    data.manufacturer = kv.get("Manufacturer", "").strip()
    data.model        = kv.get("Model", "").strip()

    # ---- Nominal power -----------------------------------------------
    # PVsyst 6.x uses PNomTref or PNom; 7.x uses PNom
    for key in ("PNom", "PNomTref", "Pmax"):
        if key in kv:
            try:
                data.pnom_wp = float(kv[key])
                break
            except ValueError:
                pass

    # ---- Electrical parameters ---------------------------------------
    data.isc = _float(kv, "Isc")
    data.voc = _float(kv, "Voc")
    data.imp = _float(kv, ("Imp", "Impp"))
    data.vmp = _float(kv, ("Vmp", "Vmpp"))

    # ---- Temperature coefficients ------------------------------------
    # muPmpp is the power temperature coefficient in %/°C (e.g. −0.35).
    # PVsyst 6.x / 7.x always stores it under one of the keys below.
    # NOTE: muGamma is PVsyst's ideality-factor temperature coefficient
    # (dimensionless ~−0.0003 K⁻¹) — it is NOT the power coefficient and
    # must NOT be used as a fallback for muPmpp.
    mu = _float(kv, ("muPmpp", "muPMax", "muPmpp_abs"))

    # Normalise units: some files store the coefficient as a dimensionless
    # fraction (e.g. −0.0035) rather than percent per °C (e.g. −0.35).
    # Typical silicon modules range from −0.20 to −0.55 %/°C; any value
    # whose magnitude is below 0.10 is almost certainly in per-unit form
    # and needs to be multiplied by 100 to convert to %/°C.
    if mu != 0.0 and abs(mu) < 0.10:
        mu *= 100.0

    data.mu_pmpp_pct = mu   # stored with sign (negative = power loss with heat)

    # NOCT
    noct = _float(kv, ("NOCT", "NOCTemp", "FAIMAN_c1"))
    data.noct_c = noct if noct > 0 else 45.0

    # ---- Physical dimensions -----------------------------------------
    raw_w = _float(kv, ("Width",  "ModuleWidth",  "width"))
    raw_h = _float(kv, ("Height", "ModuleHeight", "height"))

    # Detect unit: if value > 100 it is almost certainly in mm
    w_m = raw_w / 1000.0 if raw_w > 100 else raw_w
    h_m = raw_h / 1000.0 if raw_h > 100 else raw_h

    # Assign short side → width, long side → height (length)
    if w_m > 0 and h_m > 0:
        data.width_m  = min(w_m, h_m)
        data.height_m = max(w_m, h_m)
    elif w_m > 0:
        # Only one dimension available — make a square assumption
        data.width_m = data.height_m = w_m
    elif h_m > 0:
        data.width_m = data.height_m = h_m

    # ---- Bifacial detection -----------------------------------------
    # PVsyst 6.8+ / 7.x stores bifaciality as BifacialityFactor (decimal 0–1).
    # Older files may use the key "Bifaciality".  Some files also set
    # BifacialModel = 1 without an explicit factor — in that case we default φ=0.70.
    bif_factor = _float(kv, (
        "BifacialityFactor", "Bifaciality",
        "BifacFactor",       "BifacialFactor",
        "bifacialityFactor", "bifaciality_factor",
    ))
    bif_model = _float(kv, ("BifacialModel", "Bifacial", "IsBifacial"))

    if bif_factor > 0.0:
        data.is_bifacial        = True
        data.bifaciality_factor = round(bif_factor, 4)
    elif bif_model != 0.0:
        # BifacialModel flag present but no explicit factor — use typical default
        data.is_bifacial        = True
        data.bifaciality_factor = 0.70

    # ---- Sanity checks -----------------------------------------------
    if data.pnom_wp <= 0:
        raise ValueError(
            f"Could not read nominal power (PNom) from '{file_path}'. "
            "Check that the file is a valid PVsyst .PAN module file."
        )

    return data


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _extract_kv(file_path: str) -> dict:
    """
    Read the file and build a flat dict of key → value strings.
    Handles both UTF-8 and Latin-1 encodings.
    Ignores comment lines (starting with ';') and blank lines.
    """
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
        # Handle lines like:  Key=Value   or   Key = Value
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip()
        # Skip object markers
        if key.startswith("PVObject_") or key.startswith("End of"):
            continue
        # Remove trailing comments after  ;
        val = val.split(";")[0].strip()
        if key and val:
            kv[key] = val
    return kv


def _float(kv: dict, keys) -> float:
    """Try one or more keys; return the first successfully parsed float, else 0.0."""
    if isinstance(keys, str):
        keys = (keys,)
    for k in keys:
        if k in kv:
            try:
                return float(kv[k])
            except ValueError:
                pass
    return 0.0
