/**
 * V2 wire-shape mirrors for the SolarLayout mvp_api V2 surface.
 *
 * MIRROR OF: renewable_energy/packages/shared/src/types/api-v2.ts +
 * renewable_energy/packages/shared/src/types/entitlements.ts
 *
 * Update in lockstep when the backend's shared types change. Until we
 * publish the shared package to a private registry (or vendor it via a
 * git submodule), this is the source of truth on the desktop side. The
 * envelope + error shapes are LOAD-BEARING — every V2 endpoint round-trips
 * through them, so a silent drift here breaks every V2-aware code path.
 *
 * Backend's locked commitments (per the 2026-04-30 handoff):
 *   - Wire envelope: { success: true, data: T } / { success: false, error }.
 *   - Error code strings are UPPER_SNAKE; the union below is exhaustive
 *     for V1.
 *   - Won't change without flagging first.
 */
import { z } from "zod"

import { entitlementsDataSchema, type Entitlements } from "./types"

// ---------------------------------------------------------------------------
// Common envelope
// ---------------------------------------------------------------------------

/**
 * Exhaustive union of error codes the V2 surface returns. Mirror this
 * exactly with the backend's `V2ErrorCode` union — adding a code on
 * either side without the other will produce silent fall-through to
 * the generic HTTP-status branch in the desktop's error mapper.
 */
export const v2ErrorCodes = [
  "UNAUTHORIZED",
  "VALIDATION_ERROR",
  "PAYMENT_REQUIRED",
  "CONFLICT",
  "NOT_FOUND",
  "S3_NOT_CONFIGURED",
  "INTERNAL_SERVER_ERROR",
] as const

export type V2ErrorCode = (typeof v2ErrorCodes)[number]

export const v2ErrorCodeSchema = z.enum(v2ErrorCodes)

export const v2ErrorBodySchema = z.object({
  code: v2ErrorCodeSchema,
  message: z.string(),
  details: z.unknown().optional(),
})

export type V2ErrorBody = z.infer<typeof v2ErrorBodySchema>

/**
 * V2 error envelope — `{ success: false, error: {...} }`. Distinct from
 * V1's `{ error: {...} }` shape; the desktop's V2 error parser tries this
 * first and only falls back to V1's shape when the route under test is
 * known V1-only.
 */
export const v2ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: v2ErrorBodySchema,
})

export type V2ErrorResponse = z.infer<typeof v2ErrorResponseSchema>

/**
 * V2 success envelope — `{ success: true, data: T }`. Same shape as V1's
 * success envelope but documented under the V2 namespace for intentional
 * symmetry with V2 error.
 */
export function v2SuccessResponseSchema<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    success: z.literal(true),
    data,
  })
}

// ---------------------------------------------------------------------------
// /v2/entitlements
// ---------------------------------------------------------------------------

/**
 * Project-quota fields V2 adds on top of the frozen V1 EntitlementSummary.
 *
 *   projectQuota       — max across active+non-exhausted entitlements
 *                        (3 / 5 / 10 / 15 by tier; 0 if no qualifying
 *                        entitlement exists, e.g. all deactivated).
 *   projectsActive     — count of Project rows with deletedAt = null
 *                        owned by the caller.
 *   projectsRemaining  — clamp(quota - active, 0).
 */
export const projectQuotaStateSchema = z.object({
  projectQuota: z.number().int().nonnegative(),
  projectsActive: z.number().int().nonnegative(),
  projectsRemaining: z.number().int().nonnegative(),
})

export type ProjectQuotaState = z.infer<typeof projectQuotaStateSchema>

/**
 * EntitlementSummaryV2 — strict superset of V1 Entitlements. Existing
 * V1 consumers (FeatureGate, TopBar chip, plans dialog) continue to read
 * the same fields; V2-aware consumers (P10 quota indicator, P1 new-project
 * upsell) read the additional fields.
 */
export const entitlementSummaryV2DataSchema = entitlementsDataSchema.extend(
  projectQuotaStateSchema.shape
)

export type EntitlementSummaryV2 = z.infer<
  typeof entitlementSummaryV2DataSchema
>

export const entitlementSummaryV2ResponseSchema = v2SuccessResponseSchema(
  entitlementSummaryV2DataSchema
)

// Sanity: V2 must remain assignable to V1 Entitlements (sub-type
// substitutability). If this assertion ever fails to compile, V2 has
// drifted away from V1 and the desktop's V1 consumers will break.
const _v2IsV1Compatible: Entitlements = {} as EntitlementSummaryV2
void _v2IsV1Compatible

// ---------------------------------------------------------------------------
// /v2/usage/report — idempotent debit + refreshed entitlements
// ---------------------------------------------------------------------------

