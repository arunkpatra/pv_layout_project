"""
Bridges between the wire-format pydantic schemas (``pvlayout_engine.schemas``)
and the dataclasses in ``pvlayout_core.models.project``.

The sidecar's public surface is pydantic; the vendored domain logic is
dataclasses. These adapters are the single translation layer — everywhere
else operates in one world or the other, never both.

S3 usage:
  * ``params_to_core(layout_parameters)`` → dataclass LayoutParameters
    fed into ``run_layout_multi``.
  * ``result_from_core(core_layout_result)`` → pydantic LayoutResult
    returned over HTTP.

Design notes
------------
* The enum classes are intentionally *not* the same Python objects in the
  two packages (the schemas use ``str, Enum`` for wire readability, the
  domain models use plain ``Enum``). Conversion goes through ``.value``.
* ``LayoutResult.usable_polygon`` is a shapely geometry on the dataclass.
  We drop it on the way out — the pydantic schema does not include it.
* ``energy_result`` is optional on both sides; ``None`` round-trips.
"""
from __future__ import annotations

import math
from dataclasses import asdict, is_dataclass
from typing import Any

from pvlayout_core.models import project as core
from pvlayout_core.utils.geo_utils import utm_to_wgs84

from pvlayout_engine import schemas

# Circle approximation for LA protection zones. 64 sides keeps each chord
# <=10m at the default 100m radius — well below typical table dimensions,
# so the polygon is visually indistinguishable from a true circle at any
# zoom level we render at.
_LA_CIRCLE_SEGMENTS = 64


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------


def _rect_corners_wgs84(
    x: float, y: float, w: float, h: float, epsg: int
) -> list[tuple[float, float]]:
    """Return the 4 UTM corners of a (x, y, w, h) axis-aligned rectangle
    projected to WGS84, with the first point repeated to close the ring.

    Order: bottom-left → bottom-right → top-right → top-left → bottom-left.
    Same convention as the KMZ exporter; keeps GeoJSON polygons valid
    (closed) without requiring client-side closure.
    """
    corners_utm = [(x, y), (x + w, y), (x + w, y + h), (x, y + h), (x, y)]
    return utm_to_wgs84(corners_utm, epsg)


def _polyline_wgs84(
    points_utm: list[tuple[float, float]],
    start_utm: tuple[float, float],
    end_utm: tuple[float, float],
    epsg: int,
) -> list[tuple[float, float]]:
    """Return a WGS84 polyline for a cable run. Uses ``points_utm`` (the
    domain model's ``route_utm``) if non-empty, otherwise falls back to a
    straight line ``[start_utm, end_utm]`` — covers cable runs where the
    core didn't populate a routed path (e.g. obstruction-free short hops).
    """
    pts = list(points_utm) if points_utm else [start_utm, end_utm]
    return utm_to_wgs84(pts, epsg)


def _circle_ring_wgs84(
    cx: float, cy: float, r: float, epsg: int,
    segments: int = _LA_CIRCLE_SEGMENTS,
) -> list[tuple[float, float]]:
    """Sample a circle at ``(cx, cy)`` UTM with radius ``r`` metres as a
    closed polygon of ``segments+1`` points (last == first), then project
    to WGS84. Used for LA protection zones.
    """
    ring_utm = [
        (cx + r * math.cos(2 * math.pi * i / segments),
         cy + r * math.sin(2 * math.pi * i / segments))
        for i in range(segments)
    ]
    ring_utm.append(ring_utm[0])  # close the ring
    return utm_to_wgs84(ring_utm, epsg)


# ---------------------------------------------------------------------------
# Pydantic → dataclass (input side)
# ---------------------------------------------------------------------------


