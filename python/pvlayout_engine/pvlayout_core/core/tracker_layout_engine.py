"""
Single Axis Tracker (SAT / HSAT) Layout Engine
===============================================
Places horizontal single-axis tracker units inside the plant boundary.

Tracker geometry
----------------
  • Rotation axis runs **North–South** (torque tube is a N-S line).
  • Panels sweep **East–West** (tracker rotates ±max_angle from horizontal).
  • Each "tracker unit" placed as a PlacedTable:
        width  = E-W aperture  = tracker_modules_across × module.width
        height = N-S length    = tracker_modules_per_string × module.length
  • Tracker rows (multiple units end-to-end N-S) are spaced E-W:
        E-W pitch = aperture_width / GCR
  • A service gap separates successive tracker units within the same N-S row:
        N-S step = tracker_ns_length + tracker_ns_gap_m

The layout sweep is the mirror of fixed-tilt:
  Fixed tilt: outer loop = N-S (rows), inner loop = E-W (tables in row)
  SAT       : outer loop = E-W (tracker row columns), inner loop = N-S (units in column)
"""
from typing import List, Tuple

from shapely.geometry import Polygon, box
from shapely.ops import unary_union

from pvlayout_core.models.project import (
    LayoutParameters, LayoutResult, PlacedTable, TableConfig,
    DesignType, M2_PER_ACRE,
)
from pvlayout_core.core.icr_placer import place_icrs
from pvlayout_core.core.kmz_parser import BoundaryInfo
from pvlayout_core.utils.geo_utils import get_utm_epsg, wgs84_to_utm

TL_SETBACK_M = 15.0   # setback each side of line obstructions


def _make_valid_poly(p):
    """Repair a self-intersecting Shapely polygon (same logic as layout_engine)."""
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


