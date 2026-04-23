"""
Geospatial utility functions.

Handles conversion between WGS84 (lon/lat) and a local UTM projection
so that all geometry operations can be done in metres.
"""
from typing import List, Tuple
from pyproj import Transformer, CRS


def get_utm_epsg(lon: float, lat: float) -> int:
    """
    Return the EPSG code of the UTM zone that best covers the given point.
    Works for both hemispheres.
    """
    zone_number = int((lon + 180) / 6) + 1
    if lat >= 0:
        epsg = 32600 + zone_number   # WGS 84 / UTM zone N
    else:
        epsg = 32700 + zone_number   # WGS 84 / UTM zone S
    return epsg


def wgs84_to_utm(
    coords_lonlat: List[Tuple[float, float]],
    epsg: int,
) -> List[Tuple[float, float]]:
    """Convert a list of (lon, lat) to (easting, northing) in given UTM EPSG."""
    transformer = Transformer.from_crs("EPSG:4326", f"EPSG:{epsg}", always_xy=True)
    return [transformer.transform(lon, lat) for lon, lat in coords_lonlat]


def utm_to_wgs84(
    coords_xy: List[Tuple[float, float]],
    epsg: int,
) -> List[Tuple[float, float]]:
    """Convert a list of (easting, northing) UTM back to (lon, lat) WGS84."""
    transformer = Transformer.from_crs(f"EPSG:{epsg}", "EPSG:4326", always_xy=True)
    return [transformer.transform(x, y) for x, y in coords_xy]


def polygon_area_m2(coords_xy: List[Tuple[float, float]]) -> float:
    """Shoelace formula on UTM coordinates (metres). Returns area in m²."""
    n = len(coords_xy)
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += coords_xy[i][0] * coords_xy[j][1]
        area -= coords_xy[j][0] * coords_xy[i][1]
    return abs(area) / 2.0
