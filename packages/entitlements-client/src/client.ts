/**
 * SolarLayout entitlements HTTP client.
 *
 * Two methods against `api.solarlayout.in`:
 *   - getEntitlements(key)      → GET  /entitlements
 *   - reportUsage(key, feature) → POST /usage/report
 *
 * Both require a Bearer license key (format: `sl_live_*`). Responses are
 * parsed through the Zod schemas in ./types so a mismatched wire payload
 * throws a descriptive error rather than failing deep in a consumer.
 *
 * Design notes:
 *
 *   - No caching here. TanStack Query on the React side manages in-session
 *     cache lifetime. This client is stateless.
 *   - `fetchImpl` override supports (a) the Tauri plugin-http fetch in the
 *     desktop runtime, (b) mock fetch in tests, (c) the default global in
 *     non-Tauri envs.
 *   - Online required — no offline fallback, no retry budget. A network
 *     failure surfaces as EntitlementsError(status=0). Callers decide how
 *     to present that (in the desktop: a blocking error surface with a
 *     Retry button).
 */
import {
  entitlementsResponseSchema,
  errorResponseSchema,
  usageReportResponseSchema,
  type Entitlements,
  type UsageReportResult,
} from "./types"
import {
  entitlementSummaryV2ResponseSchema,
  v2ErrorResponseSchema,
  type EntitlementSummaryV2,
  type V2ErrorCode,
} from "./types-v2"

/**
 * Minimal fetch-like signature — narrower than `typeof fetch` so a plain
 * async function suffices as a mock. The real `typeof fetch` (Bun / DOM)
 * is assignable to this, so passing the global `fetch` or the Tauri
 * `plugin-http` fetch continues to work.
 */
export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

export interface EntitlementsClientOptions {
  /** API base URL. Defaults to production. */
  baseUrl?: string
  /** Fetch implementation override (Tauri plugin-http, tests). */
  fetchImpl?: FetchLike
  /** Per-request timeout in ms. Default 15s. */
  timeoutMs?: number
}

export interface EntitlementsClient {
  readonly baseUrl: string
  /** V1 — `GET /entitlements`. Frozen for the legacy install. */
  getEntitlements(key: string): Promise<Entitlements>
  /** V1 — `POST /usage/report`. Frozen for the legacy install. */
  reportUsage(key: string, feature: string): Promise<UsageReportResult>
  /**
   * V2 — `GET /v2/entitlements`. Returns the V1 EntitlementSummary shape
   * plus `projectQuota`, `projectsActive`, `projectsRemaining`. Use this
   * from any post-parity desktop code path; V1 stays for legacy.
   */
  getEntitlementsV2(key: string): Promise<EntitlementSummaryV2>
}

/**
 * Thrown for any non-2xx response or network failure.
 *
 *   status === 0   → network error / timeout / DNS / refused / schema mismatch
 *   status  4xx/5xx → API returned a non-success status
 *
 * `body` carries the parsed JSON error payload when the server returned one;
 * `null` otherwise. For V2 responses (envelope `{success: false, error: {...}}`),
 * `code` is populated with the typed V2 error code; V2-aware callers can
 * branch on it for type-safe error mapping. V1-shape errors leave `code`
 * undefined.
 */
export class EntitlementsError extends Error {
  readonly status: number
  readonly body: unknown
  readonly code?: V2ErrorCode
  constructor(
    status: number,
    message: string,
    body: unknown = null,
    code?: V2ErrorCode
  ) {
    super(message)
    this.name = "EntitlementsError"
    this.status = status
    this.body = body
    this.code = code
  }
}

const DEFAULT_BASE_URL = "https://api.solarlayout.in"
const DEFAULT_TIMEOUT_MS = 15_000

export function createEntitlementsClient(
  opts: EntitlementsClientOptions = {}
): EntitlementsClient {
  const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "")
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS

  async function request(
    path: string,
    init: RequestInit,
    key: string
  ): Promise<unknown> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)

    let response: Response
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        signal: ctrl.signal,
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(init.headers ?? {}),
        },
      })
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.name === "AbortError"
            ? `Request to ${path} timed out after ${timeoutMs}ms`
            : err.message
          : String(err)
      throw new EntitlementsError(0, msg)
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      let body: unknown = null
      try {
        body = await response.json()
      } catch {
        // body may be empty / non-JSON — swallow
      }
      // Try V2 envelope first (`{success: false, error: {code, message}}`),
      // fall back to V1's looser `{error: {message, code?}}`. V2 is strictly
      // narrower; if it parses, we extract the typed code for callers.
      const v2 = v2ErrorResponseSchema.safeParse(body)
      if (v2.success) {
        throw new EntitlementsError(
          response.status,
          v2.data.error.message,
          body,
          v2.data.error.code
        )
      }
      const v1 = errorResponseSchema.safeParse(body)
      const message = v1.success
        ? v1.data.error.message
        : `HTTP ${response.status}`
      throw new EntitlementsError(response.status, message, body)
    }

    return response.json()
  }

  return {
    baseUrl,

    async getEntitlements(key) {
      const raw = await request("/entitlements", { method: "GET" }, key)
      const parsed = entitlementsResponseSchema.safeParse(raw)
      if (!parsed.success) {
        throw new EntitlementsError(
          0,
          `Entitlements response failed schema validation: ${parsed.error.message}`,
          raw
        )
      }
      return parsed.data.data
    },

    async reportUsage(key, feature) {
      const raw = await request(
        "/usage/report",
        { method: "POST", body: JSON.stringify({ feature }) },
        key
      )
      const parsed = usageReportResponseSchema.safeParse(raw)
      if (!parsed.success) {
        throw new EntitlementsError(
          0,
          `Usage-report response failed schema validation: ${parsed.error.message}`,
          raw
        )
      }
      return parsed.data.data
    },

    async getEntitlementsV2(key) {
      const raw = await request("/v2/entitlements", { method: "GET" }, key)
      const parsed = entitlementSummaryV2ResponseSchema.safeParse(raw)
      if (!parsed.success) {
        throw new EntitlementsError(
          0,
          `V2 entitlements response failed schema validation: ${parsed.error.message}`,
          raw
        )
      }
      return parsed.data.data
    },
  }
}
