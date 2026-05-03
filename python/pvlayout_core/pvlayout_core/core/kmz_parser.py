"""
KMZ / KML parser.
Extracts:
  - All plant boundary polygons (top-level polygons not contained within others)
  - Obstacle / exclusion polygons (polygons fully contained within a boundary)
  - The centroid latitude/longitude of all boundaries combined
"""
import zipfile
import xml.etree.ElementTree as ET
from typing import List, Tuple

from shapely.geometry import Polygon

KML_NS = "http://www.opengis.net/kml/2.2"

# ---------------------------------------------------------------------------
# Feature-name classifiers
# ---------------------------------------------------------------------------
_WATER_KEYWORDS = {
    "pond", "lake", "reservoir", "water", "wetland", "swamp", "marsh",
    "waterbody", "water body", "water_body",
}
_CANAL_KEYWORDS = {
    "canal", "channel", "drain", "drainage", "nala", "nallah", "nullah",
    "river", "stream", "creek", "flood",
}
_TL_KEYWORDS = {
    "transmission", "transmissionline", "transmission line",
    "powerline", "power line", "power_line",
    "hv", "hvl", "ehv", "132kv", "220kv", "400kv",
    "tl", "line", "tower", "pylon", "overhead",
}
_OBSTACLE_KEYWORDS = {
    "substation", "sub station", "building", "structure", "tower", "road",
    "railway", "airport", "cemetery", "school", "hospital", "temple", "mosque",
    "church", "government", "setback", "exclusion", "no-go", "avoid",
    "obstruction", "obstacle", "restricted",
}


def _normalise(name: str) -> str:
    """Lower-case, strip extra spaces, remove common separators."""
    return name.lower().replace("_", " ").replace("-", " ").strip()


def _is_water_name(name: str) -> bool:
    """Return True if the Placemark name suggests a water body or canal."""
    n = _normalise(name)
    return (
        any(kw in n for kw in _WATER_KEYWORDS) or
        any(kw in n for kw in _CANAL_KEYWORDS)
    )


def _is_tl_name(name: str) -> bool:
    """Return True if the Placemark name suggests a transmission line / power line."""
    n = _normalise(name)
    return any(kw in n for kw in _TL_KEYWORDS)


def _is_obstacle_name(name: str) -> bool:
    """Return True if the Placemark name suggests a hard obstacle."""
    n = _normalise(name)
    return any(kw in n for kw in _OBSTACLE_KEYWORDS)


def _is_water_boundary(name: str) -> bool:
    """Alias kept for backward compatibility — same as _is_water_name."""
    return _is_water_name(name)


def _tag(name: str) -> str:
    return f"{{{KML_NS}}}{name}"


def _parse_coordinates(coord_text: str) -> List[Tuple[float, float]]:
    coords = []
    for token in coord_text.strip().split():
        parts = token.split(",")
        if len(parts) >= 2:
            lon, lat = float(parts[0]), float(parts[1])
            coords.append((lon, lat))
    return coords


def _get_tree_from_kmz(path: str) -> ET.Element:
    if path.lower().endswith(".kmz"):
        with zipfile.ZipFile(path, "r") as zf:
            kml_names = [n for n in zf.namelist() if n.lower().endswith(".kml")]
            if not kml_names:
                raise ValueError("No .kml file found inside the KMZ archive.")
            with zf.open(kml_names[0]) as f:
                tree = ET.parse(f)
    else:
        tree = ET.parse(path)
    return tree.getroot()


class BoundaryInfo:
    """One plant boundary with its associated obstacles."""
    def __init__(self, name: str, coords: List[Tuple[float, float]]):
        self.name = name
        self.coords = coords               # (lon, lat) ring
        self.obstacles: List[List[Tuple[float, float]]] = []
        self.water_obstacles: List[List[Tuple[float, float]]] = []  # ponds, canals, reservoirs
        self.line_obstructions: List[List[Tuple[float, float]]] = []  # TL, power lines


class KMZParseResult:
    def __init__(self):
        self.boundaries: List[BoundaryInfo] = []
        self.centroid_lat: float = 0.0
        self.centroid_lon: float = 0.0

    def _compute_centroid(self):
        all_coords = [c for b in self.boundaries for c in b.coords]
        if all_coords:
            self.centroid_lon = sum(p[0] for p in all_coords) / len(all_coords)
            self.centroid_lat = sum(p[1] for p in all_coords) / len(all_coords)


