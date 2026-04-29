import { env } from "../../env.js"
import { AppError } from "../../lib/errors.js"
import { getPresignedUploadUrl } from "../../lib/s3.js"

export const KMZ_CONTENT_TYPE = "application/vnd.google-earth.kmz"
export const MAX_KMZ_SIZE = 50 * 1024 * 1024 // 50 MB
const UPLOAD_URL_TTL_SECONDS = 900 // 15 min

export interface KmzUploadUrl {
  uploadUrl: string
  blobUrl: string
  expiresAt: string
}

/**
 * Sign a PUT for the user's KMZ. Key is content-addressed by sha256 under
 * the user's prefix, so the same KMZ uploaded twice idempotently overwrites
 * itself and multiple Projects with the same source KMZ share storage.
 *
 * Validation (sha256 hex, kmzSize bounds) happens at the route layer via
 * Zod; this service trusts its inputs.
 */
export async function getKmzUploadUrl(
  userId: string,
  kmzSha256: string,
  kmzSize: number,
): Promise<KmzUploadUrl> {
  const bucket = env.MVP_S3_PROJECTS_BUCKET
  if (!bucket) {
    throw new AppError(
      "S3_NOT_CONFIGURED",
      "Blob storage is not configured",
      503,
    )
  }

  const key = `projects/${userId}/kmz/${kmzSha256}.kmz`
  const uploadUrl = await getPresignedUploadUrl(
    key,
    KMZ_CONTENT_TYPE,
    UPLOAD_URL_TTL_SECONDS,
    kmzSize,
  )
  if (!uploadUrl) {
    throw new AppError(
      "S3_NOT_CONFIGURED",
      "Could not generate upload URL",
      503,
    )
  }

  return {
    uploadUrl,
    blobUrl: `s3://${bucket}/${key}`,
    expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000).toISOString(),
  }
}
