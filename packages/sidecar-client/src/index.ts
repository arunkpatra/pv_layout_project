/**
 * SolarLayout sidecar client.
 *
 * All requests:
 *   * target http://<host>:<port>
 *   * carry an `Authorization: Bearer <token>` header
 *   * throw SidecarError on any non-2xx response
 *
 * Types mirror the pydantic schemas in
 * `python/pvlayout_engine/pvlayout_engine/schemas.py`. Any drift here
 * surfaces as a TS error at the call site (no runtime Zod validation —
 * the sidecar is trusted, loopback-only, token-gated).
 */

// ─────────────────────────────────────────────────────────────────────
// Types — mirror pvlayout_engine.schemas
// ─────────────────────────────────────────────────────────────────────

export type Wgs84Point = [number, number] // (lon, lat)

export interface ParsedBoundary {
  name: string
  coords: Wgs84Point[]
  obstacles: Wgs84Point[][]
  line_obstructions: Wgs84Point[][]
}

export interface ParsedKMZ {
  boundaries: ParsedBoundary[]
  centroid_lat: number
  centroid_lon: number
}

export interface HealthResponse {
  status: string
  version: string
}

// ─────────────────────────────────────────────────────────────────────
// Layout — types only (S8.8); the runLayout() method lands in S9.
// Shapes mirror pvlayout_engine.schemas.LayoutParameters / LayoutResult.
// ─────────────────────────────────────────────────────────────────────

/** UTM (easting, northing) — metres. */
export type UTMPoint = [number, number]

export type DesignType = "fixed_tilt"
export type Orientation = "portrait" | "landscape"
export type DesignMode = "string_inverter" | "central_inverter"

export interface ModuleSpec {
  length: number
  width: number
  wattage: number
}

export interface TableConfig {
  modules_in_row: number
  rows_per_table: number
  orientation: Orientation
}

export interface LayoutParameters {
  design_type: DesignType
  /** `null` = auto-derive from latitude. */
  tilt_angle: number | null
  /** `null` = auto-derive from latitude + tilt for zero winter-solstice shading. */
  row_spacing: number | null
  /** Optional alternative to row_spacing. */
  gcr: number | null
  perimeter_road_width: number
  module: ModuleSpec
  table: TableConfig
  table_gap_ew: number
  table_gap_ns: number
  max_strings_per_inverter: number
  design_mode: DesignMode
  max_smb_per_central_inv: number
  enable_cable_calc: boolean
}

/** Default LayoutParameters — mirrors the pydantic field defaults. */
export const DEFAULT_LAYOUT_PARAMETERS: LayoutParameters = {
  design_type: "fixed_tilt",
  tilt_angle: null,
  row_spacing: null,
  gcr: null,
  perimeter_road_width: 6.0,
  module: {
    length: 2.38,
    width: 1.13,
    wattage: 580.0,
  },
  table: {
    modules_in_row: 28,
    rows_per_table: 2,
    orientation: "portrait",
  },
  table_gap_ew: 1.0,
  table_gap_ns: 0.0,
  max_strings_per_inverter: 20,
  design_mode: "string_inverter",
  max_smb_per_central_inv: 10,
  enable_cable_calc: false,
}

export interface PlacedTable {
  x: number
  y: number
  width: number
  height: number
  row_index: number
  col_index: number
}

export interface PlacedRoad {
  points_utm: UTMPoint[]
  index: number
  road_type: string
}

export interface PlacedICR {
  x: number
  y: number
  width: number
  height: number
  index: number
}

export interface PlacedStringInverter {
  x: number
  y: number
  width: number
  height: number
  index: number
  capacity_kwp: number
  assigned_table_count: number
}

export interface CableRun {
  start_utm: UTMPoint
  end_utm: UTMPoint
  route_utm: UTMPoint[]
  index: number
  cable_type: string
  length_m: number
}

export interface PlacedLA {
  x: number
  y: number
  width: number
  height: number
  radius: number
  index: number
}

/**
 * LayoutResult — mirror of pvlayout_engine.schemas.LayoutResult.
 *
 * `energy_result` is omitted for now — populated only when /energy-yield
 * is called (S13). The `placed_tables`, `placed_icrs`, etc. are in UTM
 * (metres). S9 adds `placed_tables_wgs84` / `placed_icrs_wgs84` so the
 * MapCanvas can render without client-side projection.
 */
