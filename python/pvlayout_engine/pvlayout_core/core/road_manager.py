"""
Road manager: recomputes panel table placement after internal roads are added,
moved, or removed.

A road is stored as a polygon in UTM coordinates. Any table that overlaps
a road or ICR is removed. The computation always restarts from
result.tables_pre_icr so roads and ICRs are applied together cleanly.
"""
from typing import List

from shapely.geometry import box as shapely_box, Polygon
from shapely.ops import unary_union

from pvlayout_core.models.project import LayoutResult, PlacedRoad, LayoutParameters


def recompute_tables(result: LayoutResult, params: LayoutParameters) -> None:
    """
    Recompute result.placed_tables starting from result.tables_pre_icr,
    excluding areas covered by any road or ICR.
    Also updates capacity stats in-place.
    """
    if not result.tables_pre_icr:
        return

    # Build exclusion union: roads + ICRs
    exclusion_shapes = []

    for road in result.placed_roads:
        try:
            poly = Polygon(road.points_utm)
            if poly.is_valid and not poly.is_empty:
                exclusion_shapes.append(poly)
        except Exception:
            pass

    for icr in result.placed_icrs:
        exclusion_shapes.append(
            shapely_box(icr.x, icr.y, icr.x + icr.width, icr.y + icr.height)
        )

    if exclusion_shapes:
        exclusion = unary_union(exclusion_shapes)
    else:
        exclusion = None

    remaining = []
    for tbl in result.tables_pre_icr:
        tbl_box = shapely_box(tbl.x, tbl.y, tbl.x + tbl.width, tbl.y + tbl.height)
        if exclusion is None or not tbl_box.intersects(exclusion):
            remaining.append(tbl)

    result.placed_tables = remaining

    # Update capacity stats
    if params:
        mpt           = params.table.modules_per_table()
        total_modules = len(remaining) * mpt
        total_kwp     = total_modules * params.module.wattage / 1000.0
        result.total_modules      = total_modules
        result.total_capacity_kwp = round(total_kwp, 2)
        result.total_capacity_mwp = round(total_kwp / 1000.0, 4)


def add_road(result: LayoutResult, params: LayoutParameters,
             points_utm: List, road_type: str = "rectangle") -> PlacedRoad:
    """Add a new road polygon to result and recompute tables."""
    idx  = len(result.placed_roads) + 1
    road = PlacedRoad(points_utm=points_utm, index=idx, road_type=road_type)
    result.placed_roads.append(road)
    recompute_tables(result, params)
    return road


def remove_last_road(result: LayoutResult, params: LayoutParameters) -> bool:
    """Remove the most recently added road and recompute."""
    if not result.placed_roads:
        return False
    result.placed_roads.pop()
    # Re-index
    for i, r in enumerate(result.placed_roads):
        r.index = i + 1
    recompute_tables(result, params)
    return True


def clear_roads(result: LayoutResult, params: LayoutParameters) -> None:
    """Remove all roads and recompute tables."""
    result.placed_roads.clear()
    recompute_tables(result, params)
