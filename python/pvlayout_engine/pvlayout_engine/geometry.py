"""
Rebuild the authoritative ``usable_polygon`` from a ``LayoutResult``'s
persisted fields. Used by ``/refresh-inverters`` so downstream routines
(``place_lightning_arresters``, ``place_string_inverters``) have the
shapely geometry they expect.

Mirrors the first steps of ``pvlayout_core.core.layout_engine.run_layout``:
project to UTM → shrink by perimeter road width → subtract obstacles →
subtract buffered placed_roads polygons.

NOTE: line obstructions from the original KMZ (TL corridors) are NOT yet
round-trippable in the wire schema — the sidecar loses them after /layout.
Adding them is a small schema extension that can land in S11 when
obstruction drawing goes interactive; for S3 golden tests we use /layout
exclusively and the polygon is rebuilt from fresh state there anyway.
"""
from __future__ import annotations

from shapely.geometry import Polygon
from shapely.ops import unary_union

from pvlayout_core.models.project import LayoutResult
from pvlayout_core.utils.geo_utils import wgs84_to_utm


def reconstruct_usable_polygon(
    result: LayoutResult, perimeter_road_width: float
) -> Polygon | None:
    """Recompute ``result.usable_polygon`` in UTM metres.

    Returns None if the polygon degenerates (e.g. road setback too large).
    """
    if not result.boundary_wgs84 or result.utm_epsg == 0:
        return None

    boundary_utm = wgs84_to_utm(result.boundary_wgs84, result.utm_epsg)
    boundary = Polygon(boundary_utm)

    # Shrink by perimeter road
    usable = boundary.buffer(-perimeter_road_width, join_style=2)
    if usable.is_empty:
        return None

    # Subtract obstacle polygons (from original KMZ)
    obs_polys = []
    for obs in result.obstacle_polygons_wgs84:
        obs_utm = wgs84_to_utm(obs, result.utm_epsg)
        if len(obs_utm) >= 3:
            obs_polys.append(Polygon(obs_utm))
    if obs_polys:
        usable = usable.difference(unary_union(obs_polys))
        if usable.is_empty:
            return None

    # Row #6: subtract water-body polygons (ponds, canals, reservoirs).
    # Mirrors layout_engine.run_layout's section 3a so /refresh-inverters and
    # /add-road reconstruct the SAME usable_polygon /layout originally produced.
    water_polys = []
    for wo in getattr(result, "water_obstacle_polygons_wgs84", []) or []:
        wo_utm = wgs84_to_utm(wo, result.utm_epsg)
        if len(wo_utm) >= 3:
            water_polys.append(Polygon(wo_utm))
    if water_polys:
        usable = usable.difference(unary_union(water_polys))
        if usable.is_empty:
            return None

    # Subtract user-drawn obstructions (already in UTM)
    road_polys = [
        Polygon(rd.points_utm) for rd in result.placed_roads if len(rd.points_utm) >= 3
    ]
    if road_polys:
        usable = usable.difference(unary_union(road_polys))
        if usable.is_empty:
            return None

    return usable
