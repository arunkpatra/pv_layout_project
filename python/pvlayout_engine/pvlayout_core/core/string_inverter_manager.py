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
import math
import os
import sys
from typing import Dict, List, Optional, Tuple

from shapely.geometry import LineString as ShapelyLine, Point as ShapelyPoint, box as shapely_box
from shapely.prepared import prep as shapely_prep

from pvlayout_core.models.project import (
    LayoutResult, LayoutParameters, PlacedStringInverter,
    CableRun, ICR_MWP_PER_UNIT, DesignMode,
)

INV_EW = 2.0
INV_NS = 1.0


# ---------------------------------------------------------------------------
# Pattern-stats instrumentation (S11.5 — dormant unless env var set)
# ---------------------------------------------------------------------------
# When ``PVLAYOUT_PATTERN_STATS=1`` is set at process start, every successful
# pattern return in ``_route_ac_cable`` is counted, and every ``_path_ok``
# candidate check is counted per-cable. ``place_string_inverters`` emits a
# one-line summary to stderr after the DC and AC cable loops.
#
# Overhead when disabled: one ``if`` per ``_path_ok`` call and per pattern
# return (no global lookups, no dict mutations) — negligible relative to the
# Shapely intersection work.

_PATTERN_STATS_ENABLED = os.environ.get("PVLAYOUT_PATTERN_STATS") == "1"
_pattern_counts: Dict[str, int] = {}
_path_ok_count = 0
_path_ok_per_cable: List[int] = []

# Module-level transport for the routing quality of the most recent
# ``_route_ac_cable`` call. Set to one of:
#   "ok"                 — resolved via patterns A/A2/A3/A4/B/C/D/E/V (or
#                          the no-polygon shortcut); all segments inside.
#   "best_effort"        — resolved via Pattern F and all segments inside.
#   "boundary_violation" — resolved via Pattern F and at least one segment
#                          leaves the usable polygon, or hit the absolute
#                          straight-line fallback after F's try failed.
# Callers read this immediately after each ``_route_ac_cable`` call and
# copy it onto the produced ``CableRun``. Using a module variable avoids
# changing the function's return type and keeps the edit scope minimal.
_last_route_quality: str = "ok"


# ---------------------------------------------------------------------------
# Pattern V — visibility graph + Dijkstra (S11.5, ADR 0007 amendment)
# ---------------------------------------------------------------------------
# For plants where Manhattan templates A–E can't find an inside-polygon
# route (concave / irregular boundaries), we fall to a textbook
# visibility-graph shortest path BEFORE Pattern F. This guarantees the
# winning route stays inside the polygon by construction, eliminating
# the 34–64 m boundary-violating routes that pre-V Pattern F produces
# on phaseboundary2.
#
# The visibility graph is built lazily: on the first Pattern V hit per
# ``place_string_inverters`` call. All subsequent V hits in the same
# call reuse the cached graph (N² construction amortised across the
# ~15 V cables expected). ``_reset_vis_cache`` is called at the top of
# ``place_string_inverters`` to avoid any stale state from prior calls.
#
# Algorithm: Preparata & Shamos 1985; de Berg et al. Computational
# Geometry ch. 15. Same primitive PVcase / Virto.CAD use under the hood
# for trench-constrained cable routing, here simplified to the polygon
# interior (no user-drawn trench graph).

_vis_cache_key: Optional[int] = None        # id(poly) of cached polygon
_vis_cache_nodes: List[Tuple[float, float]] = []
_vis_cache_adj: List[List[Tuple[int, float]]] = []
_vis_cache_prepared = None                   # shapely prepared geometry for fast contains


def _reset_vis_cache() -> None:
    global _vis_cache_key, _vis_cache_nodes, _vis_cache_adj, _vis_cache_prepared
    _vis_cache_key = None
    _vis_cache_nodes = []
    _vis_cache_adj = []
    _vis_cache_prepared = None


def _build_boundary_vis_graph(poly) -> None:
    """Populate the module-level visibility graph for ``poly``.

    Nodes: polygon exterior vertices + interior-ring (hole) vertices,
    de-duplicated by rounded coordinates (3 decimal places = 1 mm).
    Edges: pairs whose straight segment is covered by the polygon
    (inside or on boundary). Weight = Euclidean length.

    Uses ``shapely.prepared.prep`` — repeat ``covers(line)`` checks are
    ~5–10× faster than the unprepared equivalent. The prepared geometry
    is cached and reused for terminal-visibility lookups in
    ``_visible_neighbors``.
    """
    global _vis_cache_key, _vis_cache_nodes, _vis_cache_adj, _vis_cache_prepared

    seen: set = set()
    nodes: List[Tuple[float, float]] = []

    def _add(x: float, y: float) -> None:
        k = (round(x, 3), round(y, 3))
        if k not in seen:
            seen.add(k)
            nodes.append((x, y))

    # ``usable_polygon`` may be a ``Polygon`` or a ``MultiPolygon`` —
    # large plants with perimeter setbacks or deep concavities often
    # split the usable area into disjoint components. Collect boundary
    # rings from all components.
    sub_polys = list(getattr(poly, "geoms", [])) or [poly]
    for sub in sub_polys:
        # Exterior ring — drop the duplicated closing vertex
        for x, y in list(sub.exterior.coords)[:-1]:
            _add(x, y)
        # Interior rings (obstacle holes inside this component)
        for ring in sub.interiors:
            for x, y in list(ring.coords)[:-1]:
                _add(x, y)

    prepared = shapely_prep(poly)
    n = len(nodes)
    adj: List[List[Tuple[int, float]]] = [[] for _ in range(n)]

    for i in range(n):
        u = nodes[i]
        for j in range(i + 1, n):
            v = nodes[j]
            seg = ShapelyLine([u, v])
            # ``covers`` accepts segments that lie on the boundary (like
            # consecutive exterior vertices) in addition to strictly
            # interior segments. ``contains`` would reject them. For a
            # visibility graph we want the inclusive version.
            if prepared.covers(seg):
                w = math.hypot(v[0] - u[0], v[1] - u[1])
                adj[i].append((j, w))
                adj[j].append((i, w))

    _vis_cache_key = id(poly)
    _vis_cache_nodes = nodes
    _vis_cache_adj = adj
    _vis_cache_prepared = prepared


