/**
 * Typed contracts for the mvp_api entitlements + usage endpoints.
 *
 * Response shapes mirror the live api.solarlayout.in contract as of
 * 2026-04. Validated at the boundary with Zod so a wire-level schema
 * drift surfaces as a descriptive error, not a runtime TypeError deep
 * in a consumer.
 */
import { z } from "zod"

/**
 * License-key format: `sl_live_<base64url>` — generated server-side by
 * mvp_api (see `renewable_energy/apps/mvp_api/src/modules/billing/
 * provision.ts`). Client-side we only check the prefix + character set
 * to catch obvious typos in the dialog; authoritative validation is
 * the API's 401 response.
 */
export const LICENSE_KEY_PATTERN = /^sl_live_[A-Za-z0-9_-]+$/u

export function isPlausibleLicenseKey(candidate: string): boolean {
  return LICENSE_KEY_PATTERN.test(candidate.trim())
}

/**
 * One plan row inside `data.plans[]`. Each row corresponds to a purchased
 * or provisioned product. Today the schema allows stacking (multiple
 * rows per user); the S13.7 subscription redesign will enforce a single
 * active row, but the desktop client's parse has no stacking-specific
 * logic to rework.
 */
export const planSchema = z.object({
  planName: z.string(),
  features: z.array(z.string()),
  totalCalculations: z.number().int().nonnegative(),
  usedCalculations: z.number().int().nonnegative(),
  remainingCalculations: z.number().int().nonnegative(),
})

export type Plan = z.infer<typeof planSchema>

/**
 * `data.user` — surfaced verbatim from Clerk on the mvp_api side. Both
 * fields are strings in practice but we permit null/undefined for future
 * privacy toggles.
 */
export const entitlementsUserSchema = z.object({
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
})

export type EntitlementsUser = z.infer<typeof entitlementsUserSchema>

/**
 * The inner `data` payload of GET /entitlements.
 *
 * Enforcement truth is `availableFeatures` — a flat list of feature-key
 * strings (e.g. "plant_layout", "cables", "dxf"). FeatureGate checks
 * this set. `plans[]` drives the top-bar chip and the license-info
 * dialog but never enforcement.
 */
export const entitlementsDataSchema = z.object({
  user: entitlementsUserSchema,
  plans: z.array(planSchema),
  licensed: z.boolean(),
  availableFeatures: z.array(z.string()),
  totalCalculations: z.number().int().nonnegative(),
  usedCalculations: z.number().int().nonnegative(),
  remainingCalculations: z.number().int().nonnegative(),
})

export type Entitlements = z.infer<typeof entitlementsDataSchema>

export const entitlementsResponseSchema = z.object({
  success: z.literal(true),
  data: entitlementsDataSchema,
})

/**
 * POST /usage/report — request is a single feature key, response is the
 * post-decrement `remainingCalculations`. We use this after Generate
 * completes; S12 wires export telemetry too.
 */
export const usageReportRequestSchema = z.object({
  feature: z.string(),
})

export type UsageReportRequest = z.infer<typeof usageReportRequestSchema>

export const usageReportResultSchema = z.object({
  recorded: z.boolean(),
  remainingCalculations: z.number().int().nonnegative(),
})

export type UsageReportResult = z.infer<typeof usageReportResultSchema>

export const usageReportResponseSchema = z.object({
  success: z.literal(true),
  data: usageReportResultSchema,
})

/**
 * mvp_api returns errors as `{ error: { message: string, code?: string } }`
 * on non-2xx responses. Lenient — we only extract `message` for display.
 */
export const errorResponseSchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.string().optional(),
  }),
})
