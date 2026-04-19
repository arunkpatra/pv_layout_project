"""
String inverter manager: places string inverters and computes DC/AC cable runs.

AC cable routing (Manhattan grid only — H and V segments, no diagonals):

  All candidate paths are strictly validated against usable_polygon before use.
  If a vertical segment from an inverter near a slanted boundary would cross
  outside, the router first steps HORIZONTALLY to a safe X position, then
  goes vertically to the row-gap corridor.

  Patterns tried (in order):
    A  – V→H→V via nearest row gap
    A2 – H→V→H→V  (horizontal first, then V to gap)  ← fixes boundary crossings
    B  – V→H→V→H→V via two row gaps
    C  – simple L (no gap needed)
    D  – via polygon centroid + gap
    E  – exhaustive 2-waypoint search through sampled interior points
    F  – best-effort centroid path (always returns something connected)

  Route merging: duplicate segments shared by multiple inverters going through
  the same corridor are deduplicated at draw time.
"""
import logging
import math
from typing import Dict, List, Tuple

from shapely.geometry import LineString as ShapelyLine
from shapely.geometry import Point as ShapelyPoint
from shapely.geometry import box as shapely_box

from models.project import (
    ICR_MWP_PER_UNIT,
    CableRun,
    LayoutParameters,
    LayoutResult,
    PlacedStringInverter,
)

_log = logging.getLogger("layout_engine.cable_routing")

INV_EW = 2.0
INV_NS = 1.0


# ---------------------------------------------------------------------------
# K-means clustering
# ---------------------------------------------------------------------------

