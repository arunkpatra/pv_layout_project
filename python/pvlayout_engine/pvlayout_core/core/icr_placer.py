"""
ICR (Inverter Control Room) placement logic.

Rules:
  - One ICR per 18 MWp of plant capacity  →  num_icrs = ceil(capacity_mwp / 18)
  - ICR dimensions: 40 m (E-W) × 14 m (N-S)
  - Each ICR must be FULLY CONTAINED within the usable polygon
    (boundary already shrunk by perimeter road width).
  - Tables are sorted E-W and divided into equal-count blocks
    (~18 MWp per block).  Each ICR is placed at the geometric centroid
    of its block's tables, so every block of tables surrounds its own ICR.
  - Any panel table overlapping an ICR footprint is removed.
"""
import math
from typing import List, Tuple, Optional

from shapely.geometry import box as shapely_box, Polygon

from pvlayout_core.models.project import (
    PlacedTable, PlacedICR,
    ICR_EW, ICR_NS, ICR_MWP_PER_UNIT,
)


# ---------------------------------------------------------------------------
# Position helpers
# ---------------------------------------------------------------------------

def _find_valid_icr_position(
    cx: float,
    cy: float,
    usable_poly: Polygon,
    search_step: float = 1.0,
    max_search: float = 100.0,
) -> Optional[Tuple[float, float]]:
    """
    Starting from ideal centre (cx, cy), search outward in N-S direction
    until the ICR box is fully inside usable_poly.
    Returns bottom-left (x, y) of a valid ICR position, or None.
    """
    icr_x     = cx - ICR_EW / 2.0
    icr_y_ref = cy - ICR_NS / 2.0

    offsets = [0.0]
    step = search_step
    while step <= max_search:
        offsets.append( step)
        offsets.append(-step)
        step += search_step

    for dy in offsets:
        icr_y = icr_y_ref + dy
        candidate = shapely_box(icr_x, icr_y, icr_x + ICR_EW, icr_y + ICR_NS)
        if usable_poly.contains(candidate):
            return icr_x, icr_y

    return None


def _find_valid_icr_position_2d(
    cx: float,
    cy: float,
    usable_poly: Polygon,
    search_step: float = 5.0,
    max_search: float = 300.0,
) -> Optional[Tuple[float, float]]:
    """
    Extended 2-D expanding-ring search used as fallback when the N-S-only
    search fails (e.g. the centroid falls outside an irregular boundary).
    Searches outward from (cx, cy) in both E-W and N-S directions.
    Returns bottom-left (x, y) or None.
    """
    icr_x_base = cx - ICR_EW / 2.0
    icr_y_base = cy - ICR_NS / 2.0

    max_rings = int(max_search / search_step) + 1
    for ring in range(0, max_rings + 1):
        # Iterate over the perimeter of the ring (ring == 0 → just the origin)
        kx_range = range(-ring, ring + 1)
        ky_range = range(-ring, ring + 1)
        for kx in kx_range:
            for ky in ky_range:
                if ring > 0 and abs(kx) != ring and abs(ky) != ring:
                    continue   # interior of ring — already tested in an earlier ring
                dx = kx * search_step
                dy = ky * search_step
                candidate = shapely_box(
                    icr_x_base + dx,
                    icr_y_base + dy,
                    icr_x_base + dx + ICR_EW,
                    icr_y_base + dy + ICR_NS,
                )
                if usable_poly.contains(candidate):
                    return icr_x_base + dx, icr_y_base + dy

    return None


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def place_icrs(
    placed_tables: List[PlacedTable],
    total_capacity_mwp: float,
    usable_poly: Polygon,
) -> Tuple[List[PlacedTable], List[PlacedICR]]:
    """
    Group tables into 18 MWp blocks (sorted E-W), place one ICR at the
    geometric centroid of each block, then remove overlapping tables.

    Parameters
    ----------
    placed_tables      : all panel tables placed before ICR insertion
    total_capacity_mwp : total plant DC capacity in MWp
    usable_poly        : Shapely polygon of usable area (post road-setback /
                         obstacle removal)

    Returns
    -------
    (remaining_tables, placed_icrs)
    """
    if not placed_tables or total_capacity_mwp <= 0:
        return placed_tables, []

    num_icrs = math.ceil(total_capacity_mwp / ICR_MWP_PER_UNIT)

    # ------------------------------------------------------------------
    # Sort tables by their E-W (X) centre so that spatially adjacent
    # tables group together → each block is a compact vertical strip.
    # ------------------------------------------------------------------
    sorted_tables = sorted(
        placed_tables,
        key=lambda t: (t.x + t.width / 2.0),
    )
    n = len(sorted_tables)

    icrs: List[PlacedICR] = []

    for i in range(num_icrs):
        # Contiguous slice of tables assigned to block i
        start = round(i       * n / num_icrs)
        end   = round((i + 1) * n / num_icrs)
        group = sorted_tables[start:end]

        if not group:
            continue

        # ---- Geometric centroid of this block's table centres ----------
        cx = sum(t.x + t.width  / 2.0 for t in group) / len(group)
        cy = sum(t.y + t.height / 2.0 for t in group) / len(group)

        # ---- Try to place ICR at centroid (N-S search first) ----------
        pos = _find_valid_icr_position(cx, cy, usable_poly)

        # ---- Fallback: 2-D spiral search when centroid is outside -----
        if pos is None:
            pos = _find_valid_icr_position_2d(cx, cy, usable_poly)

        if pos is None:
            continue   # no valid spot found — skip this ICR

        icr_x, icr_y = pos
        icrs.append(PlacedICR(
            x=icr_x, y=icr_y,
            width=ICR_EW, height=ICR_NS,
            index=i + 1,
        ))

    # Re-index sequentially in case any were skipped
    for idx, icr in enumerate(icrs):
        icr.index = idx + 1

    # ------------------------------------------------------------------
    # Remove tables that overlap any ICR footprint
    # ------------------------------------------------------------------
    icr_boxes = [
        shapely_box(icr.x, icr.y, icr.x + icr.width, icr.y + icr.height)
        for icr in icrs
    ]

    remaining: List[PlacedTable] = []
    for tbl in placed_tables:
        tbl_box = shapely_box(tbl.x, tbl.y, tbl.x + tbl.width, tbl.y + tbl.height)
        if not any(tbl_box.intersects(ib) for ib in icr_boxes):
            remaining.append(tbl)

    return remaining, icrs