/**
 * V2 usage-report request body. `idempotencyKey` is mandatory in V2 (V1's
 * route accepts a body without it). The desktop generates one fresh UUID v4
 * per "Generate Layout" intent and reuses the same key on transient retries
 * — same key → same response, no double-debit.
 *
 * Backend per the 2026-04-30 handoff: uniqueness is enforced server-side
 * via `@@unique([userId, idempotencyKey])`; non-empty string accepted; we
 * agreed to UUID v4 (36 chars) on the desktop side.
 */
export const usageReportV2RequestSchema = z.object({
  feature: z.string(),
  idempotencyKey: z.string().min(1),
})

export type UsageReportV2Request = z.infer<typeof usageReportV2RequestSchema>

/**
 * V2 usage-report success body — strict superset of V1's
 * `{ recorded, remainingCalculations }`. The new `availableFeatures` lets
 * the desktop refresh local UI gating in the same round-trip after a
 * debit (no separate `/v2/entitlements` fetch required after every click).
 */
export const usageReportV2ResultSchema = z.object({
  recorded: z.boolean(),
  remainingCalculations: z.number().int().nonnegative(),
  availableFeatures: z.array(z.string()),
})

export type UsageReportV2Result = z.infer<typeof usageReportV2ResultSchema>

export const usageReportV2ResponseSchema = v2SuccessResponseSchema(
  usageReportV2ResultSchema
)

// ---------------------------------------------------------------------------
// /v2/blobs/* — pre-signed S3 upload URLs (B6 KMZ + B7 run-result)
// ---------------------------------------------------------------------------

/**
 * KMZ upload-URL request. The desktop computes sha256 over the KMZ bytes
 * and reports the file size; both are signed into the resulting URL so
 * the PUT must declare matching `Content-Type`/`Content-Length`. Backend
 * cap: 50 MB (52428800 bytes).
 *
 * Backend's content-addressed key path is
 * `projects/<userId>/kmz/<sha256>.kmz` — re-uploading the same KMZ is an
 * idempotent S3 overwrite (same key, same bytes). See B6 handoff
 * 2026-04-30.
 */
export const kmzUploadUrlRequestSchema = z.object({
  kmzSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/u, "sha256 must be 64 lowercase hex chars"),
  kmzSize: z
    .number()
    .int()
    .min(1)
    .max(52_428_800, "kmzSize cannot exceed 50 MB"),
})

export type KmzUploadUrlRequest = z.infer<typeof kmzUploadUrlRequestSchema>

/**
 * Common shape of B6 + B7 + B16-embedded responses: a presigned PUT URL,
 * the eventual `s3://...` blob reference (passed back to B11 / B16 as
 * `kmzBlobUrl` / `layoutResultBlobUrl`), and a 15-minute expiry.
 */
export const presignedUploadUrlResultSchema = z.object({
  uploadUrl: z.string().url(),
  blobUrl: z.string(),
  expiresAt: z.string().datetime(),
})

export type PresignedUploadUrlResult = z.infer<
  typeof presignedUploadUrlResultSchema
>

export const kmzUploadUrlResponseSchema = v2SuccessResponseSchema(
  presignedUploadUrlResultSchema
)

/**
 * Run-result upload-URL request (B7). Discriminated by `type`; backend
 * enforces a per-type Content-Type + size cap + S3 key prefix:
 *   layout / energy → application/json   (25 / 10 MB)   runs/<r>/<t>.json
 *   dxf             → application/dxf    (100 MB)       runs/<r>/exports/run.dxf
 *   pdf             → application/pdf    (50 MB)        runs/<r>/exports/run.pdf
 *   kmz             → application/vnd.google-earth.kmz (50 MB)  runs/<r>/exports/run.kmz
 *
 * Ownership is enforced server-side: Run must exist + not be soft-deleted
 * + belong to a non-deleted Project owned by the caller. 404 otherwise.
 */
export const runResultTypes = [
  "layout",
  "energy",
  "dxf",
  "pdf",
  "kmz",
] as const

export type RunResultType = (typeof runResultTypes)[number]

export const runResultTypeSchema = z.enum(runResultTypes)

export const runResultUploadUrlRequestSchema = z.object({
  type: runResultTypeSchema,
  projectId: z.string().min(1),
  runId: z.string().min(1),
  size: z.number().int().min(1),
})

export type RunResultUploadUrlRequest = z.infer<
  typeof runResultUploadUrlRequestSchema
>

/** Per-type Content-Type strings the desktop MUST send on PUT. */
export const RUN_RESULT_CONTENT_TYPES: Record<RunResultType, string> = {
  layout: "application/json",
  energy: "application/json",
  dxf: "application/dxf",
  pdf: "application/pdf",
  kmz: "application/vnd.google-earth.kmz",
}

/** KMZ Content-Type the desktop MUST send on PUT for B6 uploads. */
export const KMZ_CONTENT_TYPE = "application/vnd.google-earth.kmz"

export const runResultUploadUrlResponseSchema = v2SuccessResponseSchema(
  presignedUploadUrlResultSchema
)
