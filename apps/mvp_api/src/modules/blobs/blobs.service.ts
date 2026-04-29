import { db } from "../../lib/db.js"
import { env } from "../../env.js"
import { AppError, NotFoundError } from "../../lib/errors.js"
import { getPresignedUploadUrl } from "../../lib/s3.js"

export const KMZ_CONTENT_TYPE = "application/vnd.google-earth.kmz"
export const MAX_KMZ_SIZE = 50 * 1024 * 1024 // 50 MB
const UPLOAD_URL_TTL_SECONDS = 900 // 15 min

const MB = 1024 * 1024

export type RunResultType = "layout" | "energy" | "dxf" | "pdf" | "kmz"

export const RUN_RESULT_SPEC: Record<
  RunResultType,
  { contentType: string; maxSize: number; filename: string }
> = {
  layout: {
    contentType: "application/json",
    maxSize: 25 * MB,
    filename: "layout.json",
  },
  energy: {
    contentType: "application/json",
    maxSize: 10 * MB,
    filename: "energy.json",
  },
  dxf: {
    contentType: "application/dxf",
    maxSize: 100 * MB,
    filename: "exports/run.dxf",
  },
  pdf: {
    contentType: "application/pdf",
    maxSize: 50 * MB,
    filename: "exports/run.pdf",
  },
  kmz: {
    contentType: KMZ_CONTENT_TYPE,
    maxSize: 50 * MB,
    filename: "exports/run.kmz",
  },
}

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

/**
 * Sign a PUT for a run-result artifact (layout/energy JSON or DXF/PDF/KMZ
 * export). The Run must exist, not be soft-deleted, and belong to a Project
 * owned by the caller. Per-type Content-Type and size cap enforced both at
 * the route (Zod) and at S3 (signed `ContentLength`).
 *
 * Validation of `type` and `size` against the spec happens at the route
 * layer (the discriminated-union Zod schema) — this service trusts the
 * narrowed input.
 */
export async function getRunResultUploadUrl(
  userId: string,
  projectId: string,
  runId: string,
  type: RunResultType,
  size: number,
): Promise<KmzUploadUrl> {
  const bucket = env.MVP_S3_PROJECTS_BUCKET
  if (!bucket) {
    throw new AppError(
      "S3_NOT_CONFIGURED",
      "Blob storage is not configured",
      503,
    )
  }

  const run = await db.run.findFirst({
    where: {
      id: runId,
      projectId,
      deletedAt: null,
      project: { userId, deletedAt: null },
    },
  })
  if (!run) {
    throw new NotFoundError("Run", runId)
  }

  const spec = RUN_RESULT_SPEC[type]
  const key = `projects/${userId}/${projectId}/runs/${runId}/${spec.filename}`
  const uploadUrl = await getPresignedUploadUrl(
    key,
    spec.contentType,
    UPLOAD_URL_TTL_SECONDS,
    size,
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
