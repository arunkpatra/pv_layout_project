"""
Layout routes: ``/parse-kmz``, ``/layout``, ``/refresh-inverters``,
``/add-road``, ``/remove-road``.

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
  S11: optionally accepts an ``icr_override`` to apply a WGS84→UTM ICR
  move in the same round-trip.
* ``/add-road`` (S11) appends a user-drawn obstruction (WGS84, projected
  server-side) to ``result.placed_roads`` via ``road_manager.add_road``
  and refreshes inverters.
* ``/remove-road`` (S11) pops the last obstruction (LIFO, matches
  legacy "Undo Last" button) and refreshes inverters.

All S11 endpoints follow the same pattern: stateless — client owns the
LayoutResult and passes it back on every request. Sidecar projects any
WGS84 input to UTM via ``result.utm_epsg`` + ``geo_utils.wgs84_to_utm``,
applies the delta, reruns the recompute pipeline, returns the updated
LayoutResult.
"""
from __future__ import annotations

import concurrent.futures
import logging
import os
import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, status
from fastapi import File as FastAPIFile

from pvlayout_core.core.kmz_parser import parse_kmz as core_parse_kmz
from pvlayout_core.core.la_manager import place_lightning_arresters
from pvlayout_core.core.layout_engine import run_layout_multi
from pvlayout_core.core.road_manager import (
    add_road as core_add_road,
    recompute_tables,
    remove_last_road as core_remove_last_road,
)
from pvlayout_core.core.string_inverter_manager import place_string_inverters
from pvlayout_core.utils.geo_utils import wgs84_to_utm

from pvlayout_engine import adapters
from pvlayout_engine.geometry import reconstruct_usable_polygon
from pvlayout_engine.schemas import (
    AddRoadRequest,
    BoundaryInfo,
    LayoutRequest,
    LayoutResponse,
    LayoutResult,
    ParsedKMZ,
    RefreshInvertersRequest,
    RemoveRoadRequest,
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
    # spill the upload to disk first. NamedTemporaryFile is unsafe on
    # Windows — it holds an exclusive handle that blocks any re-opening
    # by path while the context is active, which is exactly what
    # core_parse_kmz needs to do. TemporaryDirectory + a regular file
    # inside has ordinary permissions cross-platform; the directory
    # (and the file it contains) is cleaned up on context exit.
    suffix = ".kmz" if file.filename.lower().endswith(".kmz") else ".kml"
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir) / f"upload{suffix}"
        content = await file.read()
        tmp_path.write_bytes(content)
        try:
            core_result = core_parse_kmz(str(tmp_path))
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
                # Row #4: surface autodetected water obstacles on the wire.
                water_obstacles=[
                    [(lon, lat) for (lon, lat) in wo]
                    for wo in getattr(b, "water_obstacles", [])
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
    #
    # Multi-plot perf: each LayoutResult is independent after
    # run_layout_multi (no shared mutable state between plots). For
    # multi-plot inputs with cable calc on, we dispatch the per-plot LA
    # + string-inverter chain across worker processes — wall-clock
    # scales with min(P, cpu_count). Single-plot stays in-process
    # (process pool startup is ~150ms wasted on a 5s job).
    # PVLAYOUT_DISABLE_PARALLEL=1 forces sequential (test/debug).
    use_parallel = (
        len(core_results) > 1
        and core_params.enable_cable_calc
        and os.environ.get("PVLAYOUT_DISABLE_PARALLEL") != "1"
    )
    if use_parallel:
        max_workers = min(len(core_results), os.cpu_count() or 4)
        args_list = [(r, core_params) for r in core_results]
        with concurrent.futures.ProcessPoolExecutor(max_workers=max_workers) as ex:
            core_results = list(ex.map(_run_per_plot_pipeline, args_list))
    else:
        for r in core_results:
            if r.usable_polygon is None:
                # Error path (e.g. unprocessable boundary); skip inverter pass.
                continue
            place_lightning_arresters(r, core_params)
            place_string_inverters(r, core_params)

    return LayoutResponse(results=[adapters.result_from_core(r) for r in core_results])


def _run_per_plot_pipeline(args):
    """
    Top-level worker for ProcessPoolExecutor.map above. Must be at module
    scope (not a closure) for the spawn start method (default on macOS).
    Mutates ``result`` in place and returns it.
    """
    result, params = args
    if result.usable_polygon is None:
        return result
    place_lightning_arresters(result, params)
    place_string_inverters(result, params)
    return result


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

    S11: ``request.icr_override`` optionally moves one ICR before the
    refresh. The WGS84 centre is projected via ``result.utm_epsg`` +
    ``wgs84_to_utm``; the ICR's bottom-left corner is shifted so the
    rectangle's centroid lands at the requested point. Then
    ``recompute_tables`` runs (to clear tables under the new footprint)
    before the LA + string-inverter passes.
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

    if request.icr_override is not None:
        _apply_icr_override(core_result, request)

    # ALWAYS rebuild placed_tables from tables_pre_icr before the LA pass.
    # la_manager's step-2 coverage check iterates placed_tables and places
    # additional LAs to protect uncovered tables; if we skip this, a
    # refresh on a result whose placed_tables was already LA-reduced
    # produces a DIFFERENT LA set than the /layout pass would have, which
    # then removes a different (smaller) set of tables — /layout and
    # /refresh-inverters diverge for the same input. Legacy
    # PVlayout_Advance has the same invariant: tables_pre_icr is the
    # source of truth; placed_tables is always derived (Agent 2's S10.5
    # research report, "tables_pre_icr snapshot is the source of truth").
    recompute_tables(core_result, core_params)

    place_lightning_arresters(core_result, core_params)
    place_string_inverters(core_result, core_params)

    return adapters.result_from_core(core_result)


# ---------------------------------------------------------------------------
# /add-road  (S11)
# ---------------------------------------------------------------------------


@router.post(
    "/add-road",
    response_model=LayoutResult,
    summary="Append a user-drawn obstruction and recompute (S11)",
)
def add_road(request: AddRoadRequest) -> LayoutResult:
    """Project the WGS84 road to UTM, append to ``placed_roads``, and
    recompute tables + LAs + inverters. Matches legacy ``_on_road_drawn``.
    """
    core_result = adapters.result_to_core(request.result)
    core_params = adapters.params_to_core(request.params)

    epsg = request.result.utm_epsg
    if epsg == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="result.utm_epsg is missing; cannot project WGS84 road coords",
        )

    usable = reconstruct_usable_polygon(core_result, core_params.perimeter_road_width)
    if usable is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not reconstruct usable polygon",
        )
    core_result.usable_polygon = usable

    points_utm = wgs84_to_utm(
        [(lng, lat) for (lng, lat) in request.road.coords_wgs84], epsg
    )
    # core_add_road appends to placed_roads AND calls recompute_tables.
    # We then rerun LA + string inverters in legacy order.
    core_add_road(core_result, core_params, points_utm, request.road.road_type)
    place_lightning_arresters(core_result, core_params)
    place_string_inverters(core_result, core_params)

    return adapters.result_from_core(core_result)