def run_layout_tracker(
    boundary_wgs84: List[Tuple[float, float]],
    obstacles_wgs84: List[List[Tuple[float, float]]],
    params: LayoutParameters,
    centroid_lat: float,
    centroid_lon: float,
    boundary_name: str = "",
    line_obstructions_wgs84: List[List[Tuple[float, float]]] = None,
    water_obstacles_wgs84: List[List[Tuple[float, float]]] = None,
) -> LayoutResult:
    """
    Run Single Axis Tracker layout for one boundary polygon.
    Returns a LayoutResult with PlacedTable objects representing tracker units.
    """
    result = LayoutResult()
    result.boundary_name  = boundary_name
    result.design_type    = DesignType.SINGLE_AXIS_TRACKER
    result.boundary_wgs84 = boundary_wgs84
    result.obstacle_polygons_wgs84      = list(obstacles_wgs84)
    result.water_obstacle_polygons_wgs84 = list(water_obstacles_wgs84 or [])

    # ------------------------------------------------------------------
    # 1. UTM projection
    # ------------------------------------------------------------------
    epsg = get_utm_epsg(centroid_lon, centroid_lat)
    result.utm_epsg = epsg

    boundary_utm  = wgs84_to_utm(boundary_wgs84, epsg)
    obstacles_utm = [wgs84_to_utm(obs, epsg) for obs in obstacles_wgs84]

    boundary_poly = _make_valid_poly(Polygon(boundary_utm))
    if boundary_poly.geom_type == "MultiPolygon":
        boundary_poly = max(boundary_poly.geoms, key=lambda g: g.area)

    result.total_area_m2    = boundary_poly.area
    result.total_area_acres = round(boundary_poly.area / M2_PER_ACRE, 3)

    # ------------------------------------------------------------------
    # 2. Perimeter road setback
    # ------------------------------------------------------------------
    road_w = params.perimeter_road_width
    try:
        usable_poly = boundary_poly.buffer(-road_w, join_style=2)
    except Exception:
        usable_poly = boundary_poly.convex_hull.buffer(-road_w, join_style=2)

    if usable_poly.is_empty:
        raise ValueError(
            f"Perimeter road width ({road_w} m) leaves no usable area."
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
            if op.geom_type == "MultiPolygon":
                op = max(op.geoms, key=lambda g: g.area)
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

    # ------------------------------------------------------------------
    # 3a. Subtract water obstacles
    # ------------------------------------------------------------------
    if water_obstacles_wgs84:
        w_polys = []
        for wo in [wgs84_to_utm(w, epsg) for w in water_obstacles_wgs84]:
            if len(wo) < 3:
                continue
            wp = _make_valid_poly(Polygon(wo))
            if wp.geom_type == "MultiPolygon":
                wp = max(wp.geoms, key=lambda g: g.area)
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
    # 3b. Buffer line obstructions (TL, canals) and subtract
    # ------------------------------------------------------------------
    if line_obstructions_wgs84:
        from shapely.geometry import LineString as _LS
        line_polys = []
        for lc in line_obstructions_wgs84:
            line_utm = wgs84_to_utm(lc, epsg)
            try:
                sline   = _LS(line_utm)
                buffered = sline.buffer(TL_SETBACK_M, cap_style=2)
                if not buffered.is_empty:
                    line_polys.append(buffered)
            except Exception:
                pass
        if line_polys:
            line_union = unary_union(line_polys)
            usable_poly = usable_poly.difference(line_union)
            from pvlayout_core.utils.geo_utils import utm_to_wgs84
            for bp in line_polys:
                try:
                    if bp.geom_type == "Polygon":
                        result.obstacle_polygons_wgs84.append(
                            utm_to_wgs84(list(bp.exterior.coords), epsg)
                        )
                    elif bp.geom_type == "MultiPolygon":
                        for sub in bp.geoms:
                            result.obstacle_polygons_wgs84.append(
                                utm_to_wgs84(list(sub.exterior.coords), epsg)
                            )
                except Exception:
                    pass

    result.net_layout_area_m2 = usable_poly.area

    # ------------------------------------------------------------------
    # 4. Tracker unit dimensions
    #
    #  Orientation determines which module edge runs N-S (along the tube):
    #    Portrait  (P): long side (module.length) runs N-S,
    #                   short side (module.width) runs E-W
    #    Landscape (L): short side (module.width) runs N-S,
    #                   long side  (module.length) runs E-W
    #
    #  E-W aperture  = modules_across × mod_ew
    #  N-S unit span = strings_per_tracker × modules_per_string × mod_ns
    # ------------------------------------------------------------------
    module = params.module
    # Orientation convention:
    #   Portrait  (P): module long side (length) runs E-W across the aperture
    #   Landscape (L): module long side (length) runs N-S along the torque tube
    portrait = (params.tracker_orientation.lower() != "landscape")
    mod_ew = module.length if portrait else module.width    # E-W dim per module
    mod_ns = module.width  if portrait else module.length   # N-S dim per module

    trk_w  = params.tracker_modules_across * mod_ew                          # E-W aperture (m)
    trk_ns = (params.tracker_strings_per_tracker *
              params.tracker_modules_per_string * mod_ns)                     # N-S length  (m)

    if trk_w <= 0 or trk_ns <= 0:
        raise ValueError("Tracker dimensions must be positive.")

    # ------------------------------------------------------------------
    # 5. Row spacing — user specifies E-W pitch directly
    # ------------------------------------------------------------------
    pitch_ew = max(trk_w + 0.5, params.tracker_pitch_ew_m)   # must be > aperture
    ns_step  = trk_ns + params.tracker_ns_gap_m               # N-S step inside one row

    result.tilt_angle_deg = params.tracker_max_angle_deg      # max rotation angle stored here
    result.row_pitch_m    = round(pitch_ew, 3)
    result.gcr_achieved   = round(trk_w / pitch_ew, 4) if pitch_ew > 0 else 0

    # ------------------------------------------------------------------
    # 6. Place tracker units
    #    Outer loop: E-W  (x = tracker row column index)
    #    Inner loop: N-S  (y = position within the N-S column)
    # ------------------------------------------------------------------
    minx, miny, maxx, maxy = usable_poly.bounds

    placed: List[PlacedTable] = []
    col_ew = 0          # which E-W tracker column (used as row_index)
    x = minx
    while x + trk_w <= maxx:
        col_ns = 0      # N-S position within this column (used as col_index)
        y = miny
        while y + trk_ns <= maxy:
            trk_box = box(x, y, x + trk_w, y + trk_ns)
            if usable_poly.contains(trk_box):
                placed.append(PlacedTable(
                    x=x, y=y,
                    width=trk_w, height=trk_ns,
                    row_index=col_ew,
                    col_index=col_ns,
                ))
                col_ns += 1
            y += ns_step
        col_ew += 1
        x += pitch_ew

    # ------------------------------------------------------------------
    # 7. Initial capacity
    # ------------------------------------------------------------------
    modules_per_unit = (params.tracker_modules_across *
                        params.tracker_strings_per_tracker *
                        params.tracker_modules_per_string)
    total_modules_pre = len(placed) * modules_per_unit
    total_kwp_pre     = total_modules_pre * module.wattage / 1000.0
    total_mwp_pre     = total_kwp_pre / 1000.0

    # ------------------------------------------------------------------
    # 8. ICR placement (same logic as fixed-tilt)
    # ------------------------------------------------------------------
    tables_pre_icr = list(placed)
    placed, icrs   = place_icrs(placed, total_mwp_pre, usable_poly)

    # ------------------------------------------------------------------
    # 9. Final statistics (after ICR clearance)
    # ------------------------------------------------------------------
    total_modules = len(placed) * modules_per_unit
    total_kwp     = total_modules * module.wattage / 1000.0

    # Map tracker config onto LayoutParameters.table so downstream cable /
    # inverter code (place_string_inverters) can compute strings_per_table.
    #
    # For a tracker unit:
    #   • One string = modules_per_string modules in one N-S column.
    #   • strings_per_tracker strings share the torque-tube unit.
    #   • modules_across additional parallel columns (E-W).
    # Total strings per tracker unit = strings_per_tracker × modules_across.
    # We map: rows_per_table = total strings/unit (for inverter sizing).
    total_strings_per_unit = (params.tracker_strings_per_tracker *
                              params.tracker_modules_across)
    params.table = TableConfig(
        modules_in_row=params.tracker_modules_per_string,
        rows_per_table=max(1, total_strings_per_unit),
    )

    result.placed_tables      = placed
    result.placed_icrs        = icrs
    result.tables_pre_icr     = tables_pre_icr
    result.usable_polygon     = usable_poly
    result.boundary_polygon   = boundary_poly     # full boundary (pre-setback) for cable routing
    result.total_modules      = total_modules
    result.total_capacity_kwp = round(total_kwp, 2)
    result.total_capacity_mwp = round(total_kwp / 1000.0, 4)

    return result
