"""
Pydantic v2 schemas mirroring the dataclasses in
``pvlayout_core.models.project``.

These schemas are the HTTP surface of the sidecar — they are what the
Tauri React frontend sends and receives over the loopback connection.
Every field mirrors the canonical dataclass field in the domain model;
if the domain model changes, these schemas must change with it.

S2 scope: schemas exist and compile. Adapter functions (schema ↔
dataclass) land in S3 when the first real route (/layout) is wired.

Design notes
------------
* ``LayoutResult.usable_polygon`` is a shapely geometry — a runtime-only
  artifact the sidecar reconstructs from ``boundary_wgs84`` + roads. It is
  intentionally absent from the schema; it never travels over HTTP.
* Enum values are the string representations of the domain enums so the
  wire payload is human-readable.
* Tuples in the domain model (UTM coordinate pairs) are exposed as
  fixed-length lists on the wire for JSON-friendliness; pydantic validates
  the length.
"""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# Enums — string-valued for wire readability.
# ---------------------------------------------------------------------------


class DesignType(str, Enum):
    FIXED_TILT = "fixed_tilt"


class Orientation(str, Enum):
    PORTRAIT = "portrait"
    LANDSCAPE = "landscape"


class DesignMode(str, Enum):
    STRING_INVERTER = "string_inverter"
    CENTRAL_INVERTER = "central_inverter"


# ---------------------------------------------------------------------------
# Base model — frozen for hashability-by-default + forbids unknown fields so
# client typos surface immediately.
# ---------------------------------------------------------------------------


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


# A 2D point in UTM metres or WGS84 degrees. Serialized as a 2-element list.
UTMPoint = tuple[float, float]


# ---------------------------------------------------------------------------
# Inputs
# ---------------------------------------------------------------------------


class ModuleSpec(_Model):
    length: float = 2.38
    width: float = 1.13
    wattage: float = 580.0


class TableConfig(_Model):
    modules_in_row: int = 28
    rows_per_table: int = 2
    orientation: Orientation = Orientation.PORTRAIT


class LayoutParameters(_Model):
    design_type: DesignType = DesignType.FIXED_TILT
    tilt_angle: float | None = None
    row_spacing: float | None = None
    gcr: float | None = None
    perimeter_road_width: float = 6.0
    module: ModuleSpec = Field(default_factory=ModuleSpec)
    table: TableConfig = Field(default_factory=TableConfig)
    table_gap_ew: float = 1.0
    table_gap_ns: float = 0.0
    max_strings_per_inverter: int = 20
    design_mode: DesignMode = DesignMode.STRING_INVERTER
    max_smb_per_central_inv: int = 10
    enable_cable_calc: bool = False


# ---------------------------------------------------------------------------
# Placed objects (layout outputs)
# ---------------------------------------------------------------------------


class PlacedTable(_Model):
    x: float
    y: float
    width: float
    height: float
    row_index: int
    col_index: int


class PlacedRoad(_Model):
    points_utm: list[UTMPoint]
    index: int = 0
    road_type: str = "rectangle"


class PlacedICR(_Model):
    x: float
    y: float
    width: float = 40.0
    height: float = 14.0
    index: int = 0


class PlacedStringInverter(_Model):
    x: float
    y: float
    width: float = 2.0
    height: float = 1.0
    index: int = 0
    capacity_kwp: float = 0.0
    assigned_table_count: int = 0


class CableRun(_Model):
    start_utm: UTMPoint
    end_utm: UTMPoint
    route_utm: list[UTMPoint] = Field(default_factory=list)
    index: int = 0
    cable_type: str = "dc"
    length_m: float = 0.0


class PlacedLA(_Model):
    x: float
    y: float
    width: float = 40.0
    height: float = 14.0
    radius: float = 100.0
    index: int = 0


# ---------------------------------------------------------------------------
# Energy model
# ---------------------------------------------------------------------------


