"""
Data classes for the PV Layout tool.
"""
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, List, Optional, Tuple


class DesignType(Enum):
    FIXED_TILT = "fixed_tilt"


class Orientation(Enum):
    PORTRAIT = "portrait"
    LANDSCAPE = "landscape"


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
    max_strings_per_inverter: int = 20        # max strings connected to one inverter


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


@dataclass
class EnergyResult:
    """Energy yield calculation results."""
    performance_ratio: float = 0.0            # calculated overall PR (0–1)
    gti_kwh_m2_yr: float = 0.0               # in-plane irradiance used (kWh/m²/yr)
    specific_yield_kwh_kwp_yr: float = 0.0   # kWh/kWp/year (Year 1, pre-degradation)
    year1_energy_mwh: float = 0.0            # Year 1 AC energy (MWh)
    cuf_pct: float = 0.0                     # Capacity Utilisation Factor (%)
    lifetime_energy_mwh: float = 0.0         # Total energy over plant lifetime (MWh)
    yearly_energy_mwh: List[float] = field(default_factory=list)  # year-by-year (MWh)


@dataclass
class LayoutResult:
    """Output of the layout engine."""
    boundary_name: str = ""
    placed_tables: List[PlacedTable] = field(default_factory=list)
    placed_icrs: List[PlacedICR] = field(default_factory=list)
    placed_roads: List[PlacedRoad] = field(default_factory=list)
    # Full table list BEFORE ICR clearance — used to recompute after ICR is moved
    tables_pre_icr: List[PlacedTable] = field(default_factory=list)
    # Shapely usable polygon (post road-setback) — used to validate ICR drag position
    usable_polygon: Any = field(default=None, repr=False, compare=False)
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
    # String inverter layout
    placed_string_inverters: List[PlacedStringInverter] = field(default_factory=list)
    dc_cable_runs: List[CableRun] = field(default_factory=list)
    ac_cable_runs: List[CableRun] = field(default_factory=list)
    total_dc_cable_m: float = 0.0
    total_ac_cable_m: float = 0.0
    string_kwp: float = 0.0
    inverter_capacity_kwp: float = 0.0
    num_string_inverters: int = 0
    inverters_per_icr: float = 0.0
    # Lightning arresters
    placed_las: List[PlacedLA] = field(default_factory=list)
    num_las: int = 0
    # Energy yield (populated after energy calculation)
    energy_result: Optional['EnergyResult'] = field(default=None, repr=False, compare=False)
