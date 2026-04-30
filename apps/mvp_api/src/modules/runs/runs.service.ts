import { db } from "../../lib/db.js"
import { env } from "../../env.js"
import { AppError, NotFoundError } from "../../lib/errors.js"
import {
  getPresignedDownloadUrl,
  getPresignedUploadUrl,
} from "../../lib/s3.js"
import type { RunSummary } from "../projects/projects.service.js"
import {
  debitInTx,
  findFeaturePool,
} from "../usage/usage.service.js"
import { RUN_RESULT_SPEC } from "../blobs/blobs.service.js"

const THUMBNAIL_DOWNLOAD_TTL_SECONDS = 3600 // 1 hour — mirrors B17

/**
 * Deterministic Path A signer for a run's thumbnail.webp. Returns null
 * when the bucket env is unset; otherwise always signs (regardless of
 * whether the underlying object exists — pre-SP1 runs 404 on read and
 * the desktop's `<img onError>` falls back to placeholder).
 */
async function signRunThumbnailUrl(
  userId: string,
  projectId: string,
  runId: string,
): Promise<string | null> {
  const bucket = env.MVP_S3_PROJECTS_BUCKET
  if (!bucket) return null
  return await getPresignedDownloadUrl(
    `projects/${userId}/${projectId}/runs/${runId}/thumbnail.webp`,
    "thumbnail.webp",
    THUMBNAIL_DOWNLOAD_TTL_SECONDS,
    bucket,
  )
}

/**
 * List runs in a project. Verifies the project exists and belongs to the
 * caller before returning any data — same 404 posture as B12 / B13 / B14:
 * not-yours, soft-deleted, and non-existent all 404 with no leakage.
 *
 * Returns lightweight summaries (id, name, params, billedFeatureKey,
 * createdAt) — same shape as the runs[] embedded in B12. Heavy fields
 * (inputsSnapshot, blob URLs, exports list) stay in B17.
 */
export async function listRunsForProject(
  userId: string,
  projectId: string,
): Promise<RunSummary[]> {
  const project = await db.project.findFirst({
    where: { id: projectId, userId, deletedAt: null },
    select: { id: true },
  })
  if (!project) {
    throw new NotFoundError("Project", projectId)
  }

  const runs = await db.run.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      params: true,
      billedFeatureKey: true,
      createdAt: true,
    },
  })

  return await Promise.all(
    runs.map(async (r) => ({
      id: r.id,
      name: r.name,
      params: r.params,
      billedFeatureKey: r.billedFeatureKey,
      createdAt: r.createdAt.toISOString(),
      thumbnailBlobUrl: await signRunThumbnailUrl(userId, projectId, r.id),
    })),
  )
}

const UPLOAD_URL_TTL_SECONDS = 900 // 15 min

export interface CreateRunInput {
  name: string
  params: unknown
  inputsSnapshot: unknown
  billedFeatureKey: string
  idempotencyKey: string
}

export interface RunWire {
  id: string
  projectId: string
  name: string
  params: unknown
  inputsSnapshot: unknown
  billedFeatureKey: string
  usageRecordId: string
  createdAt: string
  deletedAt: string | null
}

export interface RunUploadDescriptor {
  uploadUrl: string
  blobUrl: string
  expiresAt: string
  type: "layout" | "energy"
}

export interface CreateRunResult {
  run: RunWire
  upload: RunUploadDescriptor
}

/**
 * Map billedFeatureKey to the primary upload type returned alongside
 * the new Run. Layout-class features → layout.json; energy-class
 * features → energy.json. The desktop can call B7 separately for any
 * additional uploads (DXF/PDF/KMZ exports).
 */
function uploadTypeFor(featureKey: string): "layout" | "energy" {
  return featureKey === "energy_yield" ||
    featureKey === "generation_estimates"
    ? "energy"
    : "layout"
}

interface RawRun {
  id: string
  projectId: string
  name: string
  params: unknown
  inputsSnapshot: unknown
  billedFeatureKey: string
  usageRecordId: string
  createdAt: Date
  deletedAt: Date | null
}

function toRunWire(run: RawRun): RunWire {
  return {
    id: run.id,
    projectId: run.projectId,
    name: run.name,
    params: run.params,
    inputsSnapshot: run.inputsSnapshot,
    billedFeatureKey: run.billedFeatureKey,
    usageRecordId: run.usageRecordId,
    createdAt: run.createdAt.toISOString(),
    deletedAt: run.deletedAt?.toISOString() ?? null,
  }
}