class EnergyParameters(_Model):
    ghi_kwh_m2_yr: float = 0.0
    gti_kwh_m2_yr: float = 0.0
    irradiance_source: str = "manual"
    inverter_efficiency_pct: float = 97.0
    dc_cable_loss_pct: float = 2.0
    ac_cable_loss_pct: float = 1.0
    soiling_loss_pct: float = 4.0
    temperature_loss_pct: float = 6.0
    mismatch_loss_pct: float = 2.0
    shading_loss_pct: float = 2.0
    availability_pct: float = 98.0
    transformer_loss_pct: float = 1.0
    other_loss_pct: float = 1.0
    first_year_degradation_pct: float = 2.0
    annual_degradation_pct: float = 0.5
    plant_lifetime_years: int = 25
    module_name: str = ""
    inverter_name: str = ""
    inverter_pnom_kw: float = 0.0
    mu_pmpp_pct_per_c: float = 0.0
    noct_c: float = 0.0
    ambient_temp_avg_c: float = 28.0
    sandia_mounting_type: str = "Open Rack – Ground Mount"
    sandia_wind_speed_m_s: float = 3.0
    sandia_coeff_a: float = -3.56
    sandia_coeff_b: float = -0.075
    sandia_irradiance_w_m2: float = 600.0
    sandia_t_module_c: float = 0.0
    combined_uncertainty_pct: float = 7.5
    p1_exceedance: float = 50.0
    p2_exceedance: float = 75.0
    p3_exceedance: float = 90.0
    is_bifacial: bool = False
    bifaciality_factor: float = 0.70
    ground_albedo: float = 0.25
    site_gcr: float = 0.0
    weather_source: str = "pvgis_api"
    pvgis_file_path: str = ""
    site_lat: float = 20.0
    site_tilt_deg: float = 20.0
    site_azimuth_pvgis: float = 0.0
    monthly_ghi_kwh_m2: list[float] = Field(default_factory=list)
    monthly_gti_kwh_m2: list[float] = Field(default_factory=list)
    hourly_timestamps: list[str] = Field(default_factory=list)
    hourly_ghi_wm2: list[float] = Field(default_factory=list)
    hourly_gti_wm2: list[float] = Field(default_factory=list)
    hourly_temp_c: list[float] = Field(default_factory=list)


class EnergyResult(_Model):
    performance_ratio: float = 0.0
    gti_kwh_m2_yr: float = 0.0
    specific_yield_kwh_kwp_yr: float = 0.0
    year1_energy_mwh: float = 0.0
    cuf_pct: float = 0.0
    lifetime_energy_mwh: float = 0.0
    yearly_energy_mwh: list[float] = Field(default_factory=list)
    p1_label: str = "P50"
    p2_label: str = "P75"
    p3_label: str = "P90"
    p1_year1_mwh: float = 0.0
    p2_year1_mwh: float = 0.0
    p3_year1_mwh: float = 0.0
    p1_lifetime_mwh: float = 0.0
    p2_lifetime_mwh: float = 0.0
    p3_lifetime_mwh: float = 0.0
    bifacial_gain_pct: float = 0.0
    pvgis_correction_factor: float = 1.0
    monthly_ghi_kwh_m2: list[float] = Field(default_factory=list)
    monthly_gti_kwh_m2: list[float] = Field(default_factory=list)
    monthly_energy_mwh: list[float] = Field(default_factory=list)
    monthly_pr: list[float] = Field(default_factory=list)
    monthly_amb_temp_c: list[float] = Field(default_factory=list)
    monthly_cell_temp_c: list[float] = Field(default_factory=list)
    monthly_yr: list[float] = Field(default_factory=list)
    monthly_yf: list[float] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# LayoutResult — the full output bundle.
# NOTE: `usable_polygon` (shapely) is omitted by design.
# ---------------------------------------------------------------------------


