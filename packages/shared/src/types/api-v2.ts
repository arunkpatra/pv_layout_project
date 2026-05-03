/**
 * Wire envelope + error-code union for the post-parity V2 routes.
 *
 * The legacy `ApiResponse<T>` (in api.ts) uses `code: string` — kept for
 * V1 backward-compat. V2 narrows to a closed union so desktop clients
 * get exhaustive switch coverage at compile time.
 */

export type V2ErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "PAYMENT_REQUIRED"
  | "CONFLICT"
  | "NOT_FOUND"
  | "S3_NOT_CONFIGURED"
  | "INVALID_KMZ"
  | "INTERNAL_SERVER_ERROR"

export interface V2ErrorBody {
  code: V2ErrorCode
  message: string
  details?: unknown
}

export type V2ApiEnvelope<T> =
  | { success: true; data: T }
  | { success: false; error: V2ErrorBody }
