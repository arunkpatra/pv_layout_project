"""
Layout engine: places solar panel tables inside the usable plant area (Fixed Tilt only).

Steps:
1.  Project boundary + obstacles from WGS84 to UTM (metres).
2.  Build usable Shapely polygon:
      usable = boundary_shrunk_by_road_width - union(obstacles)
3.  Rows run East-West; panels face South (N hemisphere) or North (S hemisphere).
4.  Fill the usable polygon with table grid sweeping North, placing tables East.
5.  Collect PlacedTable objects and statistics.
"""
from typing import List, Tuple

from shapely.geometry import Polygon, box
from shapely.ops import unary_union

from pvlayout_core.models.project import LayoutParameters, LayoutResult, PlacedTable, M2_PER_ACRE
from pvlayout_core.core.spacing_calc import auto_spacing
from pvlayout_core.core.icr_placer import place_icrs
from pvlayout_core.core.kmz_parser import BoundaryInfo
from pvlayout_core.utils.geo_utils import get_utm_epsg, wgs84_to_utm

TL_SETBACK_M = 15.0   # buffer each side of a line obstruction (TL, canal, etc.)


def _make_valid_poly(p):
    """Repair a self-intersecting Shapely polygon."""
    if p.is_valid:
        return p
    try:
        q = p.buffer(0)
        if q.is_valid and not q.is_empty:
            return q
    except Exception:
        pass
    try:
        from shapely.validation import make_valid as _mv
        q = _mv(p)
        if not q.is_empty:
            return q
    except Exception:
        pass
    return p.convex_hull


