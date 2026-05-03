"""
Edition flags for PVLayout.

Three editions are built from the same codebase:
  BASIC     — Layout + results only (no cables, no DXF, no energy)
  PRO       — Basic + cable routing + obstructions + ICR drag (no DXF, no energy)
  PRO_PLUS  — Full feature set (cables + DXF + energy generation)
"""
from enum import Enum


class Edition(Enum):
    BASIC    = "basic"
    PRO      = "pro"
    PRO_PLUS = "pro_plus"


EDITION_NAMES = {
    Edition.BASIC:    "Basic",
    Edition.PRO:      "Pro",
    Edition.PRO_PLUS: "Pro Plus",
}


def edition_name(edition: Edition) -> str:
    return EDITION_NAMES.get(edition, "Unknown")


# ---------------------------------------------------------------------------
# Feature flags
# ---------------------------------------------------------------------------

def has_cables(edition: Edition) -> bool:
    """String DC + AC/DC-to-ICR cable routing and visibility toggle."""
    return edition in (Edition.PRO, Edition.PRO_PLUS)


def has_obstructions(edition: Edition) -> bool:
    """Draw Rectangle / Draw Polygon obstruction tools."""
    return edition in (Edition.PRO, Edition.PRO_PLUS)


def has_icr_drag(edition: Edition) -> bool:
    """Click-and-drag ICR repositioning on the plot."""
    return edition in (Edition.PRO, Edition.PRO_PLUS)


def has_dxf(edition: Edition) -> bool:
    """DXF (CAD) export."""
    return edition == Edition.PRO_PLUS


def has_energy(edition: Edition) -> bool:
    """Energy yield calculation, 15-min CSV export, P50/P75/P90."""
    return edition == Edition.PRO_PLUS


def has_ac_dc_ratio(edition: Edition) -> bool:
    """Plant AC capacity (MW) and DC/AC ratio columns in summary."""
    return edition == Edition.PRO_PLUS