def params_to_core(p: schemas.LayoutParameters) -> core.LayoutParameters:
    """Convert a wire-format LayoutParameters into the domain dataclass."""
    return core.LayoutParameters(
        design_type=core.DesignType(p.design_type.value),
        tilt_angle=p.tilt_angle,
        row_spacing=p.row_spacing,
        gcr=p.gcr,
        perimeter_road_width=p.perimeter_road_width,
        module=core.ModuleSpec(
            length=p.module.length,
            width=p.module.width,
            wattage=p.module.wattage,
        ),
        table=core.TableConfig(
            modules_in_row=p.table.modules_in_row,
            rows_per_table=p.table.rows_per_table,
            orientation=core.Orientation(p.table.orientation.value),
        ),
        table_gap_ew=p.table_gap_ew,
        table_gap_ns=p.table_gap_ns,
        max_strings_per_inverter=p.max_strings_per_inverter,
        design_mode=core.DesignMode(p.design_mode.value),
        max_smb_per_central_inv=p.max_smb_per_central_inv,
        enable_cable_calc=p.enable_cable_calc,
    )


# ---------------------------------------------------------------------------
# Dataclass → pydantic (output side)
# ---------------------------------------------------------------------------


def result_from_core(r: core.LayoutResult) -> schemas.LayoutResult:
    """Convert a domain LayoutResult into the wire-format LayoutResult.

    Walks the dataclass tree manually; ``asdict`` would also strip the
    shapely ``usable_polygon`` but blows up on any non-dataclass attribute
    we might add later. Being explicit also documents the wire surface.
    """
    epsg = r.utm_epsg
    return schemas.LayoutResult(
        boundary_name=r.boundary_name,
        placed_tables=[_table_from_core(t) for t in r.placed_tables],
        placed_icrs=[_icr_from_core(i) for i in r.placed_icrs],
        placed_roads=[_road_from_core(rd) for rd in r.placed_roads],
        tables_pre_icr=[_table_from_core(t) for t in r.tables_pre_icr],
        total_modules=r.total_modules,
        total_capacity_kwp=r.total_capacity_kwp,
        total_capacity_mwp=r.total_capacity_mwp,
        total_area_m2=r.total_area_m2,
        total_area_acres=r.total_area_acres,
        net_layout_area_m2=r.net_layout_area_m2,
        gcr_achieved=r.gcr_achieved,
        row_pitch_m=r.row_pitch_m,
        tilt_angle_deg=r.tilt_angle_deg,
        utm_epsg=r.utm_epsg,
        boundary_wgs84=[(x, y) for (x, y) in r.boundary_wgs84],
        obstacle_polygons_wgs84=[
            [(x, y) for (x, y) in obs] for obs in r.obstacle_polygons_wgs84
        ],
        # Pre-projected corner rings so the desktop's MapCanvas can render
        # placed objects without client-side UTM↔WGS84 work. See ADR-0002
        # (no-basemap canvas) — we own the projection responsibility here.
        placed_tables_wgs84=[
            _rect_corners_wgs84(t.x, t.y, t.width, t.height, epsg)
            for t in r.placed_tables
        ],
        placed_icrs_wgs84=[
            _rect_corners_wgs84(i.x, i.y, i.width, i.height, epsg)
            for i in r.placed_icrs
        ],
        placed_string_inverters=[
            _inverter_from_core(i) for i in r.placed_string_inverters
        ],
        # WGS84 rects for string inverters — see placed_tables_wgs84 above
        # for the pattern rationale.
        placed_string_inverters_wgs84=[
            _rect_corners_wgs84(i.x, i.y, i.width, i.height, epsg)
            for i in r.placed_string_inverters
        ],
        dc_cable_runs=[_cable_from_core(c) for c in r.dc_cable_runs],
        dc_cable_runs_wgs84=[
            _polyline_wgs84(
                list(c.route_utm),
                (c.start_utm[0], c.start_utm[1]),
                (c.end_utm[0], c.end_utm[1]),
                epsg,
            )
            for c in r.dc_cable_runs
        ],
        ac_cable_runs=[_cable_from_core(c) for c in r.ac_cable_runs],
        ac_cable_runs_wgs84=[
            _polyline_wgs84(
                list(c.route_utm),
                (c.start_utm[0], c.start_utm[1]),
                (c.end_utm[0], c.end_utm[1]),
                epsg,
            )
            for c in r.ac_cable_runs
        ],
        total_dc_cable_m=r.total_dc_cable_m,
        total_ac_cable_m=r.total_ac_cable_m,
        string_kwp=r.string_kwp,
        inverter_capacity_kwp=r.inverter_capacity_kwp,
        num_string_inverters=r.num_string_inverters,
        inverters_per_icr=r.inverters_per_icr,
        placed_las=[_la_from_core(la) for la in r.placed_las],
        # WGS84 rects for LA footprints. LA center = (x + w/2, y + h/2)
        # per la_manager placement convention.
        placed_las_wgs84=[
            _rect_corners_wgs84(la.x, la.y, la.width, la.height, epsg)
            for la in r.placed_las
        ],
        placed_las_circles_wgs84=[
            _circle_ring_wgs84(
                la.x + la.width / 2, la.y + la.height / 2,
                la.radius, epsg,
            )
            for la in r.placed_las
        ],
        num_las=r.num_las,
        num_central_inverters=r.num_central_inverters,
        central_inverter_capacity_kwp=r.central_inverter_capacity_kwp,
        plant_ac_capacity_mw=r.plant_ac_capacity_mw,
        dc_ac_ratio=r.dc_ac_ratio,
        energy_result=_energy_result_from_core(r.energy_result),
    )


