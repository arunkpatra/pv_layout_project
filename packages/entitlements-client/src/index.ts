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
  entitlementsActiveStateSchema,
  entitlementSummaryV2DataSchema,
  entitlementSummaryV2ResponseSchema,
  usageReportV2RequestSchema,
  usageReportV2ResultSchema,
  usageReportV2ResponseSchema,
  kmzUploadUrlRequestSchema,
  kmzUploadUrlResponseSchema,
  runResultTypes,
  runResultTypeSchema,
  runResultUploadUrlRequestSchema,
  runResultUploadUrlResponseSchema,
  presignedUploadUrlResultSchema,
  createProjectV2RequestSchema,
  createProjectV2ResponseSchema,
  getProjectV2ResponseSchema,
  createRunV2RequestSchema,
  createRunV2ResultSchema,
  createRunV2ResponseSchema,
  patchProjectV2RequestSchema,
  patchProjectV2ResponseSchema,
  projectSummaryListRowV2Schema,
  listProjectsV2ResponseSchema,
  runDetailV2WireSchema,
  getRunV2ResponseSchema,
  runWireV2Schema,
  runUploadDescriptorSchema,
  projectV2WireSchema,
  projectDetailV2WireSchema,
  runSummaryV2WireSchema,
  KMZ_CONTENT_TYPE,
  RUN_RESULT_CONTENT_TYPES,
  type V2ErrorCode,
  type V2ErrorBody,
  type V2ErrorResponse,
  type ProjectQuotaState,
  type EntitlementsActiveState,
  type EntitlementSummaryV2,
  type UsageReportV2Request,
  type UsageReportV2Result,
  type KmzUploadUrlRequest,
  type RunResultType,
  type RunResultUploadUrlRequest,
  type PresignedUploadUrlResult,
  type CreateProjectV2Request,
  type CreateRunV2Request,
  type CreateRunV2Result,
  type PatchProjectV2Request,
  type ProjectSummaryListRowV2,
  type RunDetailV2Wire,
  type ProjectV2Wire,
  type ProjectDetailV2Wire,
  type RunSummaryV2Wire,
  type RunWireV2,
  type RunUploadDescriptor,
} from "./types-v2"
