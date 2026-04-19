"""
Lightning Arrester (LA) manager.

Placement logic:
  - Each LA has a physical footprint of 40 m (E-W) × 14 m (N-S).
  - Each LA protects a circular area of radius 100 m from its centre.
  - LAs are placed on a regular square grid with spacing = LA_RADIUS (100 m)
    so that adjacent protection circles overlap and every point inside the
    plant boundary is within 100 m of at least one LA.
  - Grid spacing of R guarantees the worst-case gap distance is R*√2/2 ≈ 70.7 m,
    well within the 100 m radius — providing a minimum 29 % coverage overlap.
  - Only grid positions whose centre lies inside usable_polygon are kept.
  - After the grid pass, any table whose centre is > LA_RADIUS from every
    placed LA gets an additional LA placed at the nearest valid position.
  - Any panel table whose footprint overlaps an LA rectangle is removed.
"""
import math
from typing import List, Optional, Tuple

from shapely.geometry import Point as ShapelyPoint
from shapely.geometry import box as shapely_box
from shapely.ops import unary_union

from models.project import (
    LA_EW,
    LA_NS,
    LA_RADIUS,
    LayoutParameters,
    LayoutResult,
    PlacedLA,
)

# Grid spacing = protection radius → overlapping circles, full coverage
GRID_SPACING = LA_RADIUS   # 100 m


def place_lightning_arresters(
    result: LayoutResult,
    params: Optional[LayoutParameters] = None,
) -> None:
    """
    Compute and store LA positions in *result* (in-place).
    Uses result.usable_polygon for boundary checks.

    If *params* is provided, capacity statistics are recalculated after
    removing tables that overlap LA footprints.
    """
    result.placed_las = []
    result.num_las    = 0

    poly = result.usable_polygon
    if poly is None or poly.is_empty:
        return

    minx, miny, maxx, maxy = poly.bounds

    # ---- Step 1: Regular grid pass ----------------------------------------
    # Offset grid so it is centred on the polygon centroid
    try:
        cx0 = poly.centroid.x
        cy0 = poly.centroid.y
    except Exception:
        cx0 = (minx + maxx) / 2
        cy0 = (miny + maxy) / 2

    # Start grid from centroid, expand in both directions to cover bounds
    xs: List[float] = []
    x = cx0
    while x >= minx - GRID_SPACING:
        xs.append(x); x -= GRID_SPACING
    x = cx0 + GRID_SPACING
    while x <= maxx + GRID_SPACING:
        xs.append(x); x += GRID_SPACING

    ys: List[float] = []
    y = cy0
    while y >= miny - GRID_SPACING:
        ys.append(y); y -= GRID_SPACING
    y = cy0 + GRID_SPACING
    while y <= maxy + GRID_SPACING:
        ys.append(y); y += GRID_SPACING

    placed: List[PlacedLA] = []
    idx = 1
    for gx in sorted(xs):
        for gy in sorted(ys):
            # Keep LA whose centre is inside usable polygon
            try:
                inside = poly.contains(ShapelyPoint(gx, gy))
            except Exception:
                inside = False
            if inside:
                placed.append(PlacedLA(
                    x=gx - LA_EW / 2,
                    y=gy - LA_NS / 2,
                    width=LA_EW, height=LA_NS,
                    radius=LA_RADIUS,
                    index=idx,
                ))
                idx += 1

    # ---- Step 2: Coverage check — ensure every table is protected ----------
    def _nearest_la_dist(tx: float, ty: float) -> float:
        if not placed:
            return float("inf")
        return min(
            math.sqrt((la.x + la.width/2 - tx)**2 +
                      (la.y + la.height/2 - ty)**2)
            for la in placed
        )

    def _snap_inside(gx: float, gy: float) -> Tuple[float, float]:
        """Nudge a point that is outside poly to the nearest interior point."""
        try:
            if poly.contains(ShapelyPoint(gx, gy)):
                return gx, gy
            nearest = poly.exterior.interpolate(
                poly.exterior.project(ShapelyPoint(gx, gy)))
            dcx = poly.centroid.x - nearest.x
            dcy = poly.centroid.y - nearest.y
            dist = math.sqrt(dcx**2 + dcy**2) or 1.0
            return (nearest.x + dcx/dist * 0.5,
                    nearest.y + dcy/dist * 0.5)
        except Exception:
            return gx, gy

    for tbl in result.placed_tables:
        t_cx = tbl.x + tbl.width  / 2
        t_cy = tbl.y + tbl.height / 2
        if _nearest_la_dist(t_cx, t_cy) > LA_RADIUS:
            # Place an LA centred on this table's position
            gx, gy = _snap_inside(t_cx, t_cy)
            placed.append(PlacedLA(
                x=gx - LA_EW / 2,
                y=gy - LA_NS / 2,
                width=LA_EW, height=LA_NS,
                radius=LA_RADIUS,
                index=idx,
            ))
            idx += 1

    # Re-index cleanly
    for i, la in enumerate(placed):
        la.index = i + 1

    result.placed_las = placed
    result.num_las    = len(placed)

    # ---- Step 3: Remove tables whose footprint overlaps any LA rectangle ---
    if not placed or not result.placed_tables:
        return

    la_union = unary_union([
        shapely_box(la.x, la.y, la.x + la.width, la.y + la.height)
        for la in placed
    ])

    remaining = []
    for tbl in result.placed_tables:
        tbl_box = shapely_box(tbl.x, tbl.y, tbl.x + tbl.width, tbl.y + tbl.height)
        if not tbl_box.intersects(la_union):
            remaining.append(tbl)

    result.placed_tables = remaining

    # Update capacity stats if params supplied
    if params is not None:
        mpt = params.table.modules_per_table()
        total_modules         = len(remaining) * mpt
        total_kwp             = total_modules * params.module.wattage / 1000.0
        result.total_modules      = total_modules
        result.total_capacity_kwp = round(total_kwp, 2)
        result.total_capacity_mwp = round(total_kwp / 1000.0, 4)