# ---------------------------------------------------------------------------
# Sub-converters (dataclass → pydantic)
# ---------------------------------------------------------------------------


def _table_from_core(t: core.PlacedTable) -> schemas.PlacedTable:
    return schemas.PlacedTable(
        x=t.x, y=t.y, width=t.width, height=t.height,
        row_index=t.row_index, col_index=t.col_index,
    )


def _icr_from_core(i: core.PlacedICR) -> schemas.PlacedICR:
    return schemas.PlacedICR(
        x=i.x, y=i.y, width=i.width, height=i.height, index=i.index,
    )


def _road_from_core(rd: core.PlacedRoad) -> schemas.PlacedRoad:
    return schemas.PlacedRoad(
        points_utm=[(x, y) for (x, y) in rd.points_utm],
        index=rd.index,
        road_type=rd.road_type,
    )


def _inverter_from_core(i: core.PlacedStringInverter) -> schemas.PlacedStringInverter:
    return schemas.PlacedStringInverter(
        x=i.x, y=i.y, width=i.width, height=i.height, index=i.index,
        capacity_kwp=i.capacity_kwp,
        assigned_table_count=i.assigned_table_count,
    )


def _cable_from_core(c: core.CableRun) -> schemas.CableRun:
    return schemas.CableRun(
        start_utm=(c.start_utm[0], c.start_utm[1]),
        end_utm=(c.end_utm[0], c.end_utm[1]),
        route_utm=[(x, y) for (x, y) in c.route_utm],
        index=c.index,
        cable_type=c.cable_type,
        length_m=c.length_m,
    )


def _la_from_core(la: core.PlacedLA) -> schemas.PlacedLA:
    return schemas.PlacedLA(
        x=la.x, y=la.y, width=la.width, height=la.height,
        radius=la.radius, index=la.index,
    )


def _energy_result_from_core(e: core.EnergyResult | None) -> schemas.EnergyResult | None:
    if e is None:
        return None
    # Straight field copy; no nested shapely objects here.
    data: dict[str, Any] = asdict(e) if is_dataclass(e) else {}
    return schemas.EnergyResult(**data)


# ---------------------------------------------------------------------------
# Reverse conversions (pydantic → dataclass) — used by /refresh-inverters
# ---------------------------------------------------------------------------


def table_to_core(t: schemas.PlacedTable) -> core.PlacedTable:
    return core.PlacedTable(
        x=t.x, y=t.y, width=t.width, height=t.height,
        row_index=t.row_index, col_index=t.col_index,
    )


def icr_to_core(i: schemas.PlacedICR) -> core.PlacedICR:
    return core.PlacedICR(
        x=i.x, y=i.y, width=i.width, height=i.height, index=i.index,
    )


