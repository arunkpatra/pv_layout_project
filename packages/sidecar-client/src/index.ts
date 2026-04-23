/**
 * SolarLayout sidecar client.
 *
 * Minimal S5 surface: just what the shell needs to confirm the sidecar is
 * alive after startup. Route-specific methods (/parse-kmz, /layout,
 * /refresh-inverters) arrive when the React app starts using them (S8+).
 *
 * All requests:
 *   * target http://<host>:<port>
 *   * carry an `Authorization: Bearer <token>` header
 *   * throw SidecarError on any non-2xx response
 */

export interface SidecarClientOptions {
  host: string
  port: number
  token: string
  /** Override fetch implementation for tests. */
  fetchImpl?: typeof fetch
}

export interface SidecarClient {
  readonly baseUrl: string
  health(): Promise<HealthResponse>
}

export interface HealthResponse {
  status: string
  version: string
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
        // swallow — body may be empty
      }
      throw new SidecarError(
        response.status,
        `Sidecar ${path} returned ${response.status}`,
        body
      )
    }
    return (await response.json()) as T
  }

  return {
    baseUrl,
    health(): Promise<HealthResponse> {
      return request<HealthResponse>("/health")
    },
  }
}
