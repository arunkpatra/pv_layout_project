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
// Client
// ─────────────────────────────────────────────────────────────────────

export interface SidecarClientOptions {
  host: string
  port: number
  token: string
  /** Override fetch implementation for tests / Tauri plugin-http. */
  fetchImpl?: typeof fetch
}

export interface SidecarClient {
  readonly baseUrl: string
  health(): Promise<HealthResponse>
  parseKmz(file: Blob | File, filename?: string): Promise<ParsedKMZ>
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
