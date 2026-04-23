/**
 * @solarlayout/entitlements-client
 *
 * Typed client for the SolarLayout mvp_api entitlements + usage endpoints.
 * See ./client.ts for the factory and ./types.ts for Zod schemas + inferred
 * TypeScript types.
 */

export {
  createEntitlementsClient,
  EntitlementsError,
  type EntitlementsClient,
  type EntitlementsClientOptions,
} from "./client"

export {
  LICENSE_KEY_PATTERN,
  isPlausibleLicenseKey,
  entitlementsResponseSchema,
  entitlementsDataSchema,
  entitlementsUserSchema,
  planSchema,
  usageReportRequestSchema,
  usageReportResponseSchema,
  usageReportResultSchema,
  errorResponseSchema,
  type Entitlements,
  type EntitlementsUser,
  type Plan,
  type UsageReportRequest,
  type UsageReportResult,
} from "./types"