def validate_boundaries(path: str) -> list:
    """
    Check only TOP-LEVEL PLANT boundaries for open rings.

    Rules:
      • Water bodies, ponds, obstacles and obstructions are SKIPPED entirely —
        the layout engine auto-repairs any self-intersections in those polygons
        using _make_valid_poly(), so no warning is needed or helpful.
      • Only plant boundaries (non-water, top-level, not contained inside another
        polygon) are validated.
      • For plant boundaries the ONLY fatal error is an OPEN RING (first point ≠
        last point beyond tolerance).  Self-intersecting plant boundaries are also
        auto-repaired by the engine, so they are NOT flagged here.
      • An empty list means everything is OK to proceed.
    """
    import math

    # Tolerance: 0.0001° ≈ 11 m.  Rings with a gap smaller than this are
    # treated as effectively closed (floating-point export artefacts).
    CLOSED_TOL_DEG = 0.0001

    def _gap_metres(dlat, dlon, lat):
        m_per_deg_lat = 111_320.0
        m_per_deg_lon = 111_320.0 * math.cos(math.radians(lat))
        return math.sqrt((dlat * m_per_deg_lat) ** 2 + (dlon * m_per_deg_lon) ** 2)

    # ------------------------------------------------------------------
    # Step 1 — collect all polygons from the KMZ
    # ------------------------------------------------------------------
    root = _get_tree_from_kmz(path)
    all_polys = []   # (name, coords)
    for placemark in root.iter(_tag("Placemark")):
        name_el = placemark.find(_tag("name"))
        pname   = (name_el.text.strip()
                   if name_el is not None and name_el.text else "Unnamed")
        for polygon in placemark.iter(_tag("Polygon")):
            outer = polygon.find(
                f".//{_tag('outerBoundaryIs')}"
                f"/{_tag('LinearRing')}/{_tag('coordinates')}"
            )
            if outer is not None and outer.text:
                coords = _parse_coordinates(outer.text)
                if len(coords) >= 3:
                    all_polys.append((pname, coords))

    if not all_polys:
        return ["No polygon features found in the KMZ file."]

    # ------------------------------------------------------------------
    # Step 2 — classify: identify which polygons are contained inside
    #          another polygon (i.e. are obstacles / water bodies).
    #          Those are skipped — the engine handles them gracefully.
    # ------------------------------------------------------------------
    shapely_polys = []
    for name, coords in all_polys:
        try:
            # Build polygon using buffer(0) so even a self-intersecting ring
            # gives us a usable shape for the containment check.
            poly = Polygon(coords)
            if not poly.is_valid:
                poly = poly.buffer(0)
            shapely_polys.append((name, coords, poly))
        except Exception:
            # If we can't even build a shape, treat as top-level (check it).
            shapely_polys.append((name, coords, None))

    n = len(shapely_polys)
    is_contained = [False] * n   # True → obstacle / water body → skip
    for i in range(n):
        if shapely_polys[i][2] is None:
            continue
        for j in range(n):
            if i == j or shapely_polys[j][2] is None:
                continue
            try:
                if shapely_polys[j][2].contains(shapely_polys[i][2]):
                    is_contained[i] = True
                    break
            except Exception:
                pass

    # ------------------------------------------------------------------
    # Step 3 — validate open-ring for plant boundaries only
    # ------------------------------------------------------------------
    # problems → list of (boundary_name, issue_description)
    problems = []
    for i, (name, coords, _) in enumerate(shapely_polys):
        # Skip obstacles, water bodies, and water-named top-level boundaries
        if is_contained[i] or _is_water_boundary(name):
            continue

        first, last = coords[0], coords[-1]
        dlat = abs(first[1] - last[1])
        dlon = abs(first[0] - last[0])
        mid_lat = sum(c[1] for c in coords) / len(coords)

        if dlat > CLOSED_TOL_DEG or dlon > CLOSED_TOL_DEG:
            gap_m = _gap_metres(dlat, dlon, mid_lat)
            problems.append((
                name,
                f"Ring is NOT CLOSED  "
                f"(gap between first and last point ≈ {gap_m:.1f} m)"
            ))

    return problems   # List[Tuple[str, str]]  — (name, issue)


