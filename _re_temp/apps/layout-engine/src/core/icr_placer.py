"""
ICR (Inverter Control Room) placement logic.

Rules:
  - One ICR per 18 MWp of plant capacity  →  num_icrs = ceil(capacity_mwp / 18)
  - ICR dimensions: 40 m (E-W) × 14 m (N-S)
  - Each ICR must be FULLY CONTAINED within the usable polygon
    (boundary already shrunk by perimeter road width).
  - ICRs are distributed evenly along the E-W axis and placed as close
    to the N-S centre of the usable area as possible.
  - Any panel table overlapping an ICR footprint is removed.
"""
import math
from typing import List, Optional, Tuple

from shapely.geometry import Polygon
from shapely.geometry import box as shapely_box

from models.project import (
    ICR_EW,
    ICR_MWP_PER_UNIT,
    ICR_NS,
    PlacedICR,
    PlacedTable,
)


def _find_valid_icr_position(
    cx: float,
    cy: float,
    usable_poly: Polygon,
    search_step: float = 1.0,
    max_search: float = 50.0,
) -> Optional[Tuple[float, float]]:
    """
    Starting from ideal centre (cx, cy), search outward in N-S direction
    until we find a position where the ICR box is fully inside usable_poly.
    Returns bottom-left (x, y) of the valid ICR position, or None if not found.
    """
    icr_x = cx - ICR_EW / 2.0
    icr_y_ideal = cy - ICR_NS / 2.0

    # Search: try ideal first, then spiral N and S
    offsets = [0.0]
    step = search_step
    while step <= max_search:
        offsets.append(step)
        offsets.append(-step)
        step += search_step

    for dy in offsets:
        icr_y = icr_y_ideal + dy
        candidate = shapely_box(icr_x, icr_y, icr_x + ICR_EW, icr_y + ICR_NS)
        if usable_poly.contains(candidate):
            return icr_x, icr_y

    return None


def place_icrs(
    placed_tables: List[PlacedTable],
    total_capacity_mwp: float,
    usable_poly: Polygon,
) -> Tuple[List[PlacedTable], List[PlacedICR]]:
    """
    Place ICR buildings strictly inside the usable area and remove
    overlapping tables.

    Parameters
    ----------
    placed_tables       : list of already-placed panel tables (UTM coords)
    total_capacity_mwp  : total plant capacity in MWp
    usable_poly         : Shapely polygon of usable area (post road-setback,
                          post obstacle removal)

    Returns
    -------
    (remaining_tables, placed_icrs)
    """
    if not placed_tables or total_capacity_mwp <= 0:
        return placed_tables, []

    num_icrs = math.ceil(total_capacity_mwp / ICR_MWP_PER_UNIT)

    # ----------------------------------------------------------------
    # Use usable polygon bounds for zone division
    # ----------------------------------------------------------------
    minx, miny, maxx, maxy = usable_poly.bounds
    usable_width  = maxx - minx
    usable_height = maxy - miny

    # N-S centre of the usable area
    centre_y = miny + usable_height / 2.0

    # Divide usable E-W width into equal zones
    zone_width = usable_width / num_icrs

    icrs: List[PlacedICR] = []
    for i in range(num_icrs):
        # Ideal E-W centre of this zone
        zone_cx = minx + zone_width * i + zone_width / 2.0

        pos = _find_valid_icr_position(zone_cx, centre_y, usable_poly)

        if pos is None:
            # Fallback: try every E-W position within the zone at 1 m steps
            found = False
            x_try = minx + zone_width * i
            while x_try + ICR_EW <= minx + zone_width * (i + 1):
                pos2 = _find_valid_icr_position(
                    x_try + ICR_EW / 2.0, centre_y, usable_poly
                )
                if pos2:
                    pos = pos2
                    found = True
                    break
                x_try += 1.0
            if not found:
                continue   # skip this ICR if no valid spot found

        icr_x, icr_y = pos
        icrs.append(PlacedICR(
            x=icr_x, y=icr_y,
            width=ICR_EW, height=ICR_NS,
            index=i + 1,
        ))

    # Re-index in case any were skipped
    for idx, icr in enumerate(icrs):
        icr.index = idx + 1

    # ----------------------------------------------------------------
    # Remove tables that overlap any ICR footprint
    # ----------------------------------------------------------------
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
