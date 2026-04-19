import os
import tempfile
import xml.etree.ElementTree as ET

from shapely.geometry import Polygon

from models.project import LayoutResult
from svg_exporter import export_svg


def _minimal_result() -> LayoutResult:
    """A LayoutResult with just a boundary polygon — no tables placed."""
    result = LayoutResult()
    result.boundary_name = "Test Boundary"
    result.utm_epsg = 32643  # UTM zone 43N (covers 72°E longitude)
    result.boundary_wgs84 = [
        (72.000, 23.000),
        (72.002, 23.000),
        (72.002, 23.002),
        (72.000, 23.002),
        (72.000, 23.000),
    ]
    result.obstacle_polygons_wgs84 = []
    result.usable_polygon = Polygon([(0, 0), (200, 0), (200, 200), (0, 200)])
    return result


EXPECTED_GIDS = {
    "boundary",
    "obstacles",
    "tables",
    "icrs",
    "inverters",
    "dc-cables",
    "ac-cables",
    "la-footprints",
    "la-circles",
    "annotations",
}


def test_export_svg_creates_file():
    result = _minimal_result()
    with tempfile.NamedTemporaryFile(suffix=".svg", delete=False) as f:
        path = f.name
    try:
        export_svg([result], path)
        assert os.path.exists(path)
        assert os.path.getsize(path) > 0
    finally:
        os.unlink(path)


def test_export_svg_has_all_gid_groups():
    result = _minimal_result()
    with tempfile.NamedTemporaryFile(suffix=".svg", delete=False) as f:
        path = f.name
    try:
        export_svg([result], path)
        tree = ET.parse(path)
        root = tree.getroot()
        found_ids = {
            elem.get("id")
            for elem in root.iter()
            if elem.get("id") is not None
        }
        missing = EXPECTED_GIDS - found_ids
        assert not missing, f"Missing gid groups in SVG: {missing}"
    finally:
        os.unlink(path)
