"""
Layout routes: ``/parse-kmz``, ``/layout``, ``/refresh-inverters``.

S3 scope — these replace the dev-only echo endpoints from S2. They are
the first real surface that exercises the vendored domain logic.

Design
------
* ``/parse-kmz`` accepts a multipart KMZ upload; parsing happens via a
  temp file because ``parse_kmz`` expects a path (KML inside a zip).
* ``/layout`` is stateless — it takes a ParsedKMZ (output of /parse-kmz)
  plus LayoutParameters and produces one LayoutResult per boundary.
* ``/refresh-inverters`` takes a prior LayoutResult (possibly with moved
  ICRs) and rebuilds ``usable_polygon`` in-memory before rerunning LA +
  string-inverter placement. Matches the PyQt app's ``_refresh_inverters``
  ordering: LAs first (they may remove tables), then string inverters.
"""
from __future__ import annotations

import logging
import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, status
from fastapi import File as FastAPIFile

from pvlayout_core.core.kmz_parser import parse_kmz as core_parse_kmz
from pvlayout_core.core.la_manager import place_lightning_arresters
from pvlayout_core.core.layout_engine import run_layout_multi
from pvlayout_core.core.string_inverter_manager import place_string_inverters

from pvlayout_engine import adapters
from pvlayout_engine.geometry import reconstruct_usable_polygon
from pvlayout_engine.schemas import (
    BoundaryInfo,
    LayoutRequest,
    LayoutResponse,
    LayoutResult,
    ParsedKMZ,
    RefreshInvertersRequest,
)

log = logging.getLogger("pvlayout_engine.routes.layout")

router = APIRouter(tags=["layout"])


# ---------------------------------------------------------------------------
# /parse-kmz
# ---------------------------------------------------------------------------


@router.post(
    "/parse-kmz",
    response_model=ParsedKMZ,
    summary="Parse a KMZ archive into boundaries, obstacles, and line obstructions",
)
async def parse_kmz(file: UploadFile = FastAPIFile(...)) -> ParsedKMZ:
    """
    Accepts a multipart KMZ upload and returns the parsed plant geometry:
    all boundary polygons, their inner obstacle polygons, line obstructions
    (TL/canal/road corridors), and the combined centroid.
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file has no name",
        )
    if not file.filename.lower().endswith((".kmz", ".kml")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file extension: {file.filename}",
        )

    # core_parse_kmz expects a real path (it opens the zip itself), so we
    # spill to a temp file. The file is deleted when the context exits.
    suffix = ".kmz" if file.filename.lower().endswith(".kmz") else ".kml"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp.flush()
        try:
            core_result = core_parse_kmz(tmp.name)
        except Exception as exc:
            log.warning("parse_kmz failed for %s: %s", file.filename, exc)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Failed to parse KMZ: {exc}",
            ) from exc

    return ParsedKMZ(
        boundaries=[
            BoundaryInfo(
                name=b.name,
                coords=[(lon, lat) for (lon, lat) in b.coords],
                obstacles=[
                    [(lon, lat) for (lon, lat) in obs] for obs in b.obstacles
                ],
                line_obstructions=[
                    [(lon, lat) for (lon, lat) in line]
                    for line in b.line_obstructions
                ],
            )
            for b in core_result.boundaries
        ],
        centroid_lat=core_result.centroid_lat,
        centroid_lon=core_result.centroid_lon,
    )


# ---------------------------------------------------------------------------
# /layout
# ---------------------------------------------------------------------------


@router.post(
    "/layout",
    response_model=LayoutResponse,
    summary="Run layout generation for every boundary in a parsed KMZ",
)
def layout(request: LayoutRequest) -> LayoutResponse:
    """
    Runs the full layout pipeline:
    ``run_layout_multi`` → ``place_lightning_arresters`` → ``place_string_inverters``
    for each boundary. Returns one ``LayoutResult`` per boundary.
    """
    if not request.parsed_kmz.boundaries:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="parsed_kmz contains no boundaries",
        )

    core_boundaries = _boundaries_to_core(request.parsed_kmz.boundaries)
    core_params = adapters.params_to_core(request.params)

    core_results = run_layout_multi(
        boundaries=core_boundaries,
        params=core_params,
        centroid_lat=request.parsed_kmz.centroid_lat,
        centroid_lon=request.parsed_kmz.centroid_lon,
    )

    # Mirror the PyQt app's post-layout ordering: LAs first (they may
    # remove tables + update total_capacity_kwp), then string inverters.
    for r in core_results:
        if r.usable_polygon is None:
            # Error path (e.g. unprocessable boundary); skip inverter pass.
            continue
        place_lightning_arresters(r, core_params)
        place_string_inverters(r, core_params)

    return LayoutResponse(results=[adapters.result_from_core(r) for r in core_results])


# ---------------------------------------------------------------------------
# /refresh-inverters
# ---------------------------------------------------------------------------


@router.post(
    "/refresh-inverters",
    response_model=LayoutResult,
    summary="Recompute LA + string-inverter placement for an existing result",
)
def refresh_inverters(request: RefreshInvertersRequest) -> LayoutResult:
    """
    Called after an ICR drag or obstruction change when only the inverter
    layer needs refreshing. Rebuilds ``usable_polygon`` from the result's
    persistent fields, then reruns LA + string-inverter placement.
    """
    core_result = adapters.result_to_core(request.result)
    core_params = adapters.params_to_core(request.params)

    usable = reconstruct_usable_polygon(core_result, core_params.perimeter_road_width)
    if usable is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "Could not reconstruct usable polygon. Check boundary_wgs84, "
                "utm_epsg, and perimeter_road_width."
            ),
        )
    core_result.usable_polygon = usable

    place_lightning_arresters(core_result, core_params)
    place_string_inverters(core_result, core_params)

    return adapters.result_from_core(core_result)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _boundaries_to_core(wire_boundaries: list[BoundaryInfo]) -> list:
    """Convert wire BoundaryInfo list → domain BoundaryInfo list.

    The domain class is not a dataclass (it uses __init__), so we
    instantiate manually instead of dataclass-to-dataclass.
    """
    from pvlayout_core.core.kmz_parser import BoundaryInfo as CoreBoundary

    out = []
    for b in wire_boundaries:
        cb = CoreBoundary(b.name, [(lon, lat) for (lon, lat) in b.coords])
        cb.obstacles = [
            [(lon, lat) for (lon, lat) in obs] for obs in b.obstacles
        ]
        cb.line_obstructions = [
            [(lon, lat) for (lon, lat) in line] for line in b.line_obstructions
        ]
        out.append(cb)
    return out
