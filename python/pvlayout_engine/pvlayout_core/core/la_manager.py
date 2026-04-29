"""
Lightning Arrester (LA) manager.

Fixed-tilt placement logic:
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

Single Axis Tracker (SAT) placement logic — identical grid logic as fixed tilt:
  - LA footprint is 1 m × 1 m (diameter 1 m pole/mast marker).
  - The same 100 m × 100 m grid is used (identical anchor + spacing to FT).
  - Each grid X position is snapped to the nearest E-W inter-row gap centre
    so that the LA pole sits in the gap between tracker columns, never on
    a tracker unit.
  - Duplicate (snapped_x, gy) pairs from different grid X values converging
    on the same gap are deduplicated — the LA count stays comparable to FT.
  - Coverage check (Step 2) and re-index run identically to fixed tilt.
  - No tracker units are removed (Step 3 is skipped for SAT).
"""
import math
from typing import List, Optional, Set, Tuple

from shapely.geometry import Point as ShapelyPoint, box as shapely_box
from shapely.ops import unary_union

from pvlayout_core.models.project import (
    LayoutResult, LayoutParameters,
    PlacedLA, PlacedTable, LA_EW, LA_NS, LA_RADIUS,
    DesignType,
)

# Grid spacing = protection radius → overlapping circles, full coverage
GRID_SPACING = LA_RADIUS   # 100 m

# For Single Axis Tracker layouts the LA is a pole/mast, not a building.
# Use a 1 m × 1 m footprint (diameter = 1 m) so no tracker units are displaced.
LA_SAT_W = 1.0   # metres (E-W)
LA_SAT_H = 1.0   # metres (N-S)


# ---------------------------------------------------------------------------
# Shared helper: build the standard 100 m × 100 m grid over a polygon
# ---------------------------------------------------------------------------

def _build_grid(poly) -> Tuple[List[float], List[float]]:
    """Return (xs, ys) — two sorted lists of 100 m grid coordinates
    centred on the polygon centroid and extended to cover its bounding box."""
    minx, miny, maxx, maxy = poly.bounds
    try:
        cx0 = poly.centroid.x
        cy0 = poly.centroid.y
    except Exception:
        cx0 = (minx + maxx) / 2.0
        cy0 = (miny + maxy) / 2.0

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

    return sorted(xs), sorted(ys)


# ---------------------------------------------------------------------------
# SAT helper: derive E-W inter-row gap centres from placed tracker tables
# ---------------------------------------------------------------------------

def _sat_gap_x_centers(tables: List[PlacedTable]) -> List[float]:
    """
    Return X coordinates of the midpoint of each E-W gap between adjacent
    tracker row columns.

    Steps:
      1. Round each table's left-edge X to 0.1 m and collect unique values.
      2. Cluster nearby values (within 0.5 m) to handle floating-point scatter.
      3. For each consecutive pair of clusters compute:
             gap_cx = (right_edge_of_left_col + left_edge_of_right_col) / 2
    """
    if not tables:
        return []

    raw = sorted(set(round(t.x, 1) for t in tables))

    # Cluster: merge values within 0.5 m
    clusters: List[float] = []
    for rx in raw:
        if not clusters or rx - clusters[-1] > 0.5:
            clusters.append(rx)

    # Representative width per cluster
    col_width: dict = {}
    for t in tables:
        closest = min(clusters, key=lambda c: abs(t.x - c))
        if closest not in col_width:
            col_width[closest] = t.width

    gap_xs: List[float] = []
    for i in range(len(clusters) - 1):
        c_left  = clusters[i]
        c_right = clusters[i + 1]
        right_edge = c_left + col_width.get(c_left, 0.0)
        left_edge  = c_right
        gap_xs.append((right_edge + left_edge) / 2.0)

    return gap_xs


# ---------------------------------------------------------------------------
# Shared helper: nudge a point to the nearest interior point of poly
# ---------------------------------------------------------------------------

def _snap_inside(gx: float, gy: float, poly) -> Tuple[float, float]:
    """Nudge a point that is outside poly to the nearest interior point."""
    try:
        if poly.contains(ShapelyPoint(gx, gy)):
            return gx, gy
        nearest = poly.exterior.interpolate(
            poly.exterior.project(ShapelyPoint(gx, gy)))
        dcx = poly.centroid.x - nearest.x
        dcy = poly.centroid.y - nearest.y
        dist = math.sqrt(dcx ** 2 + dcy ** 2) or 1.0
        return (nearest.x + dcx / dist * 0.5,
                nearest.y + dcy / dist * 0.5)
    except Exception:
        return gx, gy


