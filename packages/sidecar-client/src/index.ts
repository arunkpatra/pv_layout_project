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
  /**
   * WGS84 rect corner rings for string inverters — same length and order
   * as `placed_string_inverters`. 5 points, closed (first === last).
   * Pre-projected on the sidecar (S10) so the desktop can render without
   * client-side projection.
   */
  placed_string_inverters_wgs84: UTMPoint[][]
  dc_cable_runs: CableRun[]
  /**
   * WGS84 polyline per DC cable run. Uses the routed path if present;
   * falls back to a straight `[start, end]` segment. Same length and
   * order as `dc_cable_runs`.
   */
  dc_cable_runs_wgs84: UTMPoint[][]
  ac_cable_runs: CableRun[]
  ac_cable_runs_wgs84: UTMPoint[][]
  total_dc_cable_m: number
  /**
   * Per-inverter copper BoM — sum of individual home-run distances per
   * inverter→ICR. Industry-standard EPC bill-of-materials length (what
   * a procurement team orders). Bit-identical to legacy.
   */
  total_ac_cable_m: number
  /**
   * MST trench length — sum of `ac_cable_runs[].length_m`. Represents
   * the physical cable trench / cable-tray corridor through the plant
   * (shared infrastructure). Distinct from `total_ac_cable_m` because
   * each inverter's copper run is dedicated, not shared. See PRD §2.2.
   */
  total_ac_cable_trench_m: number
  string_kwp: number
  inverter_capacity_kwp: number
  num_string_inverters: number
  inverters_per_icr: number
  placed_las: PlacedLA[]
  /**
   * WGS84 rect corner rings for LA footprints. Same length and order as
   * `placed_las`. 5 points, closed.
   */
  placed_las_wgs84: UTMPoint[][]
  /**
   * WGS84 polygon approximations of each LA's protection circle. Same
   * length and order as `placed_las`. 65 points (64 segments + closing),
   * sampled at `la.radius` metres from the LA centre on the sidecar.
   * MapCanvas renders these as translucent fills via the `las_circles`
   * layer when the LA visibility toggle is on.
   */
  placed_las_circles_wgs84: UTMPoint[][]
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

// ─────────────────────────────────────────────────────────────────────
// Async layout jobs (Spike 1 Phase 2) — POST/GET/DELETE /layout/jobs
//
// Same compute as POST /layout but the request returns a job_id
// immediately and the work runs server-side in a background thread.
// The desktop polls GET /layout/jobs/<id> every ~2 s until status is
// terminal (done / failed / cancelled), then reads the LayoutResponse
// from `result`. Wire shape is structurally identical to Spike 2's
// cloud version (Postgres-backed) — only the URL changes.
// ─────────────────────────────────────────────────────────────────────

export type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled"

/** Per-plot status in the live progress list. `cancelled` here means
 * the plot was queued and skipped because the job-level cancel arrived
 * before it could start; running plots that finished after cancel land
 * as `done`. */
export type PlotStatus = "queued" | "running" | "done" | "failed" | "cancelled"

/** Per-plot live state inside an async layout job. */
export interface PlotState {
  index: number
  name: string
  status: PlotStatus
  /** Epoch seconds (Unix time). `null` until the plot starts. */
  started_at: number | null
  /** Epoch seconds (Unix time). `null` while running. */
  ended_at: number | null
  /** Compact one-line message; populated when `status === "failed"`. */
  error: string | null
}

/** POST /layout/jobs response — kicks off an async layout job. */
export interface LayoutJobStartResponse {
  job_id: string
}

/** GET /layout/jobs/<id> response — full snapshot of job state.
 *
 * `result` is populated when status is terminal:
 *   - `done`: full LayoutResponse (success on every plot, or partial
 *     with some `failed` plot rows the desktop renders inline).
 *   - `cancelled`: partial LayoutResponse with whatever finished before
 *     the cancel landed; the rest are tagged `cancelled` in `plots`.
 *   - `failed`: catastrophic job-level error (parser, projection, etc.);
 *     `result` may be null.
 */
export interface LayoutJobState {
  job_id: string
  status: JobStatus
  plots_total: number
  plots_done: number
  plots_failed: number
  plots: PlotState[]
  result: LayoutResponse | null
}

/** DELETE /layout/jobs/<id> response. Cooperative cancel: pending plots
 * are skipped; already-running workers complete on their own. */
export interface LayoutJobCancelResponse {
  status: "cancelled"
  plots_done: number
}

/** DELETE /layout/jobs response — defense-in-depth wipe used by the
 * desktop's `clearAllPerUserSession` on license-key swap (S3-05) so no
 * per-user job state survives the auth-boundary transition. */
export interface LayoutJobsFlushResponse {
  status: "flushed"
  jobs_flushed: number
}

// ─────────────────────────────────────────────────────────────────────
// S11: per-ICR move overrides and obstruction add/remove
// ─────────────────────────────────────────────────────────────────────

/** Move the ICR at `icr_index` so its centroid lands at the given
 * WGS84 point. Sidecar projects to UTM via `result.utm_epsg`. */
export interface IcrOverrideWgs84 {
  icr_index: number
  new_center_wgs84: [number, number]
}

/** A user-drawn obstruction in WGS84. Projected server-side to UTM
 * before it's appended to `placed_roads`. */
export interface RoadInput {
  road_type: "rectangle" | "polygon" | "line"
  coords_wgs84: [number, number][]
}

export interface RefreshInvertersRequest {
  result: LayoutResult
  params: LayoutParameters
  /**
   * Optional ICR override applied in the same round-trip. The server
   * projects `new_center_wgs84` via `result.utm_epsg`, moves the ICR's
   * bottom-left corner so the rectangle's centroid lands at the
   * requested point, re-runs `recompute_tables`, then LA + string
   * inverter placement in the legacy order.
   */
  icr_override?: IcrOverrideWgs84
}