class LayoutResult(_Model):
    boundary_name: str = ""
    placed_tables: list[PlacedTable] = Field(default_factory=list)
    placed_icrs: list[PlacedICR] = Field(default_factory=list)
    placed_roads: list[PlacedRoad] = Field(default_factory=list)
    tables_pre_icr: list[PlacedTable] = Field(default_factory=list)
    total_modules: int = 0
    total_capacity_kwp: float = 0.0
    total_capacity_mwp: float = 0.0
    total_area_m2: float = 0.0
    total_area_acres: float = 0.0
    net_layout_area_m2: float = 0.0
    gcr_achieved: float = 0.0
    row_pitch_m: float = 0.0
    tilt_angle_deg: float = 0.0
    utm_epsg: int = 0
    boundary_wgs84: list[UTMPoint] = Field(default_factory=list)
    obstacle_polygons_wgs84: list[list[UTMPoint]] = Field(default_factory=list)
    placed_string_inverters: list[PlacedStringInverter] = Field(default_factory=list)
    dc_cable_runs: list[CableRun] = Field(default_factory=list)
    ac_cable_runs: list[CableRun] = Field(default_factory=list)
    total_dc_cable_m: float = 0.0
    total_ac_cable_m: float = 0.0
    string_kwp: float = 0.0
    inverter_capacity_kwp: float = 0.0
    num_string_inverters: int = 0
    inverters_per_icr: float = 0.0
    placed_las: list[PlacedLA] = Field(default_factory=list)
    num_las: int = 0
    num_central_inverters: int = 0
    central_inverter_capacity_kwp: float = 0.0
    plant_ac_capacity_mw: float = 0.0
    dc_ac_ratio: float = 0.0
    energy_result: EnergyResult | None = None


# ---------------------------------------------------------------------------
# Parsed KMZ wire format (output of /parse-kmz; input to /layout)
# ---------------------------------------------------------------------------

# A WGS84 coordinate pair (lon, lat) in degrees.
Wgs84Point = tuple[float, float]


class BoundaryInfo(_Model):
    """One plant boundary polygon with its associated inner obstacles
    and line obstructions (TL corridors, canals, roads).

    Coordinates are WGS84 (lon, lat) in degrees — same convention the
    domain engine uses internally.
    """

    name: str
    coords: list[Wgs84Point]
    obstacles: list[list[Wgs84Point]] = Field(default_factory=list)
    line_obstructions: list[list[Wgs84Point]] = Field(default_factory=list)


class ParsedKMZ(_Model):
    """Output of /parse-kmz; input to /layout."""

    boundaries: list[BoundaryInfo] = Field(default_factory=list)
    centroid_lat: float = 0.0
    centroid_lon: float = 0.0


# ---------------------------------------------------------------------------
# Request / response envelopes for the real routes (S3)
# ---------------------------------------------------------------------------


class LayoutRequest(_Model):
    """POST /layout body."""

    parsed_kmz: ParsedKMZ
    params: LayoutParameters


class LayoutResponse(_Model):
    """POST /layout response — one result per boundary in the KMZ."""

    results: list[LayoutResult]


class RefreshInvertersRequest(_Model):
    """POST /refresh-inverters body.

    The client sends back the previous ``result`` (possibly with updated
    ICR positions) plus the current ``params``; the sidecar rebuilds
    ``usable_polygon`` from the result's persisted fields and reruns
    lightning-arrester + string-inverter placement.
    """

    result: LayoutResult
    params: LayoutParameters


# ---------------------------------------------------------------------------
# Health + error payloads (sidecar-specific, no domain twin).
# ---------------------------------------------------------------------------


class HealthResponse(_Model):
    status: str = "ok"
    version: str


class ErrorResponse(_Model):
    error: str
    detail: str | None = None


# ---------------------------------------------------------------------------
# Registry — list of schemas surfaced via /_schemas/echo/* dev endpoints so
# they appear in OpenAPI / Swagger UI.
# Dev-only; the echo routes are removed in S3 (after real routes take over).
# ---------------------------------------------------------------------------

SCHEMAS_FOR_INSPECTION: dict[str, type[_Model]] = {
    "layout-parameters": LayoutParameters,
    "module-spec": ModuleSpec,
    "table-config": TableConfig,
    "placed-table": PlacedTable,
    "placed-road": PlacedRoad,
    "placed-icr": PlacedICR,
    "placed-string-inverter": PlacedStringInverter,
    "cable-run": CableRun,
    "placed-la": PlacedLA,
    "energy-parameters": EnergyParameters,
    "energy-result": EnergyResult,
    "layout-result": LayoutResult,
}