def road_to_core(rd: schemas.PlacedRoad) -> core.PlacedRoad:
    return core.PlacedRoad(
        points_utm=[(x, y) for (x, y) in rd.points_utm],
        index=rd.index,
        road_type=rd.road_type,
    )


def result_to_core(r: schemas.LayoutResult) -> core.LayoutResult:
    """Hydrate a domain LayoutResult from its wire form.

    Used by ``/refresh-inverters`` where the client sends back the prior
    result (with e.g. moved ICR positions) and the sidecar needs a full
    dataclass to feed to ``place_*`` functions.

    NOTE: ``usable_polygon`` is intentionally left as ``None``. Callers must
    reconstruct it (see :mod:`pvlayout_engine.geometry`) before invoking
    any routine that depends on it.
    """
    out = core.LayoutResult()
    out.boundary_name = r.boundary_name
    out.placed_tables = [table_to_core(t) for t in r.placed_tables]
    out.placed_icrs = [icr_to_core(i) for i in r.placed_icrs]
    out.placed_roads = [road_to_core(rd) for rd in r.placed_roads]
    out.tables_pre_icr = [table_to_core(t) for t in r.tables_pre_icr]
    out.total_modules = r.total_modules
    out.total_capacity_kwp = r.total_capacity_kwp
    out.total_capacity_mwp = r.total_capacity_mwp
    out.total_area_m2 = r.total_area_m2
    out.total_area_acres = r.total_area_acres
    out.net_layout_area_m2 = r.net_layout_area_m2
    out.gcr_achieved = r.gcr_achieved
    out.row_pitch_m = r.row_pitch_m
    out.tilt_angle_deg = r.tilt_angle_deg
    out.utm_epsg = r.utm_epsg
    out.boundary_wgs84 = [(x, y) for (x, y) in r.boundary_wgs84]
    out.obstacle_polygons_wgs84 = [
        [(x, y) for (x, y) in obs] for obs in r.obstacle_polygons_wgs84
    ]
    out.placed_string_inverters = [
        core.PlacedStringInverter(
            x=i.x, y=i.y, width=i.width, height=i.height, index=i.index,
            capacity_kwp=i.capacity_kwp,
            assigned_table_count=i.assigned_table_count,
        )
        for i in r.placed_string_inverters
    ]
    out.dc_cable_runs = [
        core.CableRun(
            start_utm=(c.start_utm[0], c.start_utm[1]),
            end_utm=(c.end_utm[0], c.end_utm[1]),
            route_utm=[(x, y) for (x, y) in c.route_utm],
            index=c.index,
            cable_type=c.cable_type,
            length_m=c.length_m,
        )
        for c in r.dc_cable_runs
    ]
    out.ac_cable_runs = [
        core.CableRun(
            start_utm=(c.start_utm[0], c.start_utm[1]),
            end_utm=(c.end_utm[0], c.end_utm[1]),
            route_utm=[(x, y) for (x, y) in c.route_utm],
            index=c.index,
            cable_type=c.cable_type,
            length_m=c.length_m,
        )
        for c in r.ac_cable_runs
    ]
    out.total_dc_cable_m = r.total_dc_cable_m
    out.total_ac_cable_m = r.total_ac_cable_m
    out.string_kwp = r.string_kwp
    out.inverter_capacity_kwp = r.inverter_capacity_kwp
    out.num_string_inverters = r.num_string_inverters
    out.inverters_per_icr = r.inverters_per_icr
    out.placed_las = [
        core.PlacedLA(
            x=la.x, y=la.y, width=la.width, height=la.height,
            radius=la.radius, index=la.index,
        )
        for la in r.placed_las
    ]
    out.num_las = r.num_las
    out.num_central_inverters = r.num_central_inverters
    out.central_inverter_capacity_kwp = r.central_inverter_capacity_kwp
    out.plant_ac_capacity_mw = r.plant_ac_capacity_mw
    out.dc_ac_ratio = r.dc_ac_ratio
    # energy_result stays None on refresh — energy is computed separately (S13).
    return out