export interface LayoutResult {
  boundary_name: string
  placed_tables: PlacedTable[]
  placed_icrs: PlacedICR[]
  placed_roads: PlacedRoad[]
  tables_pre_icr: PlacedTable[]
  total_modules: number
  total_capacity_kwp: number
  total_capacity_mwp: number
  total_area_m2: number
  total_area_acres: number
  net_layout_area_m2: number
  gcr_achieved: number
  row_pitch_m: number
  tilt_angle_deg: number
  utm_epsg: number
  boundary_wgs84: UTMPoint[]
  obstacle_polygons_wgs84: UTMPoint[][]
  /**
   * WGS84 (lon, lat) corner rings — same length and order as
   * `placed_tables` / `placed_icrs`. Each ring is closed (first === last)
   * with 5 points. Pre-projected on the sidecar (S9) so the desktop can
   * render polygons without client-side projection work.
   */
  placed_tables_wgs84: UTMPoint[][]
  placed_icrs_wgs84: UTMPoint[][]
  placed_string_inverters: PlacedStringInverter[]
  dc_cable_runs: CableRun[]
  ac_cable_runs: CableRun[]
  total_dc_cable_m: number
  total_ac_cable_m: number
  string_kwp: number
  inverter_capacity_kwp: number
  num_string_inverters: number
  inverters_per_icr: number
  placed_las: PlacedLA[]
  num_las: number
  num_central_inverters: number
  central_inverter_capacity_kwp: number
  plant_ac_capacity_mw: number
  dc_ac_ratio: number
}

// ─────────────────────────────────────────────────────────────────────
// Client
// ─────────────────────────────────────────────────────────────────────

export interface SidecarClientOptions {
  host: string
  port: number
  token: string
  /** Override fetch implementation for tests / Tauri plugin-http. */
  fetchImpl?: typeof fetch
}

/** /layout request envelope. */
export interface LayoutRequest {
  parsed_kmz: ParsedKMZ
  params: LayoutParameters
}

/** /layout response envelope (one LayoutResult per boundary in the input). */
export interface LayoutResponse {
  results: LayoutResult[]
}

export interface SidecarClient {
  readonly baseUrl: string
  health(): Promise<HealthResponse>
  parseKmz(file: Blob | File, filename?: string): Promise<ParsedKMZ>
  /**
   * Run the full layout pipeline (table placement → ICR placement →
   * lightning arresters → string inverters) for every boundary in the
   * parsed KMZ. Returns one LayoutResult per boundary.
   */
  runLayout(parsedKmz: ParsedKMZ, params: LayoutParameters): Promise<LayoutResult[]>
}

export class SidecarError extends Error {
  readonly status: number
  readonly body: unknown
  constructor(status: number, message: string, body: unknown) {
    super(message)
    this.name = "SidecarError"
    this.status = status
    this.body = body
  }
}

export function createSidecarClient(opts: SidecarClientOptions): SidecarClient {
  const baseUrl = `http://${opts.host}:${opts.port}`
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch
  const authHeader = { Authorization: `Bearer ${opts.token}` } as const

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: { ...authHeader, ...(init?.headers ?? {}) },
    })
    if (!response.ok) {
      let body: unknown = null
      try {
        body = await response.json()
      } catch {
        // body may be empty — swallow
      }
      const message = extractError(body) ?? `Sidecar ${path} returned ${response.status}`
      throw new SidecarError(response.status, message, body)
    }
    return (await response.json()) as T
  }

  return {
    baseUrl,

    health(): Promise<HealthResponse> {
      return request<HealthResponse>("/health")
    },

    async runLayout(
      parsedKmz: ParsedKMZ,
      params: LayoutParameters
    ): Promise<LayoutResult[]> {
      const body: LayoutRequest = { parsed_kmz: parsedKmz, params }
      const response = await request<LayoutResponse>("/layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      return response.results
    },

    async parseKmz(file: Blob | File, filename?: string): Promise<ParsedKMZ> {
      const fd = new FormData()
      // FastAPI's `UploadFile` binds to the `file` multipart field name.
      // A filename is required so the server can check the .kmz/.kml
      // extension — fall back to a generic name if the caller omitted it.
      const resolvedName =
        filename ?? (file instanceof File ? file.name : "upload.kmz")
      fd.append("file", file, resolvedName)
      return request<ParsedKMZ>("/parse-kmz", {
        method: "POST",
        body: fd,
      })
    },
  }
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Pull a human-readable error message out of FastAPI's default error
 * body (`{ "detail": "..." }`) or our custom shape (`{ error, detail? }`).
 */
function extractError(body: unknown): string | null {
  if (!body || typeof body !== "object") return null
  const b = body as Record<string, unknown>
  if (typeof b.detail === "string") return b.detail
  if (typeof b.error === "string") return b.error
  return null
}
