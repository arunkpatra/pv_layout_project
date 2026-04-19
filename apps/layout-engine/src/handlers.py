"""
Layout engine handlers — Spike 2b local contract.

handle_layout accepts a local KMZ path and output directory (no S3, no DB).
This module is fully replaced in Spike 2c with the production contract.
"""
import os
from typing import List

from core.dxf_exporter import export_dxf
from core.kmz_exporter import export_kmz
from core.kmz_parser import parse_kmz
from core.la_manager import place_lightning_arresters
from core.layout_engine import run_layout_multi
from core.string_inverter_manager import place_string_inverters
from models.project import (
    LayoutParameters,
    LayoutResult,
    ModuleSpec,
    Orientation,
    TableConfig,
)
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
    Spike 2b contract (local only — replaced in Spike 2c).

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

    # Both functions mutate LayoutResult in-place
    for r in results:
        place_string_inverters(r, params)
        place_lightning_arresters(r, params)

    export_kmz(results, params, os.path.join(output_dir, "layout.kmz"))
    export_svg(results, os.path.join(output_dir, "layout.svg"))
    export_dxf(results, params, os.path.join(output_dir, "layout.dxf"))

    return {"stats": _build_stats(results)}
