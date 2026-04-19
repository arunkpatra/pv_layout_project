"""
KMZ / KML parser.
Extracts:
  - All plant boundary polygons (top-level polygons not contained within others)
  - Obstacle / exclusion polygons (polygons fully contained within a boundary)
  - The centroid latitude/longitude of all boundaries combined
"""
import xml.etree.ElementTree as ET
import zipfile
from typing import List, Tuple

from shapely.geometry import Polygon

KML_NS = "http://www.opengis.net/kml/2.2"


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
        self.line_obstructions: List[List[Tuple[float, float]]] = []  # TL, canal, etc.


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

    # Create BoundaryInfo for each non-obstacle polygon
    boundary_map = {}   # index → BoundaryInfo
    for i, (name, coords, _) in enumerate(shapely_polys):
        if not is_obstacle[i]:
            b = BoundaryInfo(name=name if name else f"Plant {len(result.boundaries) + 1}",
                             coords=coords)
            result.boundaries.append(b)
            boundary_map[i] = b

    if not result.boundaries:
        # Fallback: treat the largest polygon as the only boundary
        largest = max(range(n), key=lambda i: shapely_polys[i][2].area)
        name, coords, _ = shapely_polys[largest]
        b = BoundaryInfo(name=name if name else "Plant 1", coords=coords)
        result.boundaries.append(b)
        boundary_map[largest] = b
        for i in range(n):
            if i != largest:
                parent_index[i] = largest
                is_obstacle[i] = True

    # Assign obstacles to their parent boundary
    for i, (name, coords, _) in enumerate(shapely_polys):
        if is_obstacle[i] and parent_index[i] in boundary_map:
            boundary_map[parent_index[i]].obstacles.append(coords)

    # Assign line obstructions (TL, canals, etc.) to parent boundary
    for lname, lcoords in raw_lines:
        pt_mid = lcoords[len(lcoords) // 2]   # midpoint of line
        from shapely.geometry import Point as _Pt
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