def run_layout(
    boundary_wgs84: List[Tuple[float, float]],
    obstacles_wgs84: List[List[Tuple[float, float]]],
    params: LayoutParameters,
    centroid_lat: float,
    centroid_lon: float,
    boundary_name: str = "",
    line_obstructions_wgs84: List[List[Tuple[float, float]]] = None,
    water_obstacles_wgs84: List[List[Tuple[float, float]]] = None,
) -> LayoutResult:
    """Run fixed-tilt layout for a single boundary polygon."""
    result = LayoutResult()
    result.boundary_name = boundary_name
    result.boundary_wgs84 = boundary_wgs84
    # Defensive copies match legacy semantics — the result owns its lists.
    result.obstacle_polygons_wgs84 = list(obstacles_wgs84)
    result.water_obstacle_polygons_wgs84 = list(water_obstacles_wgs84 or [])

    # ------------------------------------------------------------------
    # 1. UTM projection
    # ------------------------------------------------------------------
    epsg = get_utm_epsg(centroid_lon, centroid_lat)
    result.utm_epsg = epsg

    boundary_utm = wgs84_to_utm(boundary_wgs84, epsg)
    obstacles_utm = [wgs84_to_utm(obs, epsg) for obs in obstacles_wgs84]

    boundary_poly = Polygon(boundary_utm)
    result.total_area_m2    = boundary_poly.area
    result.total_area_acres = round(boundary_poly.area / M2_PER_ACRE, 3)

    # ------------------------------------------------------------------
    # 2. Shrink boundary by perimeter road width
    # ------------------------------------------------------------------
    road_w = params.perimeter_road_width
    usable_poly = boundary_poly.buffer(-road_w, join_style=2)

    if usable_poly.is_empty:
        raise ValueError(
            f"Perimeter road width ({road_w} m) is too large — "
            "no usable area remains after setback."
        )

    # ------------------------------------------------------------------
    # 3. Subtract solid obstacles
    # ------------------------------------------------------------------
    if obstacles_utm:
        obs_polys = []
        for o in obstacles_utm:
            if len(o) < 3:
                continue
            op = _make_valid_poly(Polygon(o))
            if not op.is_empty:
                obs_polys.append(op)
        if obs_polys:
            try:
                usable_poly = usable_poly.difference(unary_union(obs_polys))
            except Exception:
                for op in obs_polys:
                    try:
                        usable_poly = usable_poly.difference(op)
                    except Exception:
                        pass

    if usable_poly.is_empty:
        raise ValueError("No usable area remains after subtracting obstacles.")

    # ------------------------------------------------------------------
    # 3a. Subtract water obstacles (ponds, canals, reservoirs)
    # ------------------------------------------------------------------
    if water_obstacles_wgs84:
        w_polys = []
        for wo in [wgs84_to_utm(w, epsg) for w in water_obstacles_wgs84]:
            if len(wo) < 3:
                continue
            wp = _make_valid_poly(Polygon(wo))
            if not wp.is_empty:
                w_polys.append(wp)
        if w_polys:
            try:
                usable_poly = usable_poly.difference(unary_union(w_polys))
            except Exception:
                for wp in w_polys:
                    try:
                        usable_poly = usable_poly.difference(wp)
                    except Exception:
                        pass

    # ------------------------------------------------------------------
    # 3b. Buffer line obstructions (TL, canals, roads) and subtract
    # ------------------------------------------------------------------
    if line_obstructions_wgs84:
        from shapely.geometry import LineString as ShapelyLine
        line_polys_utm = []
        line_polys_wgs84_approx = []
        for line_coords_wgs84 in line_obstructions_wgs84:
            line_utm = wgs84_to_utm(line_coords_wgs84, epsg)
            try:
                sline = ShapelyLine(line_utm)
                buffered = sline.buffer(TL_SETBACK_M, cap_style=2)   # flat caps
                if not buffered.is_empty:
                    line_polys_utm.append(buffered)
            except Exception:
                pass
        if line_polys_utm:
            line_union = unary_union(line_polys_utm)
            usable_poly = usable_poly.difference(line_union)
            # Convert buffered polygons back to WGS84 for visualization
            from pvlayout_core.utils.geo_utils import utm_to_wgs84
            for bp in line_polys_utm:
                try:
                    if bp.geom_type == "Polygon":
                        coords_utm = list(bp.exterior.coords)
                        coords_wgs84 = utm_to_wgs84(coords_utm, epsg)
                        result.obstacle_polygons_wgs84.append(coords_wgs84)
                    elif bp.geom_type == "MultiPolygon":
                        for sub in bp.geoms:
                            coords_utm = list(sub.exterior.coords)
                            coords_wgs84 = utm_to_wgs84(coords_utm, epsg)
                            result.obstacle_polygons_wgs84.append(coords_wgs84)
                except Exception:
                    pass

    result.net_layout_area_m2 = usable_poly.area

    # ------------------------------------------------------------------
    # 4. Table dimensions (E-W width, N-S height)
    # ------------------------------------------------------------------
    module    = params.module
    table_cfg = params.table
    table_w, table_h = table_cfg.table_dimensions(module)

    # ------------------------------------------------------------------
    # 5. Row spacing
    # ------------------------------------------------------------------
    spacing = auto_spacing(
        table_height_m=table_h,
        table_width_m=table_w,
        latitude_deg=centroid_lat,
        design_type="fixed_tilt",
        tilt_deg=params.tilt_angle,
        gcr=params.gcr,
    )

    tilt_deg = spacing["tilt_deg"]
    pitch_m  = spacing["pitch_m"]

    if params.row_spacing is not None:
        pitch_m = params.row_spacing

    result.tilt_angle_deg = tilt_deg
    result.row_pitch_m    = pitch_m
    result.gcr_achieved   = round(table_h / pitch_m, 4) if pitch_m > 0 else 0

    # ------------------------------------------------------------------
    # 6. Place tables — sweep North (Y), then East (X) within each row
    # ------------------------------------------------------------------
    col_step = table_w + params.table_gap_ew
    row_step = pitch_m

    minx, miny, maxx, maxy = usable_poly.bounds

    placed: List[PlacedTable] = []
    row_index = 0
    y = miny
    while y + table_h <= maxy:
        col_index = 0
        x = minx
        while x + table_w <= maxx:
            table_box = box(x, y, x + table_w, y + table_h)
            if usable_poly.contains(table_box):
                placed.append(PlacedTable(
                    x=x, y=y, width=table_w, height=table_h,
                    row_index=row_index, col_index=col_index,
                ))
                col_index += 1
            x += col_step
        if col_index > 0:
            row_index += 1
        y += row_step

    # ------------------------------------------------------------------
    # 7. Initial capacity (before ICR placement)
    # ------------------------------------------------------------------
    modules_per_table = table_cfg.modules_per_table()
    total_modules_pre = len(placed) * modules_per_table
    total_kwp_pre     = total_modules_pre * module.wattage / 1000.0
    total_mwp_pre     = total_kwp_pre / 1000.0

    # ------------------------------------------------------------------
    # 8. Place ICR buildings and remove overlapping tables
    # ------------------------------------------------------------------
    tables_pre_icr = list(placed)   # snapshot before ICR clearance
    placed, icrs   = place_icrs(placed, total_mwp_pre, usable_poly)

    # ------------------------------------------------------------------
    # 9. Final statistics (after ICR clearance)
    # ------------------------------------------------------------------
    total_modules = len(placed) * modules_per_table
    total_kwp     = total_modules * module.wattage / 1000.0

    result.placed_tables      = placed
    result.placed_icrs        = icrs
    result.tables_pre_icr     = tables_pre_icr   # stored for ICR drag recompute
    result.usable_polygon     = usable_poly       # stored for drag validation
    result.boundary_polygon   = boundary_poly    # full boundary (pre-setback) for cable routing
    result.total_modules      = total_modules
    result.total_capacity_kwp = round(total_kwp, 2)
    result.total_capacity_mwp = round(total_kwp / 1000.0, 4)

    return result


def run_layout_multi(
    boundaries: List[BoundaryInfo],
    params: LayoutParameters,
    centroid_lat: float,
    centroid_lon: float,
) -> List[LayoutResult]:
    """Run layout for every boundary in the KMZ file."""
    results = []
    for i, b in enumerate(boundaries):
        name = b.name if b.name else f"Plant {i + 1}"
        try:
            r = run_layout(
                boundary_wgs84=b.coords,
                obstacles_wgs84=b.obstacles,
                params=params,
                centroid_lat=centroid_lat,
                centroid_lon=centroid_lon,
                boundary_name=name,
                line_obstructions_wgs84=b.line_obstructions,
                water_obstacles_wgs84=getattr(b, "water_obstacles", []),
            )
            results.append(r)
        except Exception as exc:
            empty = LayoutResult()
            empty.boundary_name  = f"{name} [ERROR: {exc}]"
            empty.boundary_wgs84 = b.coords
            results.append(empty)
    return results