# ---------------------------------------------------------------------------
# /remove-road  (S11)
# ---------------------------------------------------------------------------


@router.post(
    "/remove-road",
    response_model=LayoutResult,
    summary="Pop last obstruction (LIFO) and recompute (S11)",
)
def remove_road(request: RemoveRoadRequest) -> LayoutResult:
    """Pop ``placed_roads[-1]``, recompute tables, rerun LA + inverters.

    Matches legacy "Undo Last" button. Returns 422 if no roads remain —
    the client's undo stack should be in sync, but we surface the
    mismatch explicitly rather than silently no-op.
    """
    core_result = adapters.result_to_core(request.result)
    core_params = adapters.params_to_core(request.params)

    if not core_result.placed_roads:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No roads to remove; placed_roads is empty",
        )

    usable = reconstruct_usable_polygon(core_result, core_params.perimeter_road_width)
    if usable is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not reconstruct usable polygon",
        )
    core_result.usable_polygon = usable

    core_remove_last_road(core_result, core_params)
    place_lightning_arresters(core_result, core_params)
    place_string_inverters(core_result, core_params)

    return adapters.result_from_core(core_result)


# ---------------------------------------------------------------------------
# S11 helpers
# ---------------------------------------------------------------------------


def _apply_icr_override(core_result, request: RefreshInvertersRequest) -> None:
    """Project the override's WGS84 centre to UTM and move the target
    ICR's bottom-left corner so the rectangle's centroid lands at the
    requested point.

    Raises 422 on out-of-range index or missing EPSG so the frontend
    surfaces the mismatch instead of silently mis-placing the ICR.
    """
    assert request.icr_override is not None  # caller checked
    override = request.icr_override
    epsg = request.result.utm_epsg
    if epsg == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="result.utm_epsg is missing; cannot project ICR override",
        )
    if override.icr_index < 0 or override.icr_index >= len(core_result.placed_icrs):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"icr_override.icr_index {override.icr_index} out of range; "
                f"boundary has {len(core_result.placed_icrs)} ICRs"
            ),
        )
    new_center_utm = wgs84_to_utm([tuple(override.new_center_wgs84)], epsg)[0]
    icr = core_result.placed_icrs[override.icr_index]
    # ICR is stored as axis-aligned rect via bottom-left + width + height.
    # The client asked for a new CENTRE; translate to bottom-left.
    icr.x = new_center_utm[0] - icr.width / 2.0
    icr.y = new_center_utm[1] - icr.height / 2.0


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
        # Row #4: route water_obstacles through to the domain object so the
        # row-#4 bridge in run_layout_multi can fold them into exclusions.
        # Older wire payloads without this field default to [] via Pydantic.
        cb.water_obstacles = [
            [(lon, lat) for (lon, lat) in wo]
            for wo in getattr(b, "water_obstacles", [])
        ]
        cb.line_obstructions = [
            [(lon, lat) for (lon, lat) in line] for line in b.line_obstructions
        ]
        out.append(cb)
    return out