export interface AddRoadRequest {
  result: LayoutResult
  params: LayoutParameters
  road: RoadInput
}

export interface RemoveRoadRequest {
  result: LayoutResult
  params: LayoutParameters
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

  /**
   * Recompute LA + string-inverter placement for an existing result.
   * S11: pass `icr_override` to move an ICR in the same round-trip.
   */
  refreshInverters(request: RefreshInvertersRequest): Promise<LayoutResult>

  /** S11: append a user-drawn obstruction and recompute. */
  addRoad(request: AddRoadRequest): Promise<LayoutResult>

  /** S11: pop the most recently added obstruction (LIFO) and recompute. */
  removeLastRoad(request: RemoveRoadRequest): Promise<LayoutResult>

  /**
   * Spike 1 Phase 2 — async variant of runLayout.
   *
   * Returns immediately with a `job_id`. The desktop polls
   * `getLayoutJob(job_id)` every ~2 s until the returned `status` is
   * terminal (done / failed / cancelled), then reads the final
   * LayoutResponse from `state.result`.
   *
   * Same compute as `runLayout`; the difference is purely in the wire
   * shape — the underlying work (table placement → ICR placement →
   * lightning arresters → string inverters) is identical.
   */
  startLayoutJob(
    parsedKmz: ParsedKMZ,
    params: LayoutParameters
  ): Promise<LayoutJobStartResponse>

  /** Poll the current state of an async layout job. */
  getLayoutJob(jobId: string): Promise<LayoutJobState>

  /**
   * Request cooperative cancellation. Pending plots are marked
   * cancelled; already-running workers complete on their own (no clean
   * abort signal across process boundaries). The job's terminal state
   * preserves whatever finished as a partial result.
   */
  cancelLayoutJob(jobId: string): Promise<LayoutJobCancelResponse>

  /**
   * Flush every in-memory layout job (auth-boundary hygiene). Called
   * by the desktop's `clearAllPerUserSession` on license-key swap
   * (S3-05) so no per-user job state survives the swap. Best-effort —
   * errors are caught at the call site; the worst case is one
   * orphaned in-memory job that remains unreachable from the UI.
   */
  flushLayoutJobs(): Promise<LayoutJobsFlushResponse>

  /**
   * SP1 / B23 — render a single LayoutResult to a 400×300 WebP preview
   * image. Returns the raw WebP bytes ready for PUT against the
   * deterministic-key thumbnail S3 path.
   *
   * Caller responsibilities (P6 flow extension):
   *   1. Call `renderLayoutThumbnail(result)` after `runLayout`.
   *   2. Mint a B7 upload URL via
   *      `entitlementsClient.getRunResultUploadUrl(key, { type: "thumbnail", projectId, runId, size })`.
   *   3. PUT the bytes to the returned URL with `Content-Type: image/webp`.
   *
   * Best-effort: failure of any step (sidecar render, B7 mint, S3 PUT)
   * MUST NOT fail the parent Generate-Layout mutation — the layout
   * already landed successfully; the thumbnail is polish. The desktop's
   * `<img onError>` fallback masks PUT failures invisibly to the user.
   */
  renderLayoutThumbnail(result: LayoutResult): Promise<Uint8Array>
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

    refreshInverters(req: RefreshInvertersRequest): Promise<LayoutResult> {
      return request<LayoutResult>("/refresh-inverters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      })
    },

    addRoad(req: AddRoadRequest): Promise<LayoutResult> {
      return request<LayoutResult>("/add-road", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      })
    },

    removeLastRoad(req: RemoveRoadRequest): Promise<LayoutResult> {
      return request<LayoutResult>("/remove-road", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      })
    },

    startLayoutJob(
      parsedKmz: ParsedKMZ,
      params: LayoutParameters
    ): Promise<LayoutJobStartResponse> {
      const body: LayoutRequest = { parsed_kmz: parsedKmz, params }
      return request<LayoutJobStartResponse>("/layout/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    },

    getLayoutJob(jobId: string): Promise<LayoutJobState> {
      // Path component is server-generated UUID hex — no special chars
      // expected, but encodeURIComponent is correct hygiene.
      return request<LayoutJobState>(`/layout/jobs/${encodeURIComponent(jobId)}`)
    },

    cancelLayoutJob(jobId: string): Promise<LayoutJobCancelResponse> {
      return request<LayoutJobCancelResponse>(
        `/layout/jobs/${encodeURIComponent(jobId)}`,
        { method: "DELETE" }
      )
    },

    flushLayoutJobs(): Promise<LayoutJobsFlushResponse> {
      return request<LayoutJobsFlushResponse>("/layout/jobs", {
        method: "DELETE",
      })
    },

    async renderLayoutThumbnail(
      result: LayoutResult
    ): Promise<Uint8Array> {
      // Bespoke — the shared `request<T>` helper assumes a JSON body;
      // /layout/thumbnail returns image/webp bytes. Mirrors that helper's
      // header + error shape so a 401 / 500 / etc. surfaces as the same
      // typed SidecarError downstream consumers already handle.
      const response = await fetchImpl(`${baseUrl}/layout/thumbnail`, {
        method: "POST",
        headers: {
          ...authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ result }),
      })
      if (!response.ok) {
        let body: unknown = null
        try {
          body = await response.json()
        } catch {
          // body may be empty — swallow
        }
        const message =
          extractError(body) ??
          `Sidecar /layout/thumbnail returned ${response.status}`
        throw new SidecarError(response.status, message, body)
      }
      const buf = await response.arrayBuffer()
      return new Uint8Array(buf)
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
