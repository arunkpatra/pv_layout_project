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