async function buildUploadDescriptor(
  userId: string,
  projectId: string,
  runId: string,
  featureKey: string,
): Promise<RunUploadDescriptor> {
  const type = uploadTypeFor(featureKey)
  const spec = RUN_RESULT_SPEC[type]
  const key = `projects/${userId}/${projectId}/runs/${runId}/${spec.filename}`
  const bucket = env.MVP_S3_PROJECTS_BUCKET ?? "<unset>"
  const uploadUrl = await getPresignedUploadUrl(
    key,
    spec.contentType,
    UPLOAD_URL_TTL_SECONDS,
    // No contentLength here — at create-time the desktop hasn't run the
    // solver yet so size is unknown. B7 enforces caps when the desktop
    // wants stricter signing.
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
    expiresAt: new Date(
      Date.now() + UPLOAD_URL_TTL_SECONDS * 1000,
    ).toISOString(),
    type,
  }
}

/**
 * Create a Run for the project, atomically debiting one calc and
 * persisting the (UsageRecord, Run) pair in a single transaction.
 *
 * Idempotency: if a UsageRecord with `(userId, idempotencyKey)`
 * already exists AND has a Run linked to it, return that Run with a
 * fresh upload URL — no new debit. The unique index from B2 makes
 * concurrent retries race-safe; the loser catches P2002 and falls
 * through to the same lookup.
 *
 * 404 NotFoundError on miss (project doesn't exist, soft-deleted, or
 * not owned by the caller). 402 if no entitlement covers the feature.
 * 400 if the feature key is unknown. 409 if the entitlement was
 * deactivated between selection and the atomic decrement.
 */
export async function createRunForProject(
  userId: string,
  licenseKeyId: string,
  projectId: string,
  input: CreateRunInput,
): Promise<CreateRunResult> {
  // 1. Project ownership (404 cross-user-leakage-free)
  const project = await db.project.findFirst({
    where: { id: projectId, userId, deletedAt: null },
    select: { id: true },
  })
  if (!project) {
    throw new NotFoundError("Project", projectId)
  }

  // 2. Idempotency pre-lookup — if this key already created a Run for
  //    this user, return that Run with a freshly-signed upload URL.
  const existing = await db.usageRecord.findFirst({
    where: { userId, idempotencyKey: input.idempotencyKey },
    include: { run: true },
  })
  if (existing?.run) {
    const upload = await buildUploadDescriptor(
      userId,
      existing.run.projectId,
      existing.run.id,
      existing.run.billedFeatureKey,
    )
    return { run: toRunWire(existing.run), upload }
  }

  // 3. Resolve pool + validate feature (throws 400 / 402)
  const { pool } = await findFeaturePool(userId, input.billedFeatureKey)

  // 4. Atomic tx: debit + UsageRecord + Run, all-or-nothing
  let createdRun: RawRun
  try {
    createdRun = await db.$transaction(async (tx) => {
      const txClient = tx as unknown as Parameters<typeof debitInTx>[0] & {
        run: {
          create: (args: {
            data: {
              projectId: string
              name: string
              params: unknown
              inputsSnapshot: unknown
              billedFeatureKey: string
              usageRecordId: string
            }
          }) => Promise<RawRun>
        }
      }
      const ur = await debitInTx(
        txClient,
        pool,
        userId,
        licenseKeyId,
        input.billedFeatureKey,
        input.idempotencyKey,
      )
      return await txClient.run.create({
        data: {
          projectId,
          name: input.name,
          params: input.params,
          inputsSnapshot: input.inputsSnapshot,
          billedFeatureKey: input.billedFeatureKey,
          usageRecordId: ur.id,
        },
      })
    })
  } catch (e) {
    // Concurrent retry race — the loser's UsageRecord insert hits P2002
    // on the (userId, idempotencyKey) unique. Re-look-up the now-existing
    // record and return its Run.
    if ((e as { code?: string }).code === "P2002") {
      const recovered = await db.usageRecord.findFirst({
        where: { userId, idempotencyKey: input.idempotencyKey },
        include: { run: true },
      })
      if (recovered?.run) {
        const upload = await buildUploadDescriptor(
          userId,
          recovered.run.projectId,
          recovered.run.id,
          recovered.run.billedFeatureKey,
        )
        return { run: toRunWire(recovered.run), upload }
      }
    }
    throw e
  }

  // 5. Sign upload URL for the result file (layout.json or energy.json
  //    depending on billedFeatureKey)
  const upload = await buildUploadDescriptor(
    userId,
    createdRun.projectId,
    createdRun.id,
    createdRun.billedFeatureKey,
  )
  return { run: toRunWire(createdRun), upload }
}

