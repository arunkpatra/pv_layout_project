"""
Data classes for the PV Layout tool.
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple
from enum import Enum


class DesignType(Enum):
    FIXED_TILT = "fixed_tilt"
    SINGLE_AXIS_TRACKER = "single_axis_tracker"


class Orientation(Enum):
    PORTRAIT = "portrait"
    LANDSCAPE = "landscape"


class DesignMode(Enum):
    STRING_INVERTER  = "string_inverter"   # Standard string inverter topology
    CENTRAL_INVERTER = "central_inverter"  # Central inverter via SMBs


@dataclass
class ModuleSpec:
    """Solar module physical and electrical specifications."""
    length: float = 2.38         # metres (long side)
    width: float = 1.13          # metres (short side)
    wattage: float = 580.0       # Wp

    @property
    def area(self) -> float:
        return self.length * self.width


@dataclass
class TableConfig:
    """Configuration for a panel table (rack)."""
    modules_in_row: int = 28         # modules placed side by side along table width
    rows_per_table: int = 2          # number of module rows stacked vertically
    orientation: Orientation = Orientation.PORTRAIT

    def table_dimensions(self, module: ModuleSpec) -> Tuple[float, float]:
        """
        Fixed-tilt dimensions.
        Returns (table_width, table_height):
          table_width  = E-W dimension  (modules_in_row × module short/long side)
          table_height = N-S dimension  (rows_per_table × module long/short side)
        """
        if self.orientation == Orientation.PORTRAIT:
            mod_w = module.width    # short side → E-W
            mod_h = module.length   # long side  → N-S
        else:
            mod_w = module.length   # long side  → E-W
            mod_h = module.width    # short side → N-S

        table_width  = mod_w * self.modules_in_row
        table_height = mod_h * self.rows_per_table
        return table_width, table_height

    def modules_per_table(self) -> int:
        return self.modules_in_row * self.rows_per_table


@dataclass
class LayoutParameters:
    """All parameters that drive the layout calculation."""
    design_type: DesignType = DesignType.FIXED_TILT
    tilt_angle: Optional[float] = None        # degrees; None = auto from latitude
    row_spacing: Optional[float] = None       # metres, pitch; None = auto
    gcr: Optional[float] = None               # ground coverage ratio; alternative to row_spacing
    perimeter_road_width: float = 6.0         # metres
    module: ModuleSpec = field(default_factory=ModuleSpec)
    table: TableConfig = field(default_factory=TableConfig)
    # Gap between tables in same row (EW gap)
    table_gap_ew: float = 1.0                 # metres (default 1 m between tables)
    # Gap between table rows (additional to shadow-free pitch)
    table_gap_ns: float = 0.0                 # metres (added on top of calculated pitch)
    max_strings_per_inverter: int = 20        # max strings per string inverter OR per SMB
    # Design mode — determines inverter topology
    design_mode: DesignMode = DesignMode.STRING_INVERTER
    # Central Inverter mode only — max SMBs connected to one central inverter
    max_smb_per_central_inv: int = 10
    # When False, skip cable routing (DC string cables + AC/DC-to-ICR cables).
    # Inverter/SMB counts are still computed; cable length columns show "—".
    enable_cable_calc: bool = False
    # S11.5: additive cable-length allowances. Defaults preserve pre-S11.5
    # numeric behaviour (constants 4.0 m and 10.0 m were hard-coded in
    # string_inverter_manager.place_string_inverters). Exposed for
    # customer-site tuning without code changes. Typical EPC practice:
    #   ac_termination_allowance_m: 3–5 m combined inverter + ICR termination.
    #   dc_per_string_allowance_m:  6–12 m per string (panel jumpers +
    #                               row-end pigtails + termination slack).
    ac_termination_allowance_m: float = 4.0
    dc_per_string_allowance_m: float = 10.0

    # ── Single Axis Tracker (SAT / HSAT) parameters ──────────────────────────
    # Only used when design_type == DesignType.SINGLE_AXIS_TRACKER.
    # The tracker rotation axis runs North–South; panels sweep East–West.
    #
    # Layout geometry:
    #   tracker_width  (E-W aperture) = tracker_modules_across × module.width
    #   tracker_ns_len (N-S length)   = tracker_modules_per_string × module.length
    #   E-W pitch between tracker rows = tracker_width / tracker_gcr
    #   N-S step inside a row          = tracker_ns_len + tracker_ns_gap_m
    tracker_modules_across: int = 1               # modules side-by-side E-W (1, 2, 4 …)
    tracker_strings_per_tracker: int = 2          # strings sharing one torque-tube unit
    tracker_modules_per_string: int = 28          # modules per string along N-S axis
    # "portrait"  (P): module long side runs E-W across the aperture
    # "landscape" (L): module long side runs N-S along the torque tube
    tracker_orientation: str = "portrait"
    tracker_pitch_ew_m: float = 5.5               # E-W pitch between tracker rows (m)
    tracker_ns_gap_m: float = 2.0                 # N-S service gap between tracker units (m)
    tracker_max_angle_deg: float = 55.0           # maximum rotation angle ± (degrees)
    tracker_height_m: float = 1.5                 # tracker column/hub height from ground (m)


@dataclass
class PlacedTable:
    """A table that has been placed at a specific location in the layout."""
    x: float          # UTM easting of table origin (bottom-left corner), metres
    y: float          # UTM northing of table origin, metres
    width: float      # table width in metres
    height: float     # table height in metres
    row_index: int    # which row this table belongs to
    col_index: int    # position within the row


@dataclass
class PlacedRoad:
    """An internal road area drawn by the user."""
    points_utm: List[Tuple[float, float]]   # polygon vertices in UTM metres
    index: int = 0
    road_type: str = "rectangle"            # "rectangle" or "polygon"


# ICR: Inverter Control Room
ICR_EW = 40.0    # metres (E-W dimension)
ICR_NS = 14.0    # metres (N-S dimension)
ICR_MWP_PER_UNIT = 18.0   # one ICR per this many MWp

# Keep legacy aliases so existing references don't break
ICR_WIDTH  = ICR_EW
ICR_LENGTH = ICR_NS


@dataclass
class PlacedICR:
    """An ICR building placed in the layout."""
    x: float          # UTM easting of bottom-left corner
    y: float          # UTM northing of bottom-left corner
    width: float  = ICR_EW    # E-W dimension (40 m)
    height: float = ICR_NS    # N-S dimension (14 m)
    index: int = 0            # ICR number (1-based label)


@dataclass
class PlacedStringInverter:
    """A string inverter placed in the layout (2 m E-W × 1 m N-S)."""
    x: float          # UTM easting of bottom-left corner
    y: float          # UTM northing of bottom-left corner
    width: float = 2.0
    height: float = 1.0
    index: int = 0
    capacity_kwp: float = 0.0
    assigned_table_count: int = 0


@dataclass
class CableRun:
    """A DC or AC cable run between two UTM points."""
    start_utm: Tuple[float, float]
    end_utm: Tuple[float, float]
    route_utm: List[Tuple[float, float]] = field(default_factory=list)  # full routed path
    index: int = 0
    cable_type: str = "dc"   # "dc" or "ac"
    length_m: float = 0.0
    # S11.5: routing quality tag, set by string_inverter_manager.
    #   "ok"                 — resolved via patterns A/A2/A3/A4/B/C/D/E (all segments inside polygon).
    #   "best_effort"        — resolved via Pattern F, all segments still inside polygon.
    #   "boundary_violation" — resolved via Pattern F and at least one segment leaves polygon.
    # Frontend renders "boundary_violation" cables with a warning affordance
    # (dashed stroke / warning icon in tooltip). Default "ok" keeps
    # pre-S11.5 serialisation byte-similar for legacy-produced results.
    route_quality: str = "ok"


# LA: Lightning Arrester
LA_EW     = 40.0    # metres (E-W dimension) — same footprint as ICR
LA_NS     = 14.0    # metres (N-S dimension)
LA_RADIUS = 100.0   # metres — protection radius per unit


@dataclass
class PlacedLA:
    """A Lightning Arrester placed in the layout."""
    x: float           # UTM easting of bottom-left corner
    y: float           # UTM northing of bottom-left corner
    width: float  = LA_EW      # E-W dimension (40 m)
    height: float = LA_NS      # N-S dimension (14 m)
    radius: float = LA_RADIUS  # protection radius (100 m)
    index: int = 0


M2_PER_ACRE = 4046.8564


@dataclass
class EnergyParameters:
    """Parameters for energy yield calculation."""
    # Irradiance — filled by auto-fetch or manual entry
    ghi_kwh_m2_yr: float = 0.0           # Global Horizontal Irradiance (kWh/m²/yr)
    gti_kwh_m2_yr: float = 0.0           # Global Tilted Irradiance (kWh/m²/yr)
    irradiance_source: str = "manual"    # "pvgis", "nasa_power", "manual"

    # PR component losses (in %)
    inverter_efficiency_pct: float = 97.0    # inverter DC→AC conversion efficiency
    dc_cable_loss_pct: float = 2.0           # DC wiring losses
    ac_cable_loss_pct: float = 1.0           # AC wiring losses
    soiling_loss_pct: float = 4.0            # dust / dirt losses
    temperature_loss_pct: float = 6.0        # module temperature derating
    mismatch_loss_pct: float = 2.0           # module mismatch within strings
    shading_loss_pct: float = 2.0            # near shading (objects, horizon)
    availability_pct: float = 98.0           # plant availability / uptime
    transformer_loss_pct: float = 1.0        # MV transformer losses
    other_loss_pct: float = 1.0              # monitoring, auxiliary, misc

    # Degradation
    first_year_degradation_pct: float = 2.0  # Year 1 LID degradation
    annual_degradation_pct: float = 0.5      # Annual degradation from Year 2 onwards

    # Lifetime
    plant_lifetime_years: int = 25

    # PAN / OND file provenance (informational — for PDF display)
    module_name: str = ""           # e.g. "JA Solar  JAM72D30-550/MB  (550 Wp)"
    inverter_name: str = ""         # e.g. "SMA  Sunny Highpower PEAK3-100  (100 kW)"
    inverter_pnom_kw: float = 0.0   # Pnom (nominal AC power) from OND file (kW per inverter)
    mu_pmpp_pct_per_c: float = 0.0  # from PAN; used in temperature loss calculation
    noct_c: float = 0.0             # from PAN; used in temperature loss calculation
    ambient_temp_avg_c: float = 28.0  # site average annual ambient temperature (°C)

    # Sandia / SAPM thermal model parameters (Pro Plus — temperature loss)
    sandia_mounting_type: str = "Open Rack – Ground Mount"
    sandia_wind_speed_m_s: float = 3.0    # average annual wind speed (m/s)
    sandia_coeff_a: float = -3.56         # Sandia 'a' coefficient
    sandia_coeff_b: float = -0.075        # Sandia 'b' coefficient
    sandia_irradiance_w_m2: float = 600.0 # G: avg operating irradiance derived from GTI
    sandia_t_module_c: float = 0.0        # computed T_module from Sandia model (°C)

    # Probabilistic energy yield — P50 / P75 / P90
    # P_x = P50 × (1 − z_x × combined_uncertainty_pct/100)
    # z_x = inverse-normal CDF of exceedance probability x
    combined_uncertainty_pct: float = 7.5   # combined 1-sigma uncertainty (%)
    p1_exceedance: float = 50.0             # exceedance probability for column 1 (%)
    p2_exceedance: float = 75.0             # exceedance probability for column 2 (%)
    p3_exceedance: float = 90.0             # exceedance probability for column 3 (%)

    # Bifacial module parameters
    # When is_bifacial=True, a rear-irradiance gain is added to the energy yield.
    # Model: GTI_rear ≈ GHI × ground_albedo × F_ground_rear × (1 − GCR)
    #        F_ground_rear = (1 + cos(tilt)) / 2
    #        bifacial_gain = bifaciality_factor × GTI_rear / GTI_front
    is_bifacial: bool = False
    bifaciality_factor: float = 0.70   # φ: rear / front efficiency ratio (0.60–0.85)
    ground_albedo: float = 0.25        # ρ: ground reflectivity (grass≈0.20, concrete≈0.30)
    site_gcr: float = 0.0              # GCR from layout result (filled by MainWindow)

    # Weather data source selection
    # "pvgis_api"  — auto-fetch from PVGIS REST API (default)
    # "pvgis_file" — user loads any hourly CSV with Time + GHI columns
    # "manual"     — user enters GHI/GTI manually
    weather_source: str = "pvgis_api"
    pvgis_file_path: str = ""

    # Site geometry — set from layout result; used for GHI→GTI transposition
    site_lat: float = 20.0        # degrees (+ = North)
    site_tilt_deg: float = 20.0   # panel tilt from horizontal (degrees)
    site_azimuth_pvgis: float = 0.0  # 0=South for NH, 180=North for SH

    # Single Axis Tracker flags — set automatically when design_type == SAT
    is_sat: bool = False              # True → use HSAT tracking angle model
    sat_max_angle_deg: float = 55.0   # tracker rotation limit ±degrees

    # Monthly irradiance (12 values — kWh/m²/month).
    # Populated from PVGIS API monthly response or aggregated from hourly file.
    # Empty list → monthly table not shown.
    monthly_ghi_kwh_m2: List[float] = field(default_factory=list)
    monthly_gti_kwh_m2: List[float] = field(default_factory=list)

    # Hourly time-series for 15-min interpolation and monthly PR calculation.
    # Populated only when a GHI hourly file is loaded.
    # Length = number of hourly records (8760 for a full year).
    hourly_timestamps: List[str] = field(default_factory=list)   # "YYYY-MM-DD HH:MM"
    hourly_ghi_wm2: List[float] = field(default_factory=list)    # W/m² per hour
    hourly_gti_wm2: List[float] = field(default_factory=list)    # W/m² per hour
    hourly_temp_c: List[float] = field(default_factory=list)     # ambient °C per hour
    # (when hourly_temp_c is populated, monthly PR uses actual file temperatures
    #  instead of the sinusoidal seasonal model)


@dataclass
class EnergyResult:
    """Energy yield calculation results."""
    performance_ratio: float = 0.0            # calculated overall PR (0–1)
    gti_kwh_m2_yr: float = 0.0               # in-plane irradiance used (kWh/m²/yr)
    specific_yield_kwh_kwp_yr: float = 0.0   # kWh/kWp/year (Year 1, pre-degradation)
    year1_energy_mwh: float = 0.0            # Year 1 AC energy — P50 (MWh)
    cuf_pct: float = 0.0                     # Capacity Utilisation Factor (%)
    lifetime_energy_mwh: float = 0.0         # Total lifetime energy — P50 (MWh)
    yearly_energy_mwh: List[float] = field(default_factory=list)  # year-by-year P50 (MWh)
    # Probabilistic yields
    p1_label: str = "P50"
    p2_label: str = "P75"
    p3_label: str = "P90"
    p1_year1_mwh: float = 0.0               # Year 1 energy at exceedance prob 1
    p2_year1_mwh: float = 0.0               # Year 1 energy at exceedance prob 2
    p3_year1_mwh: float = 0.0               # Year 1 energy at exceedance prob 3
    p1_lifetime_mwh: float = 0.0            # Lifetime energy at exceedance prob 1
    p2_lifetime_mwh: float = 0.0            # Lifetime energy at exceedance prob 2
    p3_lifetime_mwh: float = 0.0            # Lifetime energy at exceedance prob 3

    # Bifacial gain actually applied in this result
    bifacial_gain_pct: float = 0.0   # % (0 = monofacial or not calculated)
    # PVGIS API correction factor applied (1.05 for PVGIS API, 1.0 otherwise)
    pvgis_correction_factor: float = 1.0

    # Monthly breakdown — Year 1 (12 values each; empty list = not available)
    monthly_ghi_kwh_m2: List[float] = field(default_factory=list)    # kWh/m²/month
    monthly_gti_kwh_m2: List[float] = field(default_factory=list)    # kWh/m²/month
    monthly_energy_mwh: List[float] = field(default_factory=list)    # MWh/month
    monthly_pr: List[float] = field(default_factory=list)            # % (0–100)
    # IEC 61724-1 monthly quantities
    monthly_amb_temp_c: List[float] = field(default_factory=list)    # T_amb (°C)
    monthly_cell_temp_c: List[float] = field(default_factory=list)   # T_cell (°C)
    monthly_yr: List[float] = field(default_factory=list)            # Y_r = H_i/G_STC (h)
    monthly_yf: List[float] = field(default_factory=list)            # Y_f = E_AC/P_0 (kWh/kWp)


@dataclass
class LayoutResult:
    """Output of the layout engine."""
    boundary_name: str = ""
    design_type: DesignType = DesignType.FIXED_TILT   # SAT vs fixed-tilt
    placed_tables: List[PlacedTable] = field(default_factory=list)
    placed_icrs: List[PlacedICR] = field(default_factory=list)
    placed_roads: List[PlacedRoad] = field(default_factory=list)
    # Full table list BEFORE ICR clearance — used to recompute after ICR is moved
    tables_pre_icr: List[PlacedTable] = field(default_factory=list)
    # Shapely usable polygon (post road-setback) — used to validate ICR drag position
    usable_polygon: Any = field(default=None, repr=False, compare=False)
    # Shapely full boundary polygon (pre road-setback) — used for cable routing so
    # cables may run inside the perimeter road band but not outside the plant fence.
    boundary_polygon: Any = field(default=None, repr=False, compare=False)
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
    boundary_wgs84: List[Tuple[float, float]] = field(default_factory=list)
    obstacle_polygons_wgs84: List[List[Tuple[float, float]]] = field(default_factory=list)
    # Water-body obstacles (ponds, canals, reservoirs) — rendered in blue on the canvas
    water_obstacle_polygons_wgs84: List[List[Tuple[float, float]]] = field(default_factory=list)
    # String inverter layout
    placed_string_inverters: List[PlacedStringInverter] = field(default_factory=list)
    dc_cable_runs: List[CableRun] = field(default_factory=list)
    ac_cable_runs: List[CableRun] = field(default_factory=list)
    total_dc_cable_m: float = 0.0
    total_ac_cable_m: float = 0.0
    # S11.5: additive per-inverter / per-ICR AC subtotals. Keys are
    # inverter index (PlacedStringInverter.index, 1-based) and ICR array
    # position (0-based, matches placed_icrs index). Empty dicts before
    # S11.5 runs or when cables are disabled.
    ac_cable_m_per_inverter: Dict[int, float] = field(default_factory=dict)
    ac_cable_m_per_icr: Dict[int, float] = field(default_factory=dict)
    string_kwp: float = 0.0
    inverter_capacity_kwp: float = 0.0
    num_string_inverters: int = 0
    inverters_per_icr: float = 0.0
    # Lightning arresters
    placed_las: List[PlacedLA] = field(default_factory=list)
    num_las: int = 0
    # Central Inverter mode — populated by string_inverter_manager
    num_central_inverters: int = 0
    central_inverter_capacity_kwp: float = 0.0
    # Plant AC capacity & DC/AC ratio (populated after energy calculation using OND Pnom)
    plant_ac_capacity_mw: float = 0.0   # = pnom_kw × num_string_inverters (or central inv) / 1000
    dc_ac_ratio: float = 0.0            # = total_capacity_mwp / plant_ac_capacity_mw
    # Energy yield (populated after energy calculation)
    energy_result: Optional['EnergyResult'] = field(default=None, repr=False, compare=False)
