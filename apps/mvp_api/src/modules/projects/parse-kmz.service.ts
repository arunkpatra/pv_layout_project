import type { Context } from "hono"
import { parsedKmzSchema } from "@solarlayout/entitlements-client"
import type { ParsedKmz } from "@solarlayout/entitlements-client"
import type { BoundaryGeojson } from "@solarlayout/shared"
import { db } from "../../lib/db.js"
import { AppError, NotFoundError } from "../../lib/errors.js"
import { parseS3Url } from "../../lib/s3.js"
import { invoke } from "../../lib/lambda-invoker.js"
import { ok } from "../../lib/response.js"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"

/**
 * Generic user-facing error message for ANY parse-kmz failure. Per spec
 * C4 brainstorm Q3 — the customer's response is identical regardless of
 * which Lambda code fired (KMZ_NOT_FOUND / INVALID_KMZ / INTERNAL_ERROR /
 * network / crash / parseS3Url failure).
 */
const GENERIC_FAILURE_MESSAGE =
  "Something went wrong setting up your project. " +
  "Please try again, or contact support if it keeps happening."

// ─────────────────────────────────────────────────────────────────────────
// Lambda envelope. `ParsedKmz` (success-shape) and `BoundaryGeojson`
// (derived storage shape) are the authoritative cross-runtime contracts
// imported from `@solarlayout/entitlements-client` and `@solarlayout/shared`
// respectively — see `docs/principles/external-contracts.md`. Lambda's
// `_parsed_to_wire` is the source of truth for ParsedKmz; mvp_api validates
// and persists.
// ─────────────────────────────────────────────────────────────────────────

interface LambdaSuccess {
  ok: true
  // `parsed` is structurally validated via `parsedKmzSchema.safeParse` in
  // the success branch before any DB write — never trusted as-is.
  parsed: unknown
}

interface LambdaFailure {
  ok: false
  code: string
  message: string
  trace?: string
  key?: string
}

type LambdaResult = LambdaSuccess | LambdaFailure

/**
 * Derive a polygon-only `BoundaryGeojson` (B26 contract) from the
 * Lambda's full ParsedKmz payload. Used to populate
 * Project.boundaryGeojson alongside Project.parsedKmz on success — keeps
 * RecentsView placeholder rendering working without re-parsing the
 * heavier ParsedKmz shape.
 */
function parsedKmzToBoundaryGeojson(parsed: ParsedKmz): BoundaryGeojson | null {
  const boundaries = parsed.boundaries
  if (boundaries.length === 0) return null
  if (boundaries.length === 1) {
    return {
      type: "Polygon",
      coordinates: [boundaries[0]!.coords],
    }
  }
  return {
    type: "MultiPolygon",
    coordinates: boundaries.map((b) => [b.coords]),
  }
}

/**
 * Auto-cleanup on parse-kmz failure. Per spec C4 brainstorm Q3:
 *   - Soft-delete the Project (deletedAt = now).
 *   - "Refund" the project-create quota — for v1, project quota is
 *     count(Project rows WHERE deletedAt IS NULL), so the soft-delete
 *     itself releases the quota slot. No UsageRecord write required;
 *     project create does not write a charge UsageRecord (see
 *     entitlements.service.ts getProjectQuotaState — it counts rows,
 *     not usage events).
 *
 * Cleanup failures are logged but never surfaced — we've already decided
 * to return 500 to the caller, and a half-cleanup is recoverable via
 * orphan sweep / manual ops.
 */
async function cleanupOnFailure(projectId: string): Promise<void> {
  try {
    await db.project.update({
      where: { id: projectId },
      data: { deletedAt: new Date() },
    })
  } catch (cleanupErr) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "parse-kmz cleanup soft-delete failed",
        projectId,
        error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
      }),
    )
  }
}

/**
 * Lambda's structured envelope ({ok, code, message, trace, key}) is
 * server-side-only. mvp_api logs the full payload to CloudWatch but
 * NEVER forwards code/message/trace to the desktop client. All
 * failures collapse to a uniform INTERNAL_SERVER_ERROR + generic
 * message per spec C4 brainstorm Q3.
 */
