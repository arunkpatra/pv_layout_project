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
  createProjectV2ResponseSchema,
  createRunV2ResponseSchema,
  entitlementSummaryV2ResponseSchema,
  getProjectV2ResponseSchema,
  getRunV2ResponseSchema,
  kmzUploadUrlResponseSchema,
  listProjectsV2ResponseSchema,
  patchProjectV2ResponseSchema,
  runResultUploadUrlResponseSchema,
  usageReportV2ResponseSchema,
  v2ErrorResponseSchema,
  parsedKmzSchema,
  v2SuccessResponseSchema,
  type CreateProjectV2Request,
  type CreateRunV2Request,
  type CreateRunV2Result,
  type EntitlementSummaryV2,
  type ParsedKmz,
  type PatchProjectV2Request,
  type PresignedUploadUrlResult,
  type ProjectDetailV2Wire,
  type ProjectSummaryListRowV2,
  type ProjectV2Wire,
  type RunDetailV2Wire,
  type RunResultType,
  type UsageReportV2Result,
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
  /**
   * V2 — `POST /v2/usage/report`. Idempotent debit: same `idempotencyKey`
   * returns the same response without re-debiting. Response includes
   * `availableFeatures` so the desktop can refresh local UI gating in the
   * same round-trip after a successful debit. Caller is responsible for
   * generating one fresh UUID v4 per "Generate Layout" intent and
   * REUSING the same key on transient retries.
   */
  reportUsageV2(
    key: string,
    feature: string,
    idempotencyKey: string
  ): Promise<UsageReportV2Result>
  /**
   * V2 — `POST /v2/blobs/kmz-upload-url` (B6). Mints a 15-minute
   * presigned PUT URL for a KMZ blob keyed by sha256. Caller PUTs
   * `Content-Type: application/vnd.google-earth.kmz` + matching
   * `Content-Length`. The returned `blobUrl` is what the caller passes
   * to B11 (`POST /v2/projects`) as `kmzBlobUrl`.
   */
  getKmzUploadUrl(
    key: string,
    sha256: string,
    size: number
  ): Promise<PresignedUploadUrlResult>
  /**
   * V2 — `POST /v2/blobs/run-result-upload-url` (B7). Mints a
   * 15-minute presigned PUT URL for one of the per-run result blobs.
   * Backend ownership-checks: the (projectId, runId) pair must exist,
   * not be soft-deleted, and belong to the caller. 404 otherwise.
   *
   * For the *primary* layout/energy result of a freshly-created run,
   * prefer the upload URL embedded in B16's response (`POST
   * /v2/projects/:id/runs`). Use B7 for additional exports
   * (DXF/PDF/KMZ) after the run exists.
   */
  getRunResultUploadUrl(
    key: string,
    args: {
      type: RunResultType
      projectId: string
      runId: string
      size: number
    }
  ): Promise<PresignedUploadUrlResult>
  /**
   * V2 — `POST /v2/projects` (B11). Creates a new Project row owned by the
   * caller with the supplied name + S3 KMZ reference. Body must match
   * `createProjectV2RequestSchema`; the desktop's normal flow is
   *   uploadKmzToS3() → use the returned blobUrl + kmzSha256 here.
   *
   * Backend ordering: quota check first (402 PAYMENT_REQUIRED if at
   * `projectsRemaining = 0`), then row insert. Returns 201 with the new
   * `ProjectV2Wire` row on success. The desktop maps the 402 code to the
   * upsell modal in `useCreateProjectMutation`.
   */
  createProjectV2(
    key: string,
    body: CreateProjectV2Request
  ): Promise<ProjectV2Wire>
  /**
   * V2 — `GET /v2/projects/:id` (B12). Returns the full ProjectDetail —
   * project metadata + presigned KMZ download URL + embedded run summaries
   * (non-soft-deleted, `createdAt DESC`). Single round-trip for the
   * open-existing-project flow:
   *
   *   getProjectV2 → fetch(detail.kmzDownloadUrl) → bytes
   *               → sidecar /parse-kmz → setCurrentProject + setRuns
   *
   * 404 NOT_FOUND when project doesn't exist, is soft-deleted, or belongs
   * to another user (cross-user existence is never leaked). The desktop's
   * useOpenProject hook maps this to a "project not found" surface.
   */
  getProjectV2(key: string, projectId: string): Promise<ProjectDetailV2Wire>
  /**
   * V2 — `POST /v2/projects/:id/parse-kmz` (C4). Triggers the parse-kmz
   * Lambda for an existing project: mvp_api looks up the project's
   * `kmzBlobUrl`, invokes the Lambda with `{bucket, key}`, persists the
   * parsed payload to `Project.parsedKmz`, and returns the `ParsedKmz`
   * to the caller.
   *
   * Errors collapse to a single user-facing surface per the C4
   * brainstorm Q3 lock: mvp_api auto-DELETEs the Project + refunds
   * quota on any Lambda / parse failure, and returns the V2 envelope
   * error. The caller observes only the V2 error code/message and
   * shows a uniform "try again" message regardless of the underlying
   * cause.
   */
  parseKmzV2(key: string, projectId: string): Promise<ParsedKmz>
  /**
   * V2 — `POST /v2/projects/:id/runs` (B16). Atomically debits one calc
   * for the supplied feature, creates a UsageRecord + Run row in a single
   * transaction, and returns both the new Run + a presigned upload URL
   * for the result blob (layout.json or energy.json depending on
   * billedFeatureKey).
   *
   * Idempotency: if `(userId, idempotencyKey)` already maps to a Run, the
   * same Run is returned with a FRESH uploadUrl — no new debit. The
   * desktop should generate one UUID v4 per "Generate Layout" intent and
   * reuse it across transient retries; on a successful debit, the next
   * intent gets a new key.
   *
   * Errors:
   *   400 VALIDATION_ERROR (bad body / unknown feature key)
   *   402 PAYMENT_REQUIRED (no entitlement covers the feature)
   *   404 NOT_FOUND (project doesn't exist or isn't yours)
   *   409 CONFLICT (entitlement deactivated between selection and debit)
   *   503 S3_NOT_CONFIGURED (bucket env unset on backend)
   */
  createRunV2(
    key: string,
    projectId: string,
    body: CreateRunV2Request
  ): Promise<CreateRunV2Result>
  /**
   * V2 — `PATCH /v2/projects/:id` (B13). Updates `name` and/or `edits`.
   * Used by the desktop's P3 rename UX (`{name}`-only patch) and P4
   * auto-save flow (`{edits}`-only patch). At least one field is
   * required; backend rejects an empty body with VALIDATION_ERROR. The
   * response is the lighter `ProjectV2Wire` shape (no kmzDownloadUrl,
   * no embedded runs[]) — callers spread it into the existing
   * `currentProject` state to keep B12-fetched fields intact.
   */
  patchProjectV2(
    key: string,
    projectId: string,
    body: PatchProjectV2Request
  ): Promise<ProjectV2Wire>
  /**
   * V2 — `DELETE /v2/projects/:id` (B14). Soft-delete: cascades to all
   * non-deleted runs (single transaction so a partial state is never
   * observable). Backend returns 204 No Content; resolves on success.
   *
   * 404 NOT_FOUND if project doesn't exist, was already deleted, or
   * isn't owned by the caller — cross-user existence is never leaked.
   * Calc count is unaffected; runs delete is independent of debit
   * (refunds aren't a desktop concern at v1).
   *
   * Frees a project quota slot (`projectsActive` decrements server-
   * side); the desktop's hook invalidates `["entitlements", key]` so
   * the quota chip refreshes.
   */
  deleteProjectV2(key: string, projectId: string): Promise<void>
  /**
   * V2 — `GET /v2/projects` (B10). Returns the user's non-soft-deleted
   * projects sorted by `updatedAt` DESC, capped at 100. Powers the S3
   * recents grid. Each row is a `ProjectSummaryListRowV2` with
   * `runsCount` + `lastRunAt` for the gallery card UX.
   */
  listProjectsV2(key: string): Promise<ProjectSummaryListRowV2[]>
  /**
   * V2 — `GET /v2/projects/:id/runs/:runId` (B17). Full run detail with
   * presigned-GET URLs for the result blobs (`layoutResultBlobUrl`
   * always; `energyResultBlobUrl` only for energy-class features).
   * Powers P7's "load run onto canvas" flow:
   *
   *   getRunV2 → fetch(detail.layoutResultBlobUrl) → LayoutResult JSON
   *           → setLayoutResultStore.setResult → canvas re-renders
   *
   * 404 NOT_FOUND if run doesn't exist, soft-deleted, or the parent
   * project belongs to another user (cross-user existence is never
   * leaked through this endpoint either).
   */
  getRunV2(
    key: string,
    projectId: string,
    runId: string
  ): Promise<RunDetailV2Wire>
  /**
   * V2 — `DELETE /v2/projects/:id/runs/:runId` (B18). Soft-delete a
   * run. Calc count is NOT refunded — the original UsageRecord stays
   * intact (audit trail), the Run row is just hidden from list/detail
   * fetches. Returns 204 No Content on success.
   *
   * 404 NOT_FOUND if the run doesn't exist, was already deleted, or
   * isn't owned by the caller. Same cross-user existence safeguard
   * as B14 (cross-user existence is never leaked).
   */
  deleteRunV2(
    key: string,
    projectId: string,
    runId: string
  ): Promise<void>
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

    // 204 No Content — backend uses this for B14 delete, B18 run-delete,
    // and any other "fire-and-forget" mutation. Return null so callers
    // that don't validate a response shape (delete, primarily) get a
    // typed null instead of a JSON-parse error.
    if (response.status === 204) {
      return null
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

    async reportUsageV2(key, feature, idempotencyKey) {
      const raw = await request(
        "/v2/usage/report",
        {
          method: "POST",
          body: JSON.stringify({ feature, idempotencyKey }),
        },
        key
      )
      const parsed = usageReportV2ResponseSchema.safeParse(raw)
      if (!parsed.success) {
        throw new EntitlementsError(
          0,
          `V2 usage-report response failed schema validation: ${parsed.error.message}`,
          raw
        )
      }
      return parsed.data.data
    },

    async getKmzUploadUrl(key, sha256, size) {
      const raw = await request(
        "/v2/blobs/kmz-upload-url",
        {
          method: "POST",
          body: JSON.stringify({ kmzSha256: sha256, kmzSize: size }),
        },
        key
      )
      const parsed = kmzUploadUrlResponseSchema.safeParse(raw)
      if (!parsed.success) {
        throw new EntitlementsError(
          0,
          `KMZ upload-url response failed schema validation: ${parsed.error.message}`,
          raw
        )
      }
      return parsed.data.data
    },

    async getRunResultUploadUrl(key, args) {
      const raw = await request(
        "/v2/blobs/run-result-upload-url",
        { method: "POST", body: JSON.stringify(args) },
        key
      )
      const parsed = runResultUploadUrlResponseSchema.safeParse(raw)
      if (!parsed.success) {
        throw new EntitlementsError(
          0,
          `Run-result upload-url response failed schema validation: ${parsed.error.message}`,
          raw
        )
      }
      return parsed.data.data
    },

    async createProjectV2(key, body) {
      const raw = await request(
        "/v2/projects",
        { method: "POST", body: JSON.stringify(body) },
        key
      )
      const parsed = createProjectV2ResponseSchema.safeParse(raw)
      if (!parsed.success) {
        throw new EntitlementsError(
          0,
          `Create-project response failed schema validation: ${parsed.error.message}`,
          raw
        )
      }
      return parsed.data.data
    },

    async getProjectV2(key, projectId) {
      // encodeURIComponent guards against accidental reserved chars in
      // an opaque ID. Backend IDs are CUID-style alphanumeric so this
      // is belt-and-braces — but the cost is one function call.
      const path = `/v2/projects/${encodeURIComponent(projectId)}`
      const raw = await request(path, { method: "GET" }, key)
      const parsed = getProjectV2ResponseSchema.safeParse(raw)
      if (!parsed.success) {
        throw new EntitlementsError(
          0,
          `Get-project response failed schema validation: ${parsed.error.message}`,
          raw
        )
      }
      return parsed.data.data
    },

    async parseKmzV2(key, projectId) {
      const path = `/v2/projects/${encodeURIComponent(projectId)}/parse-kmz`
      const raw = await request(path, { method: "POST" }, key)
      const parsed = v2SuccessResponseSchema(parsedKmzSchema).safeParse(raw)
      if (!parsed.success) {
        throw new EntitlementsError(
          0,
          `Parse-kmz response failed schema validation: ${parsed.error.message}`,
          raw
        )
      }
      return parsed.data.data
    },

    async createRunV2(key, projectId, body) {
      const path = `/v2/projects/${encodeURIComponent(projectId)}/runs`
      const raw = await request(
        path,
        { method: "POST", body: JSON.stringify(body) },
        key
      )
      const parsed = createRunV2ResponseSchema.safeParse(raw)
      if (!parsed.success) {
        throw new EntitlementsError(
          0,
          `Create-run response failed schema validation: ${parsed.error.message}`,
          raw
        )
      }
      return parsed.data.data
    },

    async patchProjectV2(key, projectId, body) {
      const path = `/v2/projects/${encodeURIComponent(projectId)}`
      const raw = await request(
        path,
        { method: "PATCH", body: JSON.stringify(body) },
        key
      )
      const parsed = patchProjectV2ResponseSchema.safeParse(raw)
      if (!parsed.success) {
        throw new EntitlementsError(
          0,
          `Patch-project response failed schema validation: ${parsed.error.message}`,
          raw
        )
      }
      return parsed.data.data
    },

    async deleteProjectV2(key, projectId) {
      const path = `/v2/projects/${encodeURIComponent(projectId)}`
      // 204 No Content → request() returns null; nothing to validate.
      await request(path, { method: "DELETE" }, key)
    },

    async listProjectsV2(key) {
      const raw = await request("/v2/projects", { method: "GET" }, key)
      const parsed = listProjectsV2ResponseSchema.safeParse(raw)
      if (!parsed.success) {
        throw new EntitlementsError(
          0,
          `List-projects response failed schema validation: ${parsed.error.message}`,
          raw
        )
      }
      return parsed.data.data
    },

    async getRunV2(key, projectId, runId) {
      const path = `/v2/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}`
      const raw = await request(path, { method: "GET" }, key)
      const parsed = getRunV2ResponseSchema.safeParse(raw)
      if (!parsed.success) {
        throw new EntitlementsError(
          0,
          `Get-run response failed schema validation: ${parsed.error.message}`,
          raw
        )
      }
      return parsed.data.data
    },

    async deleteRunV2(key, projectId, runId) {
      const path = `/v2/projects/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}`
      // 204 No Content → request() returns null; nothing to validate.
      await request(path, { method: "DELETE" }, key)
    },
  }
}
