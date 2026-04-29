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

export {
  FEATURE_KEYS,
  ALL_FEATURE_KEYS,
  isFeatureKey,
  type FeatureKey,
} from "./feature-keys"

// V2 wire types — mirror of renewable_energy/packages/shared/src/types/*.
// Keep in lockstep with the backend.
export {
  v2ErrorCodes,
  v2ErrorCodeSchema,
  v2ErrorBodySchema,
  v2ErrorResponseSchema,
  v2SuccessResponseSchema,
  projectQuotaStateSchema,
  entitlementSummaryV2DataSchema,
  entitlementSummaryV2ResponseSchema,
  usageReportV2RequestSchema,
  usageReportV2ResultSchema,
  usageReportV2ResponseSchema,
  type V2ErrorCode,
  type V2ErrorBody,
  type V2ErrorResponse,
  type ProjectQuotaState,
  type EntitlementSummaryV2,
  type UsageReportV2Request,
  type UsageReportV2Result,
} from "./types-v2"