export async function parseKmzHandler(c: Context<MvpHonoEnv>): Promise<Response> {
  const user = c.get("user")
  const projectId = c.req.param("id") ?? ""
  if (projectId.length === 0) {
    // Defensive — Hono only routes here when :id is matched, so this is
    // structurally unreachable. Kept for type-narrowing + future-proof.
    throw new NotFoundError("Project", projectId)
  }

  // 1. Look up the project, scoped to caller + non-soft-deleted.
  const project = await db.project.findFirst({
    where: { id: projectId, userId: user.id, deletedAt: null },
    select: { id: true, kmzBlobUrl: true },
  })
  if (!project) {
    throw new NotFoundError("Project", projectId)
  }

  // 2. Project must have a kmzBlobUrl. Pre-upload partial-create rows
  //    return 404; not our job to clean those up here.
  if (!project.kmzBlobUrl || project.kmzBlobUrl.length === 0) {
    throw new NotFoundError("Project", projectId)
  }

  // 3. Translate s3://.../... → {bucket, key} for the Lambda payload.
  //    Malformed URL means DB corruption — log, cleanup, 500.
  let bucket: string
  let key: string
  try {
    const parts = parseS3Url(project.kmzBlobUrl)
    bucket = parts.bucket
    key = parts.key
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "parse-kmz: malformed Project.kmzBlobUrl",
        projectId,
        kmzBlobUrl: project.kmzBlobUrl,
        error: err instanceof Error ? err.message : String(err),
      }),
    )
    await cleanupOnFailure(projectId)
    throw new AppError(
      "INTERNAL_SERVER_ERROR",
      GENERIC_FAILURE_MESSAGE,
      500,
    )
  }

  // 4. Invoke the Lambda. Two failure modes:
  //    a) invoke() throws (network / non-2xx from server.py / cloud
  //       invoke error) — caught below, treated as failure.
  //    b) invoke() returns { ok: false, ... } (Lambda's structured
  //       failure envelope) — also treated as failure, logged with
  //       full payload but never forwarded.
  let result: LambdaResult
  try {
    result = (await invoke("parse-kmz", { bucket, key })) as LambdaResult
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "parse-kmz Lambda invocation threw",
        projectId,
        bucket,
        key,
        error: err instanceof Error ? err.message : String(err),
      }),
    )
    await cleanupOnFailure(projectId)
    throw new AppError(
      "INTERNAL_SERVER_ERROR",
      GENERIC_FAILURE_MESSAGE,
      500,
    )
  }

  if (!result.ok) {
    // Log Lambda's full structured envelope server-side (CloudWatch +
    // future Sentry). Lambda trace is NEVER forwarded.
    console.error(
      JSON.stringify({
        level: "error",
        message: "parse-kmz Lambda returned failure envelope",
        projectId,
        bucket,
        key,
        lambdaCode: result.code,
        lambdaMessage: result.message,
        lambdaTrace: result.trace,
        lambdaKey: result.key,
      }),
    )
    await cleanupOnFailure(projectId)
    // INVALID_KMZ is a user-actionable failure (bad input) — surface it
    // with an HTTP 422 + a curated user-friendly message so the desktop
    // can render specific UX copy instead of the generic fallback. Other
    // codes (KMZ_NOT_FOUND, INTERNAL_ERROR) indicate a server bug or
    // race and stay collapsed.
    if (result.code === "INVALID_KMZ") {
      throw new AppError(
        "INVALID_KMZ",
        "The uploaded file isn't a valid KMZ.",
        422,
      )
    }
    throw new AppError(
      "INTERNAL_SERVER_ERROR",
      GENERIC_FAILURE_MESSAGE,
      500,
    )
  }

  // 5. Validate the Lambda's `parsed` payload against the canonical
  //    Zod schema BEFORE any persistence. The Lambda is the source of
  //    truth, but a buggy / drifted Lambda must not be allowed to write
  //    malformed JSON into Postgres (which subsequent reads would echo
  //    back to the desktop). Validation failure collapses into the same
  //    uniform path as `result.ok === false` — log, cleanup, 500.
  //
  //    The malformed payload itself is NOT logged — it could be huge
  //    and we have the Zod issue list which is sufficient triage data.
  const validated = parsedKmzSchema.safeParse(result.parsed)
  if (!validated.success) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "parse-kmz Lambda response failed schema validation",
        projectId,
        bucket,
        key,
        issues: validated.error.issues,
      }),
    )
    await cleanupOnFailure(projectId)
    throw new AppError(
      "INTERNAL_SERVER_ERROR",
      GENERIC_FAILURE_MESSAGE,
      500,
    )
  }
  const parsed = validated.data

  // 6. Success path — persist the schema-validated parsedKmz (snake_case
  //    verbatim — DO NOT camelCase-normalize) AND derive boundaryGeojson
  //    for B26. We use `validated.data` everywhere downstream so what
  //    persists exactly matches what we return to the caller.
  const boundaryGeojson = parsedKmzToBoundaryGeojson(parsed)
  await db.project.update({
    where: { id: projectId },
    data: {
      parsedKmz: parsed as unknown as object,
      ...(boundaryGeojson !== null
        ? { boundaryGeojson: boundaryGeojson as unknown as object }
        : {}),
    },
  })

  // V2 envelope wrapping the snake_case ParsedKmz payload (verbatim).
  return c.json(ok(parsed))
}