def place_lightning_arresters(
    result: LayoutResult,
    params: Optional[LayoutParameters] = None,
) -> None:
    """
    Compute and store LA positions in *result* (in-place).

    Both SAT and fixed-tilt use the same 100 m × 100 m grid logic.
    The only differences for SAT are:
      • Each grid X is snapped to the nearest inter-row gap centre.
      • LA footprint is 1 m × 1 m (pole marker) instead of 40 × 14 m.
      • No tracker units are removed (Step 3 skipped).
    """
    result.placed_las = []
    result.num_las    = 0

    poly = result.usable_polygon
    if poly is None or poly.is_empty:
        return

    is_sat = (result.design_type == DesignType.SINGLE_AXIS_TRACKER)

    # ── Choose footprint size ──────────────────────────────────────────────────
    la_w = LA_SAT_W if is_sat else LA_EW
    la_h = LA_SAT_H if is_sat else LA_NS

    # ── For SAT: derive inter-row gap X centres ────────────────────────────────
    gap_xs: List[float] = []
    if is_sat:
        gap_xs = _sat_gap_x_centers(result.placed_tables)
        if not gap_xs:
            # Only one tracker column (or no tables) — use polygon centroid X
            try:
                gap_xs = [poly.centroid.x]
            except Exception:
                minx, _, maxx, _ = poly.bounds
                gap_xs = [(minx + maxx) / 2.0]

    # ── Step 1: 100 m × 100 m grid pass ───────────────────────────────────────
    xs, ys = _build_grid(poly)

    placed: List[PlacedLA] = []
    seen:   Set[Tuple[float, float]] = set()   # dedup key for SAT snapping
    idx = 1

    for gx in xs:
        # SAT: snap grid X to nearest inter-row gap; FT: use grid X as-is
        place_x = min(gap_xs, key=lambda gapx: abs(gapx - gx)) if is_sat else gx

        for gy in ys:
            key = (round(place_x, 2), round(gy, 2))
            if key in seen:
                continue   # already added by a different grid column

            try:
                inside = poly.contains(ShapelyPoint(place_x, gy))
            except Exception:
                inside = False

            if inside:
                seen.add(key)
                placed.append(PlacedLA(
                    x=place_x - la_w / 2,
                    y=gy      - la_h / 2,
                    width=la_w, height=la_h,
                    radius=LA_RADIUS,
                    index=idx,
                ))
                idx += 1

    # ── Step 2: Coverage check — same logic for both SAT and FT ───────────────
    def _nearest_la_dist(tx: float, ty: float) -> float:
        if not placed:
            return float("inf")
        return min(
            math.sqrt((la.x + la.width  / 2 - tx) ** 2 +
                      (la.y + la.height / 2 - ty) ** 2)
            for la in placed
        )

    for tbl in result.placed_tables:
        t_cx = tbl.x + tbl.width  / 2
        t_cy = tbl.y + tbl.height / 2
        if _nearest_la_dist(t_cx, t_cy) > LA_RADIUS:
            if is_sat:
                # Snap to nearest gap X then nudge inside poly
                best_gx = min(gap_xs, key=lambda gx: abs(gx - t_cx))
                sx, sy  = _snap_inside(best_gx, t_cy, poly)
            else:
                sx, sy = _snap_inside(t_cx, t_cy, poly)

            key = (round(sx, 2), round(sy, 2))
            if key not in seen:
                seen.add(key)
                placed.append(PlacedLA(
                    x=sx - la_w / 2,
                    y=sy - la_h / 2,
                    width=la_w, height=la_h,
                    radius=LA_RADIUS,
                    index=idx,
                ))
                idx += 1

    # Re-index cleanly
    for i, la in enumerate(placed):
        la.index = i + 1

    result.placed_las = placed
    result.num_las    = len(placed)

    # ── Step 3: Remove tables overlapping LA footprint (fixed tilt only) ──────
    if is_sat:
        return   # SAT: LA is a 1 m pole — no trackers displaced

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
        total_modules             = len(remaining) * mpt
        total_kwp                 = total_modules * params.module.wattage / 1000.0
        result.total_modules      = total_modules
        result.total_capacity_kwp = round(total_kwp, 2)
        result.total_capacity_mwp = round(total_kwp / 1000.0, 4)
