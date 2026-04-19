"""
Layout engine handlers.

handle_layout       — Spike 2b local contract (local KMZ path, no S3/DB).
handle_layout_job   — Spike 2c production contract (S3 + DB).
"""
import os
import tempfile
from typing import List

from core.dxf_exporter import export_dxf
from core.kmz_exporter import export_kmz
from core.kmz_parser import parse_kmz
from core.la_manager import place_lightning_arresters
from core.layout_engine import run_layout_multi
from core.string_inverter_manager import place_string_inverters
from db_client import (
    get_version,
    mark_layout_complete,
    mark_layout_failed,
    mark_layout_processing,
)
from models.project import (
    LayoutParameters,
    LayoutResult,
    ModuleSpec,
    Orientation,
    TableConfig,
)
from s3_client import download_from_s3, upload_to_s3
from svg_exporter import export_svg


def _params_from_dict(p: dict) -> LayoutParameters:
    orientation = (
        Orientation.LANDSCAPE
        if str(p.get("orientation", "portrait")).lower() == "landscape"
        else Orientation.PORTRAIT
    )
    return LayoutParameters(
        tilt_angle=p.get("tilt_angle"),
        row_spacing=p.get("row_spacing"),
        gcr=p.get("gcr"),
        perimeter_road_width=float(p.get("perimeter_road_width", 6.0)),
        module=ModuleSpec(
            length=float(p.get("module_length", 2.38)),
            width=float(p.get("module_width", 1.13)),
            wattage=float(p.get("module_wattage", 580.0)),
        ),
        table=TableConfig(
            modules_in_row=int(p.get("modules_in_row", 28)),
            rows_per_table=int(p.get("rows_per_table", 2)),
            orientation=orientation,
        ),
        table_gap_ew=float(p.get("table_gap_ew", 1.0)),
        max_strings_per_inverter=int(p.get("max_strings_per_inverter", 20)),
    )


def _build_stats(results: List[LayoutResult]) -> dict:
    return {
        "total_tables": sum(len(r.placed_tables) for r in results),
        "total_modules": sum(r.total_modules for r in results),
        "total_capacity_mwp": round(sum(r.total_capacity_mwp for r in results), 3),
        "total_area_acres": round(sum(r.total_area_acres for r in results), 3),
        "num_icrs": sum(len(r.placed_icrs) for r in results),
        "num_string_inverters": sum(r.num_string_inverters for r in results),
        "total_dc_cable_m": round(sum(r.total_dc_cable_m for r in results), 1),
        "total_ac_cable_m": round(sum(r.total_ac_cable_m for r in results), 1),
        "num_las": sum(r.num_las for r in results),
    }


def handle_layout(payload: dict) -> dict:
    """
    Spike 2b contract (local only).

    payload keys:
      kmz_local_path: str   — absolute path to local KMZ file
      output_dir: str       — absolute path to write output artifacts
      parameters: dict      — layout parameters

    Returns:
      {"stats": {total_tables, total_capacity_mwp, ...}}
    Writes to output_dir:
      layout.kmz, layout.svg, layout.dxf
    """
    kmz_path = payload["kmz_local_path"]
    output_dir = payload["output_dir"]
    params = _params_from_dict(payload.get("parameters", {}))

    parse_result = parse_kmz(kmz_path)
    results = run_layout_multi(
        parse_result.boundaries,
        params,
        parse_result.centroid_lat,
        parse_result.centroid_lon,
    )

    for r in results:
        place_string_inverters(r, params)
        place_lightning_arresters(r, params)

    export_kmz(results, params, os.path.join(output_dir, "layout.kmz"))
    export_svg(results, os.path.join(output_dir, "layout.svg"))
    export_dxf(results, params, os.path.join(output_dir, "layout.dxf"))

    return {"stats": _build_stats(results)}


def handle_layout_job(version_id: str) -> None:
    """
    Spike 3c production contract.

    Reads project_id, kmz_s3_key, and input_snapshot from DB via get_version.
    Downloads input KMZ from S3, runs layout, uploads artifacts to S3,
    and updates LayoutJob + Version status via DB.

    Raises the original exception after marking the job FAILED.

    S3 artifact keys:
      projects/{project_id}/versions/{version_id}/layout.kmz
      projects/{project_id}/versions/{version_id}/layout.svg
      projects/{project_id}/versions/{version_id}/layout.dxf

    Env:
      S3_ARTIFACTS_BUCKET — bucket for both input and output
    """
    bucket = os.environ["S3_ARTIFACTS_BUCKET"]
    project_id, kmz_s3_key, input_snapshot = get_version(version_id)
    output_prefix = f"projects/{project_id}/versions/{version_id}"

    try:
        mark_layout_processing(version_id)
        with tempfile.TemporaryDirectory() as tmpdir:
            kmz_local = os.path.join(tmpdir, "input.kmz")
            download_from_s3(bucket, kmz_s3_key, kmz_local)

            params = _params_from_dict(input_snapshot)
            parse_result = parse_kmz(kmz_local)
            results = run_layout_multi(
                parse_result.boundaries,
                params,
                parse_result.centroid_lat,
                parse_result.centroid_lon,
            )

            for r in results:
                place_string_inverters(r, params)
                place_lightning_arresters(r, params)

            kmz_out = os.path.join(tmpdir, "layout.kmz")
            svg_out = os.path.join(tmpdir, "layout.svg")
            dxf_out = os.path.join(tmpdir, "layout.dxf")

            export_kmz(results, params, kmz_out)
            export_svg(results, svg_out)
            export_dxf(results, params, dxf_out)

            kmz_key = f"{output_prefix}/layout.kmz"
            svg_key = f"{output_prefix}/layout.svg"
            dxf_key = f"{output_prefix}/layout.dxf"

            upload_to_s3(bucket, kmz_out, kmz_key)
            upload_to_s3(bucket, svg_out, svg_key)
            upload_to_s3(bucket, dxf_out, dxf_key)

            stats = _build_stats(results)

        mark_layout_complete(version_id, kmz_key, svg_key, dxf_key, stats)

    except Exception as exc:
        mark_layout_failed(version_id, str(exc))
        raise
