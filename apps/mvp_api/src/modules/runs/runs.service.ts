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
  /** Lifecycle state — RUNNING | DONE | CANCELLED | FAILED. */
  status: string
  /** Set when status flipped to CANCELLED (B30). */
  cancelledAt: string | null
  /** Set when status flipped to FAILED (B32). */
  failedAt: string | null
  /** Free-text reason for FAILED (B32). Null otherwise. */
  failureReason: string | null
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
  status: string
  cancelledAt: Date | null
  failedAt: Date | null
  failureReason: string | null
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
    status: run.status,
    cancelledAt: run.cancelledAt?.toISOString() ?? null,
    failedAt: run.failedAt?.toISOString() ?? null,
    failureReason: run.failureReason,
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

/**
 * Cancel a Run. Idempotent. Per refund-on-cancel policy
 * (B27 memo 2026-05-02-002 §A.2 + §B.2):
 *
 *   RUNNING   → flip to CANCELLED, write refund UsageRecord (count=-1,
 *               kind='refund', refundsRecordId=<original>), decrement
 *               the matching Entitlement.usedCalculations. Single
 *               Postgres transaction with SELECT … FOR UPDATE on Run.
 *   CANCELLED → no-op, return current state. (Refund already issued.)
 *   DONE      → 409 CONFLICT. ("Run already completed; use Delete.")
 *   FAILED    → no-op, return current state. (Refund already issued by
 *               B32's failed-runs path.)
 *
 * 404 on miss / cross-user / soft-deleted run / soft-deleted project —
 * same posture as B17 (getRunDetail) and B18 (deleteRun).
 *
 * Race semantics: the FOR UPDATE lock serializes this endpoint against
 * sidecar's completion path (B31 will add the sidecar-side check).
 * Whichever transaction commits first wins; the loser sees the post-
 * commit state and behaves correctly per the branch table above.
 */
export async function cancelRun(
  userId: string,
  projectId: string,
  runId: string,
): Promise<RunDetailWire> {
  // 1. Ownership pre-check (no lock). 404-leakage-safe.
  const project = await db.project.findFirst({
    where: { id: projectId, userId, deletedAt: null },
    select: { id: true },
  })
  if (!project) {
    throw new NotFoundError("Project", projectId)
  }

  const updatedRun = await db.$transaction(async (tx) => {
    const txClient = tx as unknown as {
      $queryRaw: <T>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T>
      run: {
        update: (args: {
          where: { id: string }
          data: Record<string, unknown>
        }) => Promise<RawRun>
      }
      usageRecord: {
        create: (args: {
          data: {
            userId: string
            licenseKeyId: string
            productId: string
            featureKey: string
            count: number
            kind: string
            refundsRecordId: string
          }
        }) => Promise<{ id: string }>
      }
      entitlement: {
        updateMany: (args: {
          where: Record<string, unknown>
          data: Record<string, unknown>
        }) => Promise<{ count: number }>
      }
    }

    // 2. Lock the Run row + read its current status.
    const rows = await txClient.$queryRaw<
      Array<{ id: string; status: string; usageRecordId: string }>
    >`
      SELECT id, status, "usageRecordId"
      FROM runs
      WHERE id = ${runId}
        AND "projectId" = ${projectId}
        AND "deletedAt" IS NULL
      FOR UPDATE
    `

    if (rows.length === 0) {
      throw new NotFoundError("Run", runId)
    }
    const locked = rows[0]!

    // 3. Branch on status.
    if (locked.status === "DONE") {
      throw new AppError(
        "CONFLICT",
        "Run already completed; use Delete to remove it from history",
        409,
      )
    }

    if (locked.status === "CANCELLED" || locked.status === "FAILED") {
      // Idempotent — re-read the post-commit state and return it.
      // Empty data = no-op write that returns the canonical row shape.
      const current = await txClient.run.update({
        where: { id: runId },
        data: {},
      })
      return current
    }

    // RUNNING → execute the refund cascade.
    // 3a. Look up the original UsageRecord to find productId + identity
    //     for the refund row + entitlement decrement target.
    const original = (await db.usageRecord.findFirst({
      where: { id: locked.usageRecordId },
      select: {
        id: true,
        productId: true,
        userId: true,
        licenseKeyId: true,
        featureKey: true,
      },
    })) as {
      id: string
      productId: string
      userId: string
      licenseKeyId: string
      featureKey: string
    } | null

    if (!original) {
      // Should never happen — runs.usageRecordId is FK NOT NULL.
      throw new AppError(
        "INTERNAL_ERROR",
        `UsageRecord ${locked.usageRecordId} missing for run ${runId}`,
        500,
      )
    }

    // 3b. Flip the Run status.
    const updated = await txClient.run.update({
      where: { id: runId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
      },
    })

    // 3c. Insert refund UsageRecord row (count=-1, kind='refund').
    await txClient.usageRecord.create({
      data: {
        userId: original.userId,
        licenseKeyId: original.licenseKeyId,
        productId: original.productId,
        featureKey: original.featureKey,
        count: -1,
        kind: "refund",
        refundsRecordId: original.id,
      },
    })

    // 3d. Decrement Entitlement.usedCalculations on a matching active
    //     entitlement for the same product. updateMany matches the
    //     cheapest-first ordering convention from findFeaturePool (the
    //     codebase allows multiple active entitlements per product).
    //     If no match (e.g., entitlement deactivated post-debit), the
    //     decrement is a no-op — refund row + Run flip still land, and
    //     SUM(count) quota math (B34) reflects the refund.
    await txClient.entitlement.updateMany({
      where: {
        userId: original.userId,
        productId: original.productId,
        deactivatedAt: null,
        usedCalculations: { gt: 0 },
      },
      data: {
        usedCalculations: { decrement: 1 },
      },
    })

    return updated
  })

  // 4. Convert to wire shape + sign download URLs (parallel to getRunDetail).
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
  const energyResultBlobUrl = isEnergyClass(updatedRun.billedFeatureKey)
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
    ...toRunWire(updatedRun),
    layoutResultBlobUrl,
    energyResultBlobUrl,
    thumbnailBlobUrl,
    exportsBlobUrls: [],
  }
}