const READ_URL_TTL_SECONDS = 3600 // 1 hour

function isEnergyClass(featureKey: string): boolean {
  return (
    featureKey === "energy_yield" || featureKey === "generation_estimates"
  )
}

export interface RunDetailWire extends RunWire {
  /** Presigned GET URL for layout.json. Always set (every run produces
   *  a layout). May 404 on read if the desktop hasn't uploaded yet. */
  layoutResultBlobUrl: string | null
  /** Presigned GET URL for energy.json. Set only for energy-class
   *  features (energy_yield, generation_estimates); null otherwise. */
  energyResultBlobUrl: string | null
  /** Presigned GET URL for thumbnail.webp (Path A — deterministic key,
   *  always-sign). Pre-SP1 runs return a valid URL that 404s on read;
   *  the desktop's <img onError> falls back, and the browser
   *  negative-caches the 404. Null only when the bucket is unset. */
  thumbnailBlobUrl: string | null
  /** v1 always returns []. Future: list of {type, url} for any
   *  exports the desktop has registered (no register-export endpoint
   *  yet — desktop calls B7 directly for export uploads). */
  exportsBlobUrls: unknown[]
}

/**
 * Full Run details for the desktop. Returns the Run row + presigned
 * GET URLs for the result blobs (layout.json always; energy.json only
 * for energy-class features). URLs are signed at request time against
 * the conventional key path, so they're always valid for 1 hour even
 * if the desktop never explicitly registered the upload.
 *
 * 404 NotFoundError if: run doesn't exist, soft-deleted, parent project
 * is soft-deleted, or run belongs to another user (joined through
 * Run.project.userId).
 */
export async function getRunDetail(
  userId: string,
  projectId: string,
  runId: string,
): Promise<RunDetailWire> {
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

  const bucket = env.MVP_S3_PROJECTS_BUCKET
  const layoutKey = `projects/${userId}/${projectId}/runs/${runId}/layout.json`
  const energyKey = `projects/${userId}/${projectId}/runs/${runId}/energy.json`
  const thumbnailKey = `projects/${userId}/${projectId}/runs/${runId}/thumbnail.webp`

  const layoutResultBlobUrl = bucket
    ? await getPresignedDownloadUrl(
        layoutKey,
        "layout.json",
        READ_URL_TTL_SECONDS,
        bucket,
      )
    : null
  const energyResultBlobUrl = isEnergyClass(run.billedFeatureKey)
    ? bucket
      ? await getPresignedDownloadUrl(
          energyKey,
          "energy.json",
          READ_URL_TTL_SECONDS,
          bucket,
        )
      : null
    : null
  const thumbnailBlobUrl = bucket
    ? await getPresignedDownloadUrl(
        thumbnailKey,
        "thumbnail.webp",
        READ_URL_TTL_SECONDS,
        bucket,
      )
    : null

  return {
    ...toRunWire(run as RawRun),
    layoutResultBlobUrl,
    energyResultBlobUrl,
    thumbnailBlobUrl,
    exportsBlobUrls: [],
  }
}

/**
 * Soft-delete a Run. Does NOT refund the calc — the linked UsageRecord
 * stays as-is per V2-plan §2 ("Run delete does NOT refund the calc"):
 * users get one debit per Generate-Layout intent regardless of whether
 * they later delete the result.
 *
 * Joined ownership filter same as B17: 404 on miss / not-yours /
 * soft-deleted-run / soft-deleted-project. Second DELETE on a
 * soft-deleted run returns 404 (idempotency-via-not-found).
 *
 * Does NOT touch S3 blobs — orphan-cleanup is a deferred job.
 */
export async function deleteRun(
  userId: string,
  projectId: string,
  runId: string,
): Promise<void> {
  const existing = await db.run.findFirst({
    where: {
      id: runId,
      projectId,
      deletedAt: null,
      project: { userId, deletedAt: null },
    },
    select: { id: true },
  })
  if (!existing) {
    throw new NotFoundError("Run", runId)
  }

  await db.run.update({
    where: { id: runId },
    data: { deletedAt: new Date() },
  })
}