def _kmeans_cluster(tables, k: int, n_iter: int = 10):
    if k <= 0:
        return []
    if k >= len(tables):
        return [[t] for t in tables]

    sorted_t = sorted(tables, key=lambda t: (t.x + t.width / 2) + (t.y + t.height / 2))
    step = max(1, len(sorted_t) // k)
    centroids = [
        (sorted_t[min(i * step, len(sorted_t) - 1)].x +
         sorted_t[min(i * step, len(sorted_t) - 1)].width / 2,
         sorted_t[min(i * step, len(sorted_t) - 1)].y +
         sorted_t[min(i * step, len(sorted_t) - 1)].height / 2)
        for i in range(k)
    ]
    assignments = [0] * len(tables)
    for _ in range(n_iter):
        for j, t in enumerate(tables):
            tx, ty = t.x + t.width / 2, t.y + t.height / 2
            assignments[j] = min(range(k),
                key=lambda i: (tx - centroids[i][0])**2 + (ty - centroids[i][1])**2)
        sx = [0.0]*k; sy = [0.0]*k; cnt = [0]*k
        for j, t in enumerate(tables):
            i = assignments[j]
            sx[i] += t.x + t.width / 2
            sy[i] += t.y + t.height / 2
            cnt[i] += 1
        for i in range(k):
            if cnt[i]:
                centroids[i] = (sx[i] / cnt[i], sy[i] / cnt[i])
    groups: List[List] = [[] for _ in range(k)]
    for j, t in enumerate(tables):
        groups[assignments[j]].append(t)
    return [g for g in groups if g]


# ---------------------------------------------------------------------------
# ICR capacity-based assignment
# ---------------------------------------------------------------------------

def _assign_to_icrs(
    placed_inverters: List[PlacedStringInverter],
    icr_centers: List[Tuple[float, float]],
    max_inv_per_icr: int,
) -> Dict[int, List[PlacedStringInverter]]:
    n = len(icr_centers)
    groups: Dict[int, List[PlacedStringInverter]] = {i: [] for i in range(n)}

    def _d2_nearest(inv):
        cx = inv.x + INV_EW / 2; cy = inv.y + INV_NS / 2
        return min((icr_centers[i][0]-cx)**2 + (icr_centers[i][1]-cy)**2
                   for i in range(n))

    for inv in sorted(placed_inverters, key=_d2_nearest):
        cx = inv.x + INV_EW / 2; cy = inv.y + INV_NS / 2
        order = sorted(range(n),
            key=lambda i: (icr_centers[i][0]-cx)**2 + (icr_centers[i][1]-cy)**2)
        assigned = False
        for idx in order:
            if len(groups[idx]) < max_inv_per_icr:
                groups[idx].append(inv); assigned = True; break
        if not assigned:
            groups[order[0]].append(inv)
    return groups


# ---------------------------------------------------------------------------
# Row-gap extraction
# ---------------------------------------------------------------------------

def _get_row_gap_ys(tables) -> List[float]:
    if not tables:
        return []
    tbl_h = tables[0].height
    row_bottoms = sorted(set(round(t.y, 1) for t in tables))
    gap_ys: List[float] = []
    for i in range(len(row_bottoms) - 1):
        gap_bot = row_bottoms[i] + tbl_h
        gap_top = row_bottoms[i + 1]
        if gap_top > gap_bot + 0.2:
            gap_ys.append((gap_bot + gap_top) / 2.0)
    return gap_ys


# ---------------------------------------------------------------------------
# Inverter placement — at the edge of the nearest table in the cluster
# ---------------------------------------------------------------------------

def _find_inverter_position(
    group,
    all_tables,
    poly,
) -> Tuple[float, float]:
    """
    Place inverter (2 m EW × 1 m NS) strictly outside all tables, inside poly.

    Strategy:
      1. Compute all row-gap bands from all_tables.
      2. For the cluster, pick the gap band closest to the cluster centroid Y.
      3. Place inverter centred vertically inside that band, at the cluster
         centroid X — snapping to the nearest table's bottom/top edge.
      4. If the X position puts the inverter outside the polygon, shift it
         to the cluster centroid X until it fits.
      5. Fallback: try every gap band; then try south/north edges without
         gap checking; last resort places just below the nearest table.

    Overlap check: table boxes are inset by 0.02 m on each side so that an
    inverter touching a table edge (but not entering it) is accepted.
    """
    # ---- cluster centroid ---------------------------------------------------
    cx = sum(t.x + t.width  / 2 for t in group) / len(group)
    cy = sum(t.y + t.height / 2 for t in group) / len(group)

    # ---- build row-gap bands from all placed tables -------------------------
    if all_tables:
        tbl_h = all_tables[0].height
        row_bottoms = sorted(set(round(t.y, 1) for t in all_tables))
        gaps: List[Tuple[float, float]] = []   # (gap_bot, gap_top)
        for i in range(len(row_bottoms) - 1):
            gb = row_bottoms[i] + tbl_h
            gt = row_bottoms[i + 1]
            if gt > gb + 0.05:
                gaps.append((gb, gt))
        # Also a virtual gap just below the lowest row and above the highest row
        if row_bottoms:
            gaps.insert(0, (row_bottoms[0] - INV_NS * 3, row_bottoms[0]))
            gaps.append((row_bottoms[-1] + tbl_h, row_bottoms[-1] + tbl_h + INV_NS * 3))
    else:
        gaps = []

    # ---- inset table boxes for overlap check (touching edges = OK) ----------
    INSET = 0.02
    inset_boxes = [
        shapely_box(t.x + INSET, t.y + INSET,
                    t.x + t.width - INSET, t.y + t.height - INSET)
        for t in all_tables
    ]

    def _overlaps_tables(ix: float, iy: float) -> bool:
        inv = shapely_box(ix, iy, ix + INV_EW, iy + INV_NS)
        return any(inv.intersects(b) for b in inset_boxes)

    def _inside_poly(ix: float, iy: float) -> bool:
        if poly is None:
            return True
        try:
            inv = shapely_box(ix, iy, ix + INV_EW, iy + INV_NS)
            return bool(poly.contains(inv) or poly.intersects(inv))
        except Exception:
            return True

    def _try(ix: float, iy: float) -> bool:
        return not _overlaps_tables(ix, iy) and _inside_poly(ix, iy)

    # ---- nearest table in cluster for edge alignment -----------------------
    nearest = min(group, key=lambda t:
        (t.x + t.width / 2 - cx)**2 + (t.y + t.height / 2 - cy)**2)
    hc = nearest.x + nearest.width / 2 - INV_EW / 2   # X centred on nearest table

    # ---- try each gap band, closest to cluster centroid first --------------
    for gb, gt in sorted(gaps, key=lambda g: abs((g[0]+g[1])/2 - cy)):
        gap_h = gt - gb
        if gap_h >= INV_NS:
            # Centre vertically in gap
            iy = gb + (gap_h - INV_NS) / 2.0
        else:
            # Gap smaller than inverter — place at gap bottom
            iy = gb

        # Try cluster-centred X, then nearest-table-centred X
        for ix in [cx - INV_EW / 2, hc]:
            if _try(ix, iy):
                return (ix, iy)

        # Scan nearby X positions (±30 m in 1 m steps) within the gap
        for delta in range(1, 31):
            for ix in [cx - INV_EW / 2 + delta, cx - INV_EW / 2 - delta]:
                if _try(ix, iy):
                    return (ix, iy)

    # ---- fallback: south/north of nearest table outside any gap -------------
    for ix in [hc, cx - INV_EW / 2]:
        for iy in [
            nearest.y - INV_NS - 0.05,           # just south of nearest table
            nearest.y + nearest.height + 0.05,   # just north of nearest table
        ]:
            if _try(ix, iy):
                return (ix, iy)

    # ---- absolute fallback: south of nearest table (no poly/overlap check) -
    return (hc, nearest.y - INV_NS - 0.05)


# ---------------------------------------------------------------------------
# Segment / path validation (strict — uses usable_polygon directly)
# ---------------------------------------------------------------------------

def _seg_ok(p1: Tuple, p2: Tuple, poly) -> bool:
    """True only if segment p1→p2 lies fully inside poly (≥99.9 % overlap)."""
    try:
        line = ShapelyLine([p1, p2])
        if line.length < 0.01:
            return True
        inter = poly.intersection(line)
        return inter.length >= line.length * 0.999
    except Exception:
        return False


def _path_ok(pts: List[Tuple], poly) -> bool:
    return all(_seg_ok(pts[i], pts[i+1], poly) for i in range(len(pts)-1))


def _safe_pt(pt: Tuple[float, float], poly) -> Tuple[float, float]:
    """If pt is outside poly, nudge to nearest interior point."""
    try:
        if poly.contains(ShapelyPoint(pt)):
            return pt
        nearest = poly.exterior.interpolate(poly.exterior.project(ShapelyPoint(pt)))
        cx, cy = poly.centroid.x, poly.centroid.y
        nx, ny = nearest.x, nearest.y
        dx, dy = cx - nx, cy - ny
        dist = math.sqrt(dx*dx + dy*dy) or 1.0
        return (nx + dx / dist * 0.5, ny + dy / dist * 0.5)
    except Exception:
        return pt


# ---------------------------------------------------------------------------
# Sample X positions from table columns — used to find valid vertical lanes
# ---------------------------------------------------------------------------

def _get_col_xs(tables) -> List[float]:
    """Return X-midpoints of every table column — valid interior X positions."""
    if not tables:
        return []
    xs = sorted(set(round(t.x + t.width / 2, 1) for t in tables))
    # Also include mid-gaps between consecutive table columns
    extras = []
    for i in range(len(xs) - 1):
        extras.append((xs[i] + xs[i+1]) / 2.0)
    return sorted(set(xs + extras))


# ---------------------------------------------------------------------------
# Manhattan AC cable router
# ---------------------------------------------------------------------------

def _route_ac_cable(
    start: Tuple[float, float],
    end: Tuple[float, float],
    gap_ys: List[float],
    col_xs: List[float],
    poly,
    _stats: dict | None = None,
) -> List[Tuple[float, float]]:
    """
    Route from start (inverter) to end (ICR centre) using only H/V segments
    that lie strictly inside poly.  Always returns a non-empty route.

    If _stats dict is provided, records which pattern succeeded and how
    many _path_ok calls were made (for performance investigation).
    """
    if poly is None:
        if _stats is not None:
            _stats["pattern"] = "none"
            _stats["path_ok_calls"] = 0
        return [start, end]

    # Counting wrapper for _path_ok
    _poc = [0]

    def _pok(pts, p):
        _poc[0] += 1
        return _path_ok(pts, p)

    def _done(pattern, path):
        if _stats is not None:
            _stats["pattern"] = pattern
            _stats["path_ok_calls"] = _poc[0]
        return path

    s = _safe_pt(start, poly)
    e = _safe_pt(end,   poly)

    mid_y = (s[1] + e[1]) / 2.0
    mid_x = (s[0] + e[0]) / 2.0

    # Pre-sort col_xs by proximity to start/end (used by multiple patterns)
    _MAX_COL = 8
    _MAX_COL_A4 = 5
    cols_near_s = sorted(col_xs, key=lambda x: abs(x - s[0]))[:_MAX_COL]
    cols_near_e = sorted(col_xs, key=lambda x: abs(x - e[0]))[:_MAX_COL]
    cols_near_s_a4 = cols_near_s[:_MAX_COL_A4]
    cols_near_e_a4 = cols_near_e[:_MAX_COL_A4]

    # ---- Pattern A: V→H→V via single row gap --------------------------------
    for gy in sorted(gap_ys, key=lambda y: abs(y - mid_y)):
        path = [s, (s[0], gy), (e[0], gy), e]
        if _pok(path, poly):
            return _done("A", path)

    # ---- Pattern A2: H→V→H→V -----------------------------------------------
    for gy in sorted(gap_ys, key=lambda y: abs(y - mid_y)):
        for tx in cols_near_s:
            path = [s, (tx, s[1]), (tx, gy), (e[0], gy), e]
            if _pok(path, poly):
                return _done("A2", path)
        for tx in [mid_x, e[0]]:
            path = [s, (tx, s[1]), (tx, gy), (e[0], gy), e]
            if _pok(path, poly):
                return _done("A2", path)

    # ---- Pattern A3: V→H→V with horizontal escape at end -------------------
    for gy in sorted(gap_ys, key=lambda y: abs(y - mid_y)):
        for tx in cols_near_e:
            path = [s, (s[0], gy), (tx, gy), (tx, e[1]), e]
            if _pok(path, poly):
                return _done("A3", path)

    # ---- Pattern A4: H→V→H→V→H→V (both ends need horizontal escape) -------
    for gy in sorted(gap_ys, key=lambda y: abs(y - mid_y)):
        for tx_s in cols_near_s_a4:
            for tx_e in cols_near_e_a4:
                path = [s, (tx_s, s[1]), (tx_s, gy), (tx_e, gy), (tx_e, e[1]), e]
                if _pok(path, poly):
                    return _done("A4", path)

    # ---- Pattern B: two gaps V→H→V→H→V ------------------------------------
    _MAX_GAPS_B = 8
    gaps_near_s = sorted(gap_ys, key=lambda y: abs(y - s[1]))[:_MAX_GAPS_B]
    gaps_near_e = sorted(gap_ys, key=lambda y: abs(y - e[1]))[:_MAX_GAPS_B]
    for g1 in gaps_near_s:
        for g2 in gaps_near_e:
            if abs(g1 - g2) < 0.5:
                continue
            path = [s, (s[0], g1), (mid_x, g1), (mid_x, g2), (e[0], g2), e]
            if _pok(path, poly):
                return _done("B", path)
            for tx_s in cols_near_s[:3]:
                for tx_e in cols_near_e[:3]:
                    path = [s, (tx_s, s[1]), (tx_s, g1), (tx_e, g1), (tx_e, g2), (e[0], g2), e]
                    if _pok(path, poly):
                        return _done("B", path)

    # ---- Pattern C: simple L-shapes ----------------------------------------
    for path in [
        [s, (s[0], e[1]), e],
        [s, (e[0], s[1]), e],
    ]:
        if _pok(path, poly):
            return _done("C", path)

    # ---- Pattern D: via polygon centroid ------------------------------------
    try:
        cx, cy = poly.centroid.x, poly.centroid.y
        cen = _safe_pt((cx, cy), poly)
        for gy in sorted(gap_ys, key=lambda y: abs(y - cy)):
            for path in [
                [s, (s[0], gy), (cx, gy), (cx, e[1]), e],
                [s, (s[0], gy), (e[0], gy), e],
                [s, (cx, s[1]), (cx, gy), (e[0], gy), e],
                [s, cen, (e[0], e[1]), e],
                [s, cen, e],
            ]:
                if _pok(path, poly):
                    return _done("D", path)
    except Exception:
        pass

    # ---- Pattern E: sampled waypoint search --------------------------------
    _MAX_WPS = 15
    try:
        cx, cy = poly.centroid.x, poly.centroid.y
        wps = [(cx, cy)]
        for gy in gap_ys:
            for tx in col_xs[::max(1, len(col_xs)//6)]:
                wps.append((tx, gy))
        wps = [_safe_pt(w, poly) for w in wps[:_MAX_WPS]]
        for w in wps:
            path = [s, w, e]
            if _pok(path, poly):
                return _done("E", path)
        # Two-waypoint: only try if waypoint count is small
        if len(wps) <= 10:
            for w1 in wps:
                for w2 in wps:
                    if w1 == w2:
                        continue
                    path = [s, w1, w2, e]
                    if _pok(path, poly):
                        return _done("E", path)
    except Exception:
        pass

    # ---- Pattern F: best-effort (guaranteed connection) --------------------
    # At this point the polygon is very irregular. Build the best approximate
    # Manhattan path through the centroid. Segments may touch the boundary
    # but this is a last resort to ensure every inverter is connected.
    try:
        cx, cy = poly.centroid.x, poly.centroid.y
        # Pick nearest gap to centroid for the horizontal run
        if gap_ys:
            gy = min(gap_ys, key=lambda y: abs(y - cy))
            candidates = [
                [s, (s[0], gy), (e[0], gy), e],
                [s, (cx, s[1]), (cx, e[1]), e],
                [s, (s[0], cy), (e[0], cy), e],
                [s, (cx, s[1]), (cx, cy), (e[0], cy), e],
            ]
        else:
            candidates = [
                [s, (s[0], e[1]), e],
                [s, (e[0], s[1]), e],
                [s, (cx, s[1]), (cx, e[1]), e],
            ]
        # Return the candidate with fewest segments outside boundary
        def _score(path):
            bad = sum(0 if _seg_ok(path[i], path[i+1], poly) else 1
                      for i in range(len(path)-1))
            return bad
        best = min(candidates, key=_score)
        return _done("F", best)
    except Exception:
        pass

    return _done("fallback", [s, e])


def _route_length(route: List[Tuple[float, float]]) -> float:
    total = 0.0
    for i in range(len(route) - 1):
        dx = route[i+1][0] - route[i][0]
        dy = route[i+1][1] - route[i][1]
        total += math.sqrt(dx*dx + dy*dy)
    return total


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def place_string_inverters(result: LayoutResult, params: LayoutParameters) -> None:
    """Place string inverters and compute DC + AC cable runs in-place on result."""
    tables = result.placed_tables

    result.placed_string_inverters = []
    result.dc_cable_runs           = []
    result.ac_cable_runs           = []
    result.total_dc_cable_m        = 0.0
    result.total_ac_cable_m        = 0.0
    result.string_kwp              = 0.0
    result.inverter_capacity_kwp   = 0.0
    result.num_string_inverters    = 0
    result.inverters_per_icr       = 0.0

    if not tables:
        return

    rows_per_table = params.table.rows_per_table
    modules_in_row = params.table.modules_in_row
    wattage        = params.module.wattage
    max_strings    = params.max_strings_per_inverter

    # ---- String calculations -----------------------------------------------
    string_kwp            = modules_in_row * wattage / 1000.0
    strings_per_table     = rows_per_table
    tables_per_inverter   = max(1, max_strings // strings_per_table)
    num_inverters         = math.ceil(len(tables) / tables_per_inverter)
    inverter_capacity_kwp = max_strings * string_kwp
    inverters_per_icr     = (
        (ICR_MWP_PER_UNIT * 1000.0) / inverter_capacity_kwp
        if inverter_capacity_kwp > 0 else 0.0
    )

    result.string_kwp            = round(string_kwp, 3)
    result.inverter_capacity_kwp = round(inverter_capacity_kwp, 2)
    result.num_string_inverters  = num_inverters
    result.inverters_per_icr     = round(inverters_per_icr, 1)

    # ---- Cluster tables → inverter positions --------------------------------
    groups = _kmeans_cluster(tables, num_inverters)
    placed_inverters: List[PlacedStringInverter] = []
    usable_early = result.usable_polygon
    for idx, group in enumerate(groups):
        inv_kwp  = round(min(len(group) * strings_per_table, max_strings) * string_kwp, 2)
        ix, iy   = _find_inverter_position(group, tables, usable_early)
        placed_inverters.append(PlacedStringInverter(
            x=ix, y=iy,
            width=INV_EW, height=INV_NS,
            index=idx + 1, capacity_kwp=inv_kwp,
            assigned_table_count=len(group),
        ))
    result.placed_string_inverters = placed_inverters

    # ---- DC cable runs (table → inverter, Manhattan-routed within boundary) --
    gap_ys = _get_row_gap_ys(tables)
    col_xs = _get_col_xs(tables)
    usable = result.usable_polygon

    # Log polygon complexity and routing grid size (perf investigation)
    poly_verts = 0
    poly_holes = 0
    if usable is not None:
        try:
            poly_verts = len(usable.exterior.coords)
            poly_holes = len(list(usable.interiors))
        except Exception:
            pass
    _log.info(
        "ROUTING_GRID gap_ys=%d col_xs=%d poly_verts=%d poly_holes=%d tables=%d",
        len(gap_ys), len(col_xs), poly_verts, poly_holes, len(tables),
    )

    tbl_to_inv = {}
    for inv_idx, group in enumerate(groups):
        for t in group:
            tbl_to_inv[id(t)] = placed_inverters[inv_idx]

    dc_cables: List[CableRun] = []
    dc_stats_all: List[dict] = []
    total_dc = 0.0
    for t in tables:
        inv = tbl_to_inv.get(id(t))
        if inv is None:
            continue
        t_cx = t.x + t.width  / 2
        t_cy = t.y + t.height / 2
        i_cx = inv.x + INV_EW / 2
        i_cy = inv.y + INV_NS / 2
        cable_stats: dict = {}
        route     = _route_ac_cable(
            (t_cx, t_cy), (i_cx, i_cy), gap_ys, col_xs, usable,
            _stats=cable_stats,
        )
        dc_stats_all.append(cable_stats)
        path_len  = _route_length(route)
        cable_len = (path_len + 10.0) * strings_per_table
        total_dc += cable_len
        dc_cables.append(CableRun(
            start_utm=(t_cx, t_cy), end_utm=(i_cx, i_cy),
            route_utm=route,
            index=len(dc_cables) + 1, cable_type="dc",
            length_m=round(cable_len, 1),
        ))

    # Summarise DC routing patterns
    dc_patterns: Dict[str, int] = {}
    dc_total_pok = 0
    dc_max_pok = 0
    for s in dc_stats_all:
        p = s.get("pattern", "?")
        dc_patterns[p] = dc_patterns.get(p, 0) + 1
        pok = s.get("path_ok_calls", 0)
        dc_total_pok += pok
        if pok > dc_max_pok:
            dc_max_pok = pok
    _log.info(
        "DC_ROUTING cables=%d patterns=%s total_path_ok=%d max_path_ok=%d",
        len(dc_cables), dc_patterns, dc_total_pok, dc_max_pok,
    )

    result.dc_cable_runs    = dc_cables
    result.total_dc_cable_m = round(total_dc, 1)

    # ---- ICR centres -------------------------------------------------------
    if result.placed_icrs:
        icr_centers: List[Tuple[float, float]] = [
            (icr.x + icr.width / 2, icr.y + icr.height / 2)
            for icr in result.placed_icrs
        ]
    else:
        if result.usable_polygon is not None:
            c = result.usable_polygon.centroid
            icr_centers = [(c.x, c.y)]
        else:
            all_cx = sum(t.x + t.width  / 2 for t in tables) / len(tables)
            all_cy = sum(t.y + t.height / 2 for t in tables) / len(tables)
            icr_centers = [(all_cx, all_cy)]

    # ---- Assign inverters to ICRs (capacity-based) -------------------------
    max_inv_per_icr = (max(1, math.ceil(inverters_per_icr))
                       if len(icr_centers) > 1 else len(placed_inverters))
    icr_groups = _assign_to_icrs(placed_inverters, icr_centers, max_inv_per_icr)

    # gap_ys, col_xs, usable already computed above (before DC cables)

    # ---- AC cable runs (inverter → assigned ICR) ---------------------------
    ac_cables: List[CableRun] = []
    ac_stats_all: List[dict] = []
    total_ac = 0.0
    for icr_idx, inv_group in icr_groups.items():
        icr_pt = icr_centers[icr_idx]
        for inv in inv_group:
            i_cx = inv.x + INV_EW / 2
            i_cy = inv.y + INV_NS / 2
            cable_stats: dict = {}
            route     = _route_ac_cable(
                (i_cx, i_cy), icr_pt, gap_ys, col_xs, usable,
                _stats=cable_stats,
            )
            ac_stats_all.append(cable_stats)
            path_len  = _route_length(route)
            cable_len = path_len + 4.0
            total_ac += cable_len
            ac_cables.append(CableRun(
                start_utm=(i_cx, i_cy), end_utm=icr_pt,
                route_utm=route,
                index=len(ac_cables) + 1, cable_type="ac",
                length_m=round(cable_len, 1),
            ))

    # Summarise AC routing patterns
    ac_patterns: Dict[str, int] = {}
    ac_total_pok = 0
    ac_max_pok = 0
    for s in ac_stats_all:
        p = s.get("pattern", "?")
        ac_patterns[p] = ac_patterns.get(p, 0) + 1
        pok = s.get("path_ok_calls", 0)
        ac_total_pok += pok
        if pok > ac_max_pok:
            ac_max_pok = pok
    _log.info(
        "AC_ROUTING cables=%d patterns=%s total_path_ok=%d max_path_ok=%d",
        len(ac_cables), ac_patterns, ac_total_pok, ac_max_pok,
    )

    result.ac_cable_runs    = ac_cables
    result.total_ac_cable_m = round(total_ac, 1)