def parse_kmz(path: str) -> KMZParseResult:
    """
    Parse a KMZ/KML file and return all boundaries with their internal obstacles.

    Classification logic (using Shapely containment):
      - A polygon that is NOT fully contained within any other polygon → boundary
      - A polygon that IS fully contained within a boundary polygon → obstacle for that boundary
    """
    root = _get_tree_from_kmz(path)

    # Collect all polygons and linestrings from every Placemark
    raw: List[Tuple[str, List[Tuple[float, float]]]] = []
    raw_lines: List[Tuple[str, List[Tuple[float, float]]]] = []  # LineStrings

    for placemark in root.iter(_tag("Placemark")):
        name_el = placemark.find(_tag("name"))
        pname = name_el.text.strip() if name_el is not None and name_el.text else ""

        # Polygons
        for polygon in placemark.iter(_tag("Polygon")):
            outer = polygon.find(
                f".//{_tag('outerBoundaryIs')}/{_tag('LinearRing')}/{_tag('coordinates')}"
            )
            if outer is not None and outer.text:
                coords = _parse_coordinates(outer.text)
                if len(coords) >= 3:
                    raw.append((pname, coords))

        # LineStrings (transmission lines, canals, roads, etc.)
        for ls in placemark.iter(_tag("LineString")):
            coord_el = ls.find(_tag("coordinates"))
            if coord_el is not None and coord_el.text:
                coords = _parse_coordinates(coord_el.text)
                if len(coords) >= 2:
                    raw_lines.append((pname, coords))

    if not raw:
        raise ValueError("No polygon features found in the KMZ file.")

    # Build shapely polygons for containment checks
    shapely_polys = []
    for name, coords in raw:
        try:
            poly = Polygon(coords)
            if not poly.is_valid:
                poly = poly.buffer(0)
            shapely_polys.append((name, coords, poly))
        except Exception:
            pass

    if not shapely_polys:
        raise ValueError("Could not build valid polygons from the KMZ file.")

    # Classify: boundary vs obstacle
    # A polygon is an obstacle if it is fully contained within any other polygon
    n = len(shapely_polys)
    is_obstacle = [False] * n
    parent_index = [-1] * n

    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            try:
                if shapely_polys[j][2].contains(shapely_polys[i][2]):
                    is_obstacle[i] = True
                    # Assign to the smallest enclosing polygon
                    if parent_index[i] == -1:
                        parent_index[i] = j
                    else:
                        # prefer the smaller parent
                        if shapely_polys[j][2].area < shapely_polys[parent_index[i]][2].area:
                            parent_index[i] = j
                    break
            except Exception:
                pass

    result = KMZParseResult()

    # Create BoundaryInfo for each non-obstacle polygon.
    # Top-level polygons whose name matches water/canal keywords are treated as
    # water obstacles rather than plant boundaries (they will be assigned to
    # whichever boundary later overlaps them, or skipped entirely if standalone).
    boundary_map = {}   # index → BoundaryInfo
    water_top_level: List[int] = []   # indices of water-named top-level polys

    for i, (name, coords, poly) in enumerate(shapely_polys):
        if not is_obstacle[i]:
            if _is_water_name(name):
                # Remember for later assignment; do NOT treat as a plant boundary
                water_top_level.append(i)
            else:
                b = BoundaryInfo(
                    name=name if name else f"Plant {len(result.boundaries) + 1}",
                    coords=coords,
                )
                result.boundaries.append(b)
                boundary_map[i] = b

    if not result.boundaries:
        # Fallback: treat the largest non-water polygon as the only boundary
        non_water = [i for i in range(n) if i not in water_top_level]
        candidates = non_water if non_water else list(range(n))
        largest = max(candidates, key=lambda i: shapely_polys[i][2].area)
        name, coords, _ = shapely_polys[largest]
        b = BoundaryInfo(name=name if name else "Plant 1", coords=coords)
        result.boundaries.append(b)
        boundary_map[largest] = b
        for i in range(n):
            if i != largest:
                parent_index[i] = largest
                is_obstacle[i] = True

    # ------------------------------------------------------------------
    # Assign contained obstacles to their parent boundary, separating
    # water bodies (ponds, canals, reservoirs) from hard obstacles.
    # ------------------------------------------------------------------
    for i, (name, coords, _) in enumerate(shapely_polys):
        if is_obstacle[i] and parent_index[i] in boundary_map:
            parent_b = boundary_map[parent_index[i]]
            if _is_water_name(name):
                parent_b.water_obstacles.append(coords)
            else:
                parent_b.obstacles.append(coords)

    # Assign water-named top-level polygons to whichever boundary overlaps them
    from shapely.geometry import Point as _Pt
    for wi in water_top_level:
        wname, wcoords, wpoly = shapely_polys[wi]
        if wpoly is None:
            continue
        wcentroid = wpoly.centroid
        assigned = False
        for idx, b in boundary_map.items():
            bpoly = shapely_polys[idx][2]
            if bpoly is not None:
                try:
                    if bpoly.contains(wcentroid) or bpoly.intersects(wpoly):
                        b.water_obstacles.append(wcoords)
                        assigned = True
                        break
                except Exception:
                    pass
        # If not overlapping any boundary, assign to the largest boundary as a
        # precaution (user may have drawn the water body outside the boundary ring)
        if not assigned and boundary_map:
            largest_b_idx = max(boundary_map.keys(),
                                key=lambda i: shapely_polys[i][2].area
                                if shapely_polys[i][2] else 0)
            boundary_map[largest_b_idx].water_obstacles.append(wcoords)

    # ------------------------------------------------------------------
    # Assign line obstructions to parent boundary.
    # Lines whose name suggests TL / power lines are canal-type obstructions
    # (buffered and subtracted by the layout engine).  All other lines are
    # also captured as line_obstructions since they may represent roads/canals.
    # ------------------------------------------------------------------
    for lname, lcoords in raw_lines:
        pt_mid = lcoords[len(lcoords) // 2]   # midpoint of line
        for idx, (bname, bcoords, bpoly) in enumerate(shapely_polys):
            if not is_obstacle[idx] and idx in boundary_map:
                try:
                    if bpoly.contains(_Pt(pt_mid[0], pt_mid[1])):
                        boundary_map[idx].line_obstructions.append(lcoords)
                        break
                except Exception:
                    pass

    result._compute_centroid()
    return result