def _ensure_vis_graph(poly) -> None:
    """Lazy builder — rebuilds only if the cached polygon differs."""
    if _vis_cache_key != id(poly):
        _build_boundary_vis_graph(poly)


def _dijkstra(
    adj: List[List[Tuple[int, float]]],
    start_idx: int,
    end_idx: int,
) -> Optional[List[int]]:
    """Heap-based single-source shortest path (Dijkstra). Returns the
    list of node indices from ``start_idx`` to ``end_idx``, or ``None``
    if unreachable. O((V + E) log V).
    """
    import heapq
    n = len(adj)
    dist = [math.inf] * n
    prev = [-1] * n
    dist[start_idx] = 0.0
    pq: List[Tuple[float, int]] = [(0.0, start_idx)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == end_idx:
            break
        if d > dist[u]:
            continue
        for v, w in adj[u]:
            nd = d + w
            if nd < dist[v]:
                dist[v] = nd
                prev[v] = u
                heapq.heappush(pq, (nd, v))
    if dist[end_idx] == math.inf:
        return None
    path: List[int] = []
    u = end_idx
    while u != -1:
        path.append(u)
        u = prev[u]
    path.reverse()
    return path


def _visible_neighbors(
    point: Tuple[float, float],
) -> List[Tuple[int, float]]:
    """Return (cached_node_index, distance) for every cached node
    visible from ``point`` via the cached prepared polygon. Used to
    connect per-cable terminals (inverter / ICR) to the cached
    boundary-only visibility graph.
    """
    result: List[Tuple[int, float]] = []
    if _vis_cache_prepared is None:
        return result
    for i, v in enumerate(_vis_cache_nodes):
        seg = ShapelyLine([point, v])
        if _vis_cache_prepared.covers(seg):
            w = math.hypot(v[0] - point[0], v[1] - point[1])
            result.append((i, w))
    return result


def _build_route_polygon(result):
    """Construct the polygon used by Pattern V's visibility graph.

    Start from ``result.boundary_wgs84`` (the original plant-fence
    polygon in WGS84), project to UTM using ``result.utm_epsg``, and
    subtract hard cable-obstacles (ICR footprints and any obstacle
    polygons supplied with the boundary). This domain is wider than
    ``result.usable_polygon`` — it includes the perimeter-road area,
    which is inside the plant fence and is where physical cables lie.

    On plants where ``usable_polygon`` is a MultiPolygon split by
    narrow-neck perimeter setbacks, this reconstructed ``route_poly``
    is usually a single contiguous polygon; Pattern V can then route
    between components that were previously disjoint in ``usable``.

    Returns ``None`` if inputs are missing or projection fails; callers
    must fall back to ``usable`` (which means Pattern V behaves as it
    did pre-ADR-0007-amendment).
    """
    try:
        from shapely.geometry import Polygon as _ShapelyPoly, box as _shapely_box
        from pvlayout_core.utils.geo_utils import wgs84_to_utm as _to_utm

        if not getattr(result, "boundary_wgs84", None):
            return None
        epsg = getattr(result, "utm_epsg", 0)
        if not epsg:
            return None
        coords_utm = _to_utm(list(result.boundary_wgs84), epsg)
        if len(coords_utm) < 3:
            return None
        poly = _ShapelyPoly(coords_utm)
        if not poly.is_valid:
            # Attempt to repair self-intersecting rings; buffer(0) is the
            # standard shapely trick. If it still fails, skip Pattern V.
            poly = poly.buffer(0)
            if not poly.is_valid or poly.is_empty:
                return None
        # Subtract ICR footprints — cables physically cannot pass through
        # the ICR building (they terminate inside it, but the building
        # interior isn't a pass-through route for other cables). ICRs are
        # small rectangles (40×14 m) and never sit at narrow-neck points,
        # so subtracting them almost never splits the polygon.
        for icr in getattr(result, "placed_icrs", []) or []:
            box = _shapely_box(icr.x, icr.y, icr.x + icr.width, icr.y + icr.height)
            poly = poly.difference(box)
            if poly.is_empty:
                return None
        # Obstacle polygons (``obstacle_polygons_wgs84``) are NOT subtracted.
        # They mark regions where TABLES cannot be placed (canals, buildings,
        # trees). Cables, by contrast, can route around or through these at
        # ground / trench level — routing AROUND an obstacle is standard EPC
        # practice. Subtracting them here would falsely split the route
        # polygon and force cables outside the plant fence (as observed on
        # phaseboundary2: obstacle[2] splits the boundary into 3 pieces).
        # The obstacle-avoidance geometry happens at detailed-engineering
        # stage, not here.
        if poly.is_empty:
            return None
        return poly
    except Exception:
        return None


def _route_visibility(
    start: Tuple[float, float],
    end: Tuple[float, float],
    poly,
) -> Optional[List[Tuple[float, float]]]:
    """Inside-polygon route via visibility graph + Dijkstra.

    Returns a polyline (straight segments between visibility nodes)
    that stays inside ``poly`` by construction. Returns ``None`` if
    no path exists (disconnected components in the polygon, or if
    either terminal sees no boundary vertex — shouldn't happen on a
    valid plant boundary).
    """
    _ensure_vis_graph(poly)

    s = _safe_pt(start, poly)
    e = _safe_pt(end, poly)

    # Direct visibility short-circuit — most inverter/ICR pairs on
    # convex sub-regions of the polygon resolve here without running
    # Dijkstra at all.
    if _vis_cache_prepared is not None:
        direct = ShapelyLine([s, e])
        if _vis_cache_prepared.covers(direct):
            return [s, e]

    s_nbrs = _visible_neighbors(s)
    e_nbrs = _visible_neighbors(e)
    if not s_nbrs or not e_nbrs:
        return None

    n = len(_vis_cache_nodes)
    # Extend a copy of the cached adjacency with two new nodes for s and e.
    # We never mutate the cache itself; each cable gets a fresh extension.
    adj: List[List[Tuple[int, float]]] = [list(nbrs) for nbrs in _vis_cache_adj]
    for j, w in s_nbrs:
        adj[j].append((n, w))
    adj.append(list(s_nbrs))          # index n = s
    for j, w in e_nbrs:
        adj[j].append((n + 1, w))
    adj.append(list(e_nbrs))          # index n+1 = e

    idx_path = _dijkstra(adj, n, n + 1)
    if idx_path is None:
        return None

    pts: List[Tuple[float, float]] = []
    for idx in idx_path:
        if idx == n:
            pts.append(s)
        elif idx == n + 1:
            pts.append(e)
        else:
            pts.append(_vis_cache_nodes[idx])
    return pts


def _reset_pattern_stats() -> None:
    global _path_ok_count
    _pattern_counts.clear()
    _path_ok_per_cable.clear()
    _path_ok_count = 0


def _record_pattern(name: str) -> None:
    """Record a pattern hit. No-op unless stats are enabled."""
    if _PATTERN_STATS_ENABLED:
        _pattern_counts[name] = _pattern_counts.get(name, 0) + 1


def _emit_pattern_stats(label: str, cable_count: int) -> None:
    """Emit a one-line stats summary to stderr. No-op unless enabled."""
    if not _PATTERN_STATS_ENABLED:
        return
    patterns_str = ", ".join(f"{k}={v}" for k, v in sorted(_pattern_counts.items()))
    total = sum(_path_ok_per_cable)
    max_per_cable = max(_path_ok_per_cable) if _path_ok_per_cable else 0
    sys.stderr.write(
        f"[PVLAYOUT_PATTERN_STATS] {label}: cables={cable_count} "
        f"patterns={{{patterns_str}}} "
        f"path_ok_total={total:,} path_ok_max_per_cable={max_per_cable:,}\n"
    )
    sys.stderr.flush()


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
    if _PATTERN_STATS_ENABLED:
        global _path_ok_count
        _path_ok_count += 1
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
    route_poly=None,
) -> List[Tuple[float, float]]:
    """
    Route from start (inverter) to end (ICR centre) using only H/V segments
    that lie strictly inside poly.  Always returns a non-empty route.

    S11.5: search-space caps on patterns A2/A3/A4/B/E (per ADR 0007, ported
    from the 2026-04-20 review-package validated on a peer plant — see
    ``docs/superpowers/specs/2026-04-24-s11_5-cable-calc-requirements.md``
    §1.4). Pattern order, geometry, and A/C/D/F are unchanged.

    S11.5 (ADR 0007 amendment): ``route_poly`` — optional override for
    Pattern V's visibility graph. Patterns A–F validate against ``poly``
    (the table-setback usable polygon). Pattern V validates against
    ``route_poly`` when provided (typically the plant boundary minus
    hard obstacles — includes perimeter-road area that's outside
    ``poly`` but inside the plant fence). When ``None``, V falls back
    to using ``poly``. This matters when ``poly`` is a MultiPolygon
    with disjoint components — Pattern V on the contiguous
    ``route_poly`` can bridge the components; V on a disjoint ``poly``
    cannot find a path.

    Side effect: sets module-level ``_last_route_quality`` to
    ``"ok" | "best_effort" | "boundary_violation"``. Callers read it
    immediately after each invocation (see ``place_string_inverters``).
    """
    global _last_route_quality
    _last_route_quality = "ok"

    if poly is None:
        _record_pattern("no_poly")
        return [start, end]

    s = _safe_pt(start, poly)
    e = _safe_pt(end,   poly)

    mid_y = (s[1] + e[1]) / 2.0
    mid_x = (s[0] + e[0]) / 2.0

    # S11.5 pruning caps (ADR 0007). Chosen to match the review-package
    # peer-plant values validated at 0.95 % AC-length delta / bit-identical
    # counts. Keeping them as named constants makes the intent auditable and
    # lets remediation §3.2 (iii) bump A4 to 8 × 8 if boundary_violation > 5 %.
    A2_A3_NEAREST_COLS = 8
    A4_NEAREST_COLS    = 5
    B_NEAREST_GAPS     = 8
    E_SINGLE_WAYPOINTS = 15
    E_TWO_WAYPOINT_MAX = 10  # skip O(N²) sweep entirely if |wps| > this

    # ---- Pattern A: V→H→V via single row gap --------------------------------
    for gy in sorted(gap_ys, key=lambda y: abs(y - mid_y)):
        path = [s, (s[0], gy), (e[0], gy), e]
        if _path_ok(path, poly):
            _record_pattern("A")
            return path

    # ---- Pattern A2: H→V→H→V -----------------------------------------------
    # Horizontal escape at the start. Cap to the nearest few column X
    # positions — the candidate path sits at most a few panel widths from
    # ``s[0]``, so scanning all 49+ columns was pure waste (ADR 0007).
    for gy in sorted(gap_ys, key=lambda y: abs(y - mid_y)):
        for tx in sorted(col_xs, key=lambda x: abs(x - s[0]))[:A2_A3_NEAREST_COLS]:
            path = [s, (tx, s[1]), (tx, gy), (e[0], gy), e]
            if _path_ok(path, poly):
                _record_pattern("A2")
                return path
        # Also try mid_x as intermediate (2 candidates; always kept).
        for tx in [mid_x, e[0]]:
            path = [s, (tx, s[1]), (tx, gy), (e[0], gy), e]
            if _path_ok(path, poly):
                _record_pattern("A2")
                return path

    # ---- Pattern A3: V→H→V with horizontal escape at end -------------------
    for gy in sorted(gap_ys, key=lambda y: abs(y - mid_y)):
        for tx in sorted(col_xs, key=lambda x: abs(x - e[0]))[:A2_A3_NEAREST_COLS]:
            path = [s, (s[0], gy), (tx, gy), (tx, e[1]), e]
            if _path_ok(path, poly):
                _record_pattern("A3")
                return path

    # ---- Pattern A4: H→V→H→V→H→V (both ends need horizontal escape) -------
    # Nested col sweep capped to 5 × 5 nearest. Was 49 × 49 = 2,401 per gap;
    # now 25. 96× reduction, validated on peer plant at <1 % length delta.
    for gy in sorted(gap_ys, key=lambda y: abs(y - mid_y)):
        nearest_tx_s = sorted(col_xs, key=lambda x: abs(x - s[0]))[:A4_NEAREST_COLS]
        nearest_tx_e = sorted(col_xs, key=lambda x: abs(x - e[0]))[:A4_NEAREST_COLS]
        for tx_s in nearest_tx_s:
            for tx_e in nearest_tx_e:
                path = [s, (tx_s, s[1]), (tx_s, gy), (tx_e, gy), (tx_e, e[1]), e]
                if _path_ok(path, poly):
                    _record_pattern("A4")
                    return path

    # ---- Pattern B: two gaps V→H→V→H→V ------------------------------------
    # Cap main gap sweep to 8 × 8 nearest. 113 × 113 → 64. The inner escape
    # variant keeps its 3 × 3 cap (already present in the pre-S11.5 code).
    nearest_g1 = sorted(gap_ys, key=lambda y: abs(y - s[1]))[:B_NEAREST_GAPS]
    nearest_g2 = sorted(gap_ys, key=lambda y: abs(y - e[1]))[:B_NEAREST_GAPS]
    for g1 in nearest_g1:
        for g2 in nearest_g2:
            if abs(g1 - g2) < 0.5:
                continue
            path = [s, (s[0], g1), (mid_x, g1), (mid_x, g2), (e[0], g2), e]
            if _path_ok(path, poly):
                _record_pattern("B")
                return path
            for tx_s in sorted(col_xs, key=lambda x: abs(x - s[0]))[:3]:
                for tx_e in sorted(col_xs, key=lambda x: abs(x - e[0]))[:3]:
                    path = [s, (tx_s, s[1]), (tx_s, g1), (tx_e, g1), (tx_e, g2), (e[0], g2), e]
                    if _path_ok(path, poly):
                        _record_pattern("B")
                        return path

    # ---- Pattern C: simple L-shapes ----------------------------------------
    for path in [
        [s, (s[0], e[1]), e],
        [s, (e[0], s[1]), e],
    ]:
        if _path_ok(path, poly):
            _record_pattern("C")
            return path

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
                if _path_ok(path, poly):
                    _record_pattern("D")
                    return path
    except Exception:
        pass

    # ---- Pattern E: waypoint search ---------------------------------------
    # Single-waypoint capped to the first E_SINGLE_WAYPOINTS candidates.
    # Two-waypoint sweep (O(N²)) skipped entirely unless |wps| is small
    # (avoids 10k+ path checks on plants with many gaps × cols).
    try:
        cx, cy = poly.centroid.x, poly.centroid.y
        wps = [(cx, cy)]
        for gy in gap_ys:
            for tx in col_xs[::max(1, len(col_xs)//6)]:
                wps.append((tx, gy))
        wps = [_safe_pt(w, poly) for w in wps]
        for w in wps[:E_SINGLE_WAYPOINTS]:
            path = [s, w, e]
            if _path_ok(path, poly):
                _record_pattern("E1")
                return path
        if len(wps) <= E_TWO_WAYPOINT_MAX:
            for w1 in wps:
                for w2 in wps:
                    if w1 == w2:
                        continue
                    path = [s, w1, w2, e]
                    if _path_ok(path, poly):
                        _record_pattern("E2")
                        return path
    except Exception:
        pass

    # ---- Pattern V: visibility-graph shortest path ------------------------
    # Inside-polygon Dijkstra fallback before Pattern F (ADR 0007 amendment).
    # For irregular / concave polygons where Manhattan templates A–E fail
    # to find an inside path, V navigates around concavities via polygon
    # boundary vertices. By construction the returned polyline lies inside
    # ``route_poly`` (or ``poly`` when ``route_poly`` is None), so
    # ``route_quality`` stays ``"ok"``. Deviates from strict Manhattan
    # (straight segments between graph nodes) — accepted trade-off for
    # correctness over aesthetics.
    v_poly = route_poly if route_poly is not None else poly
    try:
        v_path = _route_visibility(s, e, v_poly)
        if v_path is not None and len(v_path) >= 2:
            _record_pattern("V")
            return v_path
    except Exception:
        pass

    # ---- Pattern F: best-effort (guaranteed connection) --------------------
    # Last resort — candidates may cross the boundary. Score by count of
    # outside-polygon segments. The winning route's ``route_quality`` is
    # ``"best_effort"`` when score == 0 or ``"boundary_violation"`` when > 0;
    # the frontend surfaces the latter with a warning affordance.
    try:
        cx, cy = poly.centroid.x, poly.centroid.y
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

        def _score(path):
            return sum(0 if _seg_ok(path[i], path[i+1], poly) else 1
                       for i in range(len(path)-1))

        best = min(candidates, key=_score)
        best_score = _score(best)
        _last_route_quality = "boundary_violation" if best_score > 0 else "best_effort"
        _record_pattern("F")
        return best
    except Exception:
        pass

    # Absolute fallthrough — F's try block failed. Treat as boundary
    # violation because a straight line through the polygon interior on
    # an irregular shape almost always has at least one outside segment.
    _last_route_quality = "boundary_violation"
    _record_pattern("straight")
    return [s, e]


def _route_length(route: List[Tuple[float, float]]) -> float:
    total = 0.0
    for i in range(len(route) - 1):
        dx = route[i+1][0] - route[i][0]
        dy = route[i+1][1] - route[i][1]
        total += math.sqrt(dx*dx + dy*dy)
    return total


# ---------------------------------------------------------------------------
# DC cable bundling — ported from legacy baseline-v1-20260429 (P0 parity port)
# Source: PVlayout_Advance/core/string_inverter_manager.py:460
# Adaptations:
#   1. Threads route_poly through to _route_ac_cable (preserves Pattern V).
#   2. Uses dc_per_string_allowance_m (S11.5 parameterisation) instead of
#      legacy's hard-coded 10.0 in the per-table fallback path. The +5.0
#      collector / trunk allowances stay as literals (not parameterised
#      this round).
#   3. Captures _last_route_quality on each routed CableRun (S11.5 tagging).
# ---------------------------------------------------------------------------

def _bundle_dc_cables(
    groups: list,
    placed_inverters: list,
    gap_ys: List[float],
    col_xs: List[float],
    usable,
    strings_per_table: int,
    dc_per_string_allowance_m: float,
    route_poly=None,
) -> Tuple[List[CableRun], float]:
    """
    Bundle DC cable runs by row within each inverter cluster.

    For each cluster:
      - Group tables by row Y (1 m rounding tolerance).
      - When >=2 tables share a row AND a straight horizontal path is clear
        of obstacles, emit ONE horizontal collector cable spanning all table
        centres in that row, then ONE trunk cable from the inverter to the
        junction (the table centre in that row nearest the inverter).
      - When the horizontal path is blocked by an obstacle, or there is only
        one table in the row, fall back to routing that table directly to
        the inverter (original per-table behaviour).

    This reduces the drawn cable count from N_tables to ~ 2 x N_rows, which
    dramatically de-clutters the layout while keeping every table
    electrically connected. The trunk length is multiplied by the number of
    tables in the row so that the reported total conductor length remains
    accurate.
    """
    dc_cables: List[CableRun] = []
    total_dc = 0.0
    cable_idx = 0

    for inv_idx, group in enumerate(groups):
        inv = placed_inverters[inv_idx]
        i_cx = inv.x + INV_EW / 2
        i_cy = inv.y + INV_NS / 2

        # Group tables in this cluster by row (1 m tolerance on centre Y)
        row_dict: Dict[int, list] = {}
        for t in group:
            ry = int(round(t.y + t.height / 2))
            row_dict.setdefault(ry, []).append(t)

        for _ry, row_tables in sorted(row_dict.items()):
            row_y = sum(t.y + t.height / 2 for t in row_tables) / len(row_tables)
            sorted_tbls = sorted(row_tables, key=lambda t: t.x + t.width / 2)
            tx_list = [t.x + t.width / 2 for t in sorted_tbls]
            n_tbls = len(sorted_tbls)

            # Junction X: table centre in this row nearest the inverter
            junction_x = min(tx_list, key=lambda x: abs(x - i_cx))
            junction_pt = (junction_x, row_y)

            if n_tbls >= 2:
                left_x, right_x = tx_list[0], tx_list[-1]
                h_route = [(left_x, row_y), (right_x, row_y)]
                h_clear = (usable is None) or _path_ok(h_route, usable)

                if h_clear:
                    # Horizontal collector
                    cable_idx += 1
                    h_len = (right_x - left_x + 5.0) * strings_per_table
                    total_dc += h_len
                    dc_cables.append(CableRun(
                        start_utm=(left_x, row_y), end_utm=(right_x, row_y),
                        route_utm=h_route,
                        index=cable_idx, cable_type="dc",
                        length_m=round(h_len, 1),
                        route_quality="ok",  # straight horizontal, validated
                    ))

                    # Trunk: inverter -> row junction
                    trunk_route = _route_ac_cable(
                        (i_cx, i_cy), junction_pt, gap_ys, col_xs, usable,
                        route_poly=route_poly,
                    )
                    trunk_q = _last_route_quality
                    trunk_len = (_route_length(trunk_route) + 5.0) * n_tbls
                    total_dc += trunk_len
                    cable_idx += 1
                    dc_cables.append(CableRun(
                        start_utm=(i_cx, i_cy), end_utm=junction_pt,
                        route_utm=trunk_route,
                        index=cable_idx, cable_type="dc",
                        length_m=round(trunk_len, 1),
                        route_quality=trunk_q,
                    ))

                else:
                    # Obstacle blocks the horizontal collector -> route each
                    # table individually (same as the original behaviour)
                    for t in sorted_tbls:
                        t_cx = t.x + t.width / 2
                        route = _route_ac_cable(
                            (t_cx, row_y), (i_cx, i_cy), gap_ys, col_xs, usable,
                            route_poly=route_poly,
                        )
                        route_q = _last_route_quality
                        clen = (_route_length(route) + dc_per_string_allowance_m) * strings_per_table
                        total_dc += clen
                        cable_idx += 1
                        dc_cables.append(CableRun(
                            start_utm=(t_cx, row_y), end_utm=(i_cx, i_cy),
                            route_utm=route,
                            index=cable_idx, cable_type="dc",
                            length_m=round(clen, 1),
                            route_quality=route_q,
                        ))

            else:
                # Single table in this row -> route directly to inverter
                t = sorted_tbls[0]
                t_cx = t.x + t.width / 2
                route = _route_ac_cable(
                    (t_cx, row_y), (i_cx, i_cy), gap_ys, col_xs, usable,
                    route_poly=route_poly,
                )
                route_q = _last_route_quality
                clen = (_route_length(route) + dc_per_string_allowance_m) * strings_per_table
                total_dc += clen
                cable_idx += 1
                dc_cables.append(CableRun(
                    start_utm=(t_cx, row_y), end_utm=(i_cx, i_cy),
                    route_utm=route,
                    index=cable_idx, cable_type="dc",
                    length_m=round(clen, 1),
                    route_quality=route_q,
                ))

    return dc_cables, total_dc


# ---------------------------------------------------------------------------
# MST-based AC cable routing — ported from legacy baseline-v1-20260429
# ---------------------------------------------------------------------------

def _build_mst_edges(pts: List[Tuple[float, float]]) -> List[Tuple[int, int]]:
    """
    Prim's Minimum Spanning Tree over *pts* using Manhattan distance.
    Node 0 is the root (ICR centre).
    Returns a list of (parent_idx, child_idx) directed edges.

    Ported verbatim from PVlayout_Advance/core/string_inverter_manager.py:588.
    No adaptations needed - pure graph algorithm, no _route_ac_cable calls.
    """
    n = len(pts)
    if n <= 1:
        return []
    in_tree = [False] * n
    key      = [float('inf')] * n
    parent   = [-1] * n
    key[0]   = 0.0
    edges: List[Tuple[int, int]] = []

    for _ in range(n):
        # Node with smallest key not yet in tree
        u = min((i for i in range(n) if not in_tree[i]), key=lambda i: key[i])
        in_tree[u] = True
        if parent[u] != -1:
            edges.append((parent[u], u))
        ux, uy = pts[u]
        for v in range(n):
            if not in_tree[v]:
                d = abs(pts[v][0] - ux) + abs(pts[v][1] - uy)
                if d < key[v]:
                    key[v] = d
                    parent[v] = u

    return edges


def _route_ac_mst(
    icr_groups: Dict[int, list],
    icr_centers: List[Tuple[float, float]],
    gap_ys: List[float],
    col_xs: List[float],
    usable,
    ac_cable_factor: float,
    ac_termination_allowance_m: float,
    route_poly=None,
) -> Tuple[List[CableRun], float]:
    """
    MST-based AC (or SMB->inverter DC) cable routing.

    For each ICR group, a Minimum Spanning Tree is built over the set
    {ICR centre} U {inverter centres} using Manhattan distance as the
    edge weight. Each MST edge becomes one CableRun.

    Benefits over direct inverter->ICR routing:
      - Nearby inverters share a common cable segment (tree trunk) instead
        of running N parallel wires to the same ICR.
      - Total conductor length is reduced (MST property).
      - Fewer visually distinct routes on the map.

    Ported from PVlayout_Advance/core/string_inverter_manager.py:649.
    Adaptations:
      1. ac_termination_allowance_m parameterised (legacy hard-coded 4.0).
      2. route_poly threaded to _route_ac_cable (S11.5 Pattern V).
      3. _last_route_quality captured on each CableRun.
    """
    ac_cables: List[CableRun] = []
    total_ac  = 0.0
    cable_idx = 0

    for icr_idx, inv_group in icr_groups.items():
        if not inv_group:
            continue
        icr_pt = icr_centers[icr_idx]

        if len(inv_group) == 1:
            # Single inverter - direct route to ICR (no MST needed)
            inv = inv_group[0]
            i_cx = inv.x + INV_EW / 2
            i_cy = inv.y + INV_NS / 2
            route = _route_ac_cable(
                (i_cx, i_cy), icr_pt, gap_ys, col_xs, usable,
                route_poly=route_poly,
            )
            route_q = _last_route_quality
            path_len = _route_length(route)
            clen     = (path_len + ac_termination_allowance_m) * ac_cable_factor
            total_ac += clen
            cable_idx += 1
            ac_cables.append(CableRun(
                start_utm=(i_cx, i_cy), end_utm=icr_pt,
                route_utm=route,
                index=cable_idx, cable_type="ac",
                length_m=round(clen, 1),
                route_quality=route_q,
            ))
            continue

        # Build MST: node 0 = ICR, nodes 1..N = inverters
        inv_pts  = [(inv.x + INV_EW / 2, inv.y + INV_NS / 2) for inv in inv_group]
        all_pts  = [icr_pt] + inv_pts
        mst_edges = _build_mst_edges(all_pts)

        for u_idx, v_idx in mst_edges:
            p_u = all_pts[u_idx]
            p_v = all_pts[v_idx]
            route = _route_ac_cable(
                p_u, p_v, gap_ys, col_xs, usable,
                route_poly=route_poly,
            )
            route_q  = _last_route_quality
            path_len = _route_length(route)
            clen     = (path_len + ac_termination_allowance_m) * ac_cable_factor
            total_ac += clen
            cable_idx += 1
            ac_cables.append(CableRun(
                start_utm=p_u, end_utm=p_v,
                route_utm=route,
                index=cable_idx, cable_type="ac",
                length_m=round(clen, 1),
                route_quality=route_q,
            ))

    return ac_cables, total_ac


def _calc_individual_ac_total(
    icr_groups: Dict[int, list],
    icr_centers: List[Tuple[float, float]],
    gap_ys: List[float],
    col_xs: List[float],
    usable,
    ac_cable_factor: float,
    ac_termination_allowance_m: float,
    route_poly=None,
) -> Tuple[float, Dict[int, float], Dict[int, float]]:
    """
    Compute total AC cable quantity as the SUM of individual routed lengths
    from every inverter (string mode) or SMB (central mode) to its assigned
    ICR.

    Each device gets its own dedicated cable run - no MST trunk sharing.
    This gives the correct bill-of-materials quantity to order.

    Ported from PVlayout_Advance/core/string_inverter_manager.py:620.
    Adaptations:
      1. ac_termination_allowance_m parameterised (legacy hard-coded 4.0).
      2. route_poly threaded to _route_ac_cable (S11.5 Pattern V).
      3. Returns per-inverter and per-ICR subtotals (S11.5 ac_cable_m_per_*
         additions). Legacy returned only the scalar total.
    """
    total = 0.0
    per_inv: Dict[int, float] = {}
    per_icr: Dict[int, float] = {}

    for icr_idx, inv_group in icr_groups.items():
        if not inv_group:
            continue
        icr_pt = icr_centers[icr_idx]
        icr_subtotal = 0.0
        for inv in inv_group:
            i_cx = inv.x + INV_EW / 2
            i_cy = inv.y + INV_NS / 2
            route    = _route_ac_cable(
                (i_cx, i_cy), icr_pt, gap_ys, col_xs, usable,
                route_poly=route_poly,
            )
            path_len = _route_length(route)
            clen     = (path_len + ac_termination_allowance_m) * ac_cable_factor
            total   += clen
            icr_subtotal += clen
            per_inv[inv.index] = round(clen, 1)
        per_icr[icr_idx] = round(icr_subtotal, 1)

    return total, per_inv, per_icr


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def place_string_inverters(result: LayoutResult, params: LayoutParameters) -> None:
    """
    Compute inverter/SMB counts and (optionally) place inverters + route cables.

    When params.enable_cable_calc is True  → full behaviour: k-means clustering,
    physical inverter placement, DC string cables and AC/DC-to-ICR cables.

    When params.enable_cable_calc is False → only the capacity-based counts
    (num_string_inverters, inverter_capacity_kwp, num_central_inverters, …) are
    computed and stored.  Cable arrays are left empty and totals are 0, so the
    summary table columns show "—".  This gives a fast first-pass layout without
    the routing overhead.
    """
    tables = result.placed_tables

    result.placed_string_inverters       = []
    result.dc_cable_runs                 = []
    result.ac_cable_runs                 = []
    result.total_dc_cable_m              = 0.0
    result.total_ac_cable_m              = 0.0
    result.ac_cable_m_per_inverter       = {}
    result.ac_cable_m_per_icr            = {}
    result.string_kwp                    = 0.0
    result.inverter_capacity_kwp         = 0.0
    result.num_string_inverters          = 0
    result.inverters_per_icr             = 0.0
    result.num_central_inverters         = 0
    result.central_inverter_capacity_kwp = 0.0

    if not tables:
        return

    rows_per_table = params.table.rows_per_table
    modules_in_row = params.table.modules_in_row
    wattage        = params.module.wattage
    max_strings    = params.max_strings_per_inverter

    # ------------------------------------------------------------------
    # Capacity-based counts (always computed regardless of cable toggle)
    # ------------------------------------------------------------------
    # inverter_capacity_kwp = capacity of one string inverter (or SMB in CI mode)
    #   = max strings per inverter × kWp per string
    # num_inverters         = Plant DC capacity ÷ inverter capacity
    # inverters_per_icr     = 18 MWp ÷ inverter capacity  (informational)
    string_kwp            = modules_in_row * wattage / 1000.0
    strings_per_table     = rows_per_table
    inverter_capacity_kwp = max_strings * string_kwp
    num_inverters         = (
        math.ceil(result.total_capacity_kwp / inverter_capacity_kwp)
        if inverter_capacity_kwp > 0 else 0
    )
    inverters_per_icr     = (
        (ICR_MWP_PER_UNIT * 1000.0) / inverter_capacity_kwp
        if inverter_capacity_kwp > 0 else 0.0
    )

    result.string_kwp            = round(string_kwp, 3)
    result.inverter_capacity_kwp = round(inverter_capacity_kwp, 2)
    result.num_string_inverters  = num_inverters
    result.inverters_per_icr     = round(inverters_per_icr, 1)

    # Central Inverter counts (computed here so they are always available,
    # independent of whether cable routing is enabled)
    if (params.design_mode == DesignMode.CENTRAL_INVERTER
            and params.max_smb_per_central_inv > 0
            and inverter_capacity_kwp > 0):
        central_inv_cap = round(inverter_capacity_kwp * params.max_smb_per_central_inv, 2)
        result.central_inverter_capacity_kwp = central_inv_cap
        result.num_central_inverters = (
            math.ceil(num_inverters / params.max_smb_per_central_inv)
            if params.max_smb_per_central_inv > 0 else 0
        )

    # ------------------------------------------------------------------
    # Cable routing — skipped when enable_cable_calc is False
    # ------------------------------------------------------------------
    if not params.enable_cable_calc:
        # Counts are already stored above; leave cable arrays empty.
        return

    # S11.5 (Pattern V): clear any stale visibility graph left over from
    # a prior place_string_inverters call. The graph is rebuilt lazily
    # on the first Pattern V hit below.
    _reset_vis_cache()

    # ---- Cluster tables → inverter / SMB positions -----------------------
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

    # ---- DC cable runs (table → inverter/SMB) ----------------------------
    gap_ys = _get_row_gap_ys(tables)
    col_xs = _get_col_xs(tables)
    usable = result.usable_polygon

    # S11.5 (ADR 0007 amendment): compute a "route polygon" for Pattern V's
    # visibility graph. ``usable_polygon`` is the table-setback polygon —
    # it can be a disjoint MultiPolygon on plants where the perimeter road
    # / ICR setbacks split the plant into narrow-neck regions, in which
    # case inside-``usable`` routing is impossible between components. The
    # physical plant boundary (``result.boundary_wgs84`` projected to UTM)
    # minus hard obstacles (ICR footprints, obstacle polygons) is the
    # correct domain for cable routing — includes the perimeter road
    # area, which is inside the plant fence and where cables actually lie.
    # Patterns A–F continue to use ``usable`` (stays close to row gaps);
    # only Pattern V uses ``route_poly``.
    route_poly = _build_route_polygon(result)

    # Table → inverter map. Unused after P0 Task 6 (bundled DC routing no
    # longer needs per-table lookup), but kept intentionally — removing is
    # out of P0 scope. See docs/parity/plans/p00-quick-win-port.md §Task-6.
    tbl_to_inv = {}
    for inv_idx, group in enumerate(groups):
        for t in group:
            tbl_to_inv[id(t)] = placed_inverters[inv_idx]

    # S11.5 (Phase D): allowance constants are now parameterised on
    # ``LayoutParameters`` with defaults preserving pre-S11.5 numbers.
    dc_per_string_allowance_m = params.dc_per_string_allowance_m
    ac_termination_allowance_m = params.ac_termination_allowance_m

    # ---- DC cable runs — row-bundled (table → inverter), legacy parity ---
    # Uses _bundle_dc_cables(): one horizontal collector per row per cluster
    # + one trunk per row to the inverter. Per legacy baseline-v1-20260429.
    # S11.5 additions preserved: route_poly threaded to _route_ac_cable so
    # Pattern V remains available; allowance parameterised; route_quality tagged.
    if _PATTERN_STATS_ENABLED:
        _reset_pattern_stats()
    dc_cables, total_dc = _bundle_dc_cables(
        groups, placed_inverters,
        gap_ys, col_xs, usable,
        strings_per_table,
        dc_per_string_allowance_m,
        route_poly=route_poly,
    )
    result.dc_cable_runs    = dc_cables
    result.total_dc_cable_m = round(total_dc, 1)
    if _PATTERN_STATS_ENABLED:
        _emit_pattern_stats("DC", len(dc_cables))

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

    # ---- AC/DC cable runs (inverter/SMB → assigned ICR) -------------------
    # In Central Inverter mode the SMB→ICR cable is a DC run that requires
    # BOTH a positive and a negative conductor, so the total conductor length
    # is 2 × the route length.  In String Inverter mode the run is a single
    # AC cable, so no multiplier is needed.
    ac_cable_factor = 2.0 if params.design_mode == DesignMode.CENTRAL_INVERTER else 1.0

    # ---- AC/DC cable runs — MST-based visual + individual-routed quantity ----
    # Visual routes (ac_cable_runs): MST so nearby inverters share trunks.
    # Quantity (total_ac_cable_m): sum of individual routes per inverter →ICR.
    # Per legacy baseline-v1-20260429 (split visual vs quantity).
    if _PATTERN_STATS_ENABLED:
        _reset_pattern_stats()

    # Visual: MST tree, each edge a CableRun.
    ac_cables, _mst_total = _route_ac_mst(
        icr_groups, icr_centers,
        gap_ys, col_xs, usable,
        ac_cable_factor,
        ac_termination_allowance_m,
        route_poly=route_poly,
    )
    result.ac_cable_runs = ac_cables

    # Quantity: every inverter individually routed; sum gives BOM length.
    # Returns per-ICR / per-inverter subtotals (S11.5 Phase E).
    total_ac, ac_m_per_inverter, ac_m_per_icr = _calc_individual_ac_total(
        icr_groups, icr_centers,
        gap_ys, col_xs, usable,
        ac_cable_factor,
        ac_termination_allowance_m,
        route_poly=route_poly,
    )
    result.total_ac_cable_m = round(total_ac, 1)
    result.ac_cable_m_per_inverter = ac_m_per_inverter
    result.ac_cable_m_per_icr = ac_m_per_icr

    if _PATTERN_STATS_ENABLED:
        _emit_pattern_stats("AC", len(ac_cables))
