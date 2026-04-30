import { db } from "../../lib/db.js"
import { env } from "../../env.js"
import { AppError, NotFoundError } from "../../lib/errors.js"
import { getPresignedDownloadUrl } from "../../lib/s3.js"
import { getProjectQuotaState } from "../entitlements/entitlements.service.js"
import type {
  BoundaryGeojson,
  ProjectDetail,
  ProjectWire,
  RunSummary,
} from "@renewable-energy/shared"

// Re-export so existing intra-mvp_api imports (e.g. runs.service.ts uses
// RunSummary from this module) keep working unchanged.
export type { ProjectDetail, ProjectWire, RunSummary }

const KMZ_DOWNLOAD_TTL_SECONDS = 3600 // 1 hour — matches B17 read TTL
const THUMBNAIL_DOWNLOAD_TTL_SECONDS = 3600 // 1 hour — matches B17 thumbnail TTL

export interface ProjectSummary {
  id: string
  name: string
  kmzBlobUrl: string
  kmzSha256: string
  createdAt: string
  updatedAt: string
  runsCount: number
  lastRunAt: string | null
  /** Presigned-GET URL for the most recent non-soft-deleted run's
   *  `thumbnail.webp` (Path A — deterministic key, always-sign). Null when
   *  the project has 0 runs OR the bucket env is unset. Pre-SP1 runs return
   *  a valid URL that 404s on read; the desktop's `<img onError>` falls
   *  back, mirroring the B17 RunDetail pattern. */
  mostRecentRunThumbnailBlobUrl: string | null
  /** Parsed KMZ boundary outline; null for projects created before B26 or
   *  when the desktop didn't supply it on B11. Lets the desktop render an
   *  SVG fallback on RecentsView cards when no thumbnail exists. */
  boundaryGeojson: BoundaryGeojson | null
}

const LIST_CAP = 100

/**
 * List the user's non-soft-deleted projects, sorted updatedAt DESC,
 * capped at 100 (no pagination at v1 — desktop ceiling is 15 quota
 * concurrent so 100 is comfortable headroom).
 *
 * Each summary carries runsCount (excluding soft-deleted runs),
 * lastRunAt (latest non-soft-deleted Run.createdAt, or null), and a
 * presigned-GET URL for the most-recent run's thumbnail. Signing is
 * deterministic against the conventional key path (Path A) so projects
 * whose runs predate the thumbnail pipeline still get a URL — it just
 * 404s on read, and the desktop falls back to the placeholder.
 */
export async function listProjects(userId: string): Promise<ProjectSummary[]> {
  const projects = await db.project.findMany({
    where: { userId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    take: LIST_CAP,
    include: {
      runs: {
        where: { deletedAt: null },
        select: { id: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      _count: {
        select: { runs: { where: { deletedAt: null } } },
      },
    },
  })

  const bucket = env.MVP_S3_PROJECTS_BUCKET
  return await Promise.all(
    projects.map(async (p) => {
      const latestRun = p.runs[0]
      const mostRecentRunThumbnailBlobUrl =
        bucket && latestRun
          ? await getPresignedDownloadUrl(
              `projects/${userId}/${p.id}/runs/${latestRun.id}/thumbnail.webp`,
              "thumbnail.webp",
              THUMBNAIL_DOWNLOAD_TTL_SECONDS,
              bucket,
            )
          : null
      return {
        id: p.id,
        name: p.name,
        kmzBlobUrl: p.kmzBlobUrl,
        kmzSha256: p.kmzSha256,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        runsCount: p._count.runs,
        lastRunAt: latestRun?.createdAt.toISOString() ?? null,
        mostRecentRunThumbnailBlobUrl,
        boundaryGeojson:
          (p.boundaryGeojson as BoundaryGeojson | null) ?? null,
      }
    }),
  )
}

export interface CreateProjectInput {
  name: string
  kmzBlobUrl: string
  kmzSha256: string
  edits?: unknown
  boundaryGeojson?: BoundaryGeojson
}

/**
 * Create a new Project for the user after enforcing the per-tier
 * concurrent-project quota.
 *
 * Quota check is best-effort (count + insert is not in a single
 * SERIALIZABLE tx). Acceptable because the desktop is single-user-
 * single-machine and project creates are user-driven UI clicks; a
 * concurrent-create race is very unlikely. If we ever observe over-
 * quota state in prod, wrap in a SERIALIZABLE tx + retry.
 */
export async function createProject(
  userId: string,
  input: CreateProjectInput,
): Promise<ProjectWire> {
  const quota = await getProjectQuotaState(userId)
  if (quota.projectsRemaining <= 0) {
    throw new AppError(
      "PAYMENT_REQUIRED",
      `Project quota exhausted (${quota.projectsActive}/${quota.projectQuota}). ` +
        `Delete a project or upgrade your plan to add more.`,
      402,
    )
  }

  const project = await db.project.create({
    data: {
      userId,
      name: input.name,
      kmzBlobUrl: input.kmzBlobUrl,
      kmzSha256: input.kmzSha256,
      ...(input.edits !== undefined
        ? { edits: input.edits as object }
        : {}),
      ...(input.boundaryGeojson !== undefined
        ? { boundaryGeojson: input.boundaryGeojson as object }
        : {}),
    },
  })

  return {
    id: project.id,
    userId: project.userId,
    name: project.name,
    kmzBlobUrl: project.kmzBlobUrl,
    kmzSha256: project.kmzSha256,
    edits: project.edits,
    boundaryGeojson:
      (project.boundaryGeojson as BoundaryGeojson | null) ?? null,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    deletedAt: project.deletedAt?.toISOString() ?? null,
  }
}

/**
 * Project detail with embedded run summaries and a presigned-GET URL for
 * the KMZ blob. Heavy run fields (inputsSnapshot, blob URLs, exports list)
 * stay on B17 — this list view stays fast even for projects with many runs.
 *
 * `kmzDownloadUrl` is signed at request time against
 * `MVP_S3_PROJECTS_BUCKET` (1h TTL) so the desktop's open-existing-project
 * flow is a single round-trip: B12 → S3 GET → sidecar parse → render. The
 * key path matches B6's upload contract (`projects/<userId>/kmz/<sha>.kmz`).
 * Null when the bucket env var is unset (local dev without S3).
 *
 * 404 on any miss: project doesn't exist, soft-deleted, or owned by a
 * different user. Cross-user existence is never leaked.
 */
export async function getProject(
  userId: string,
  projectId: string,
): Promise<ProjectDetail> {
  const project = await db.project.findFirst({
    where: { id: projectId, userId, deletedAt: null },
    include: {
      runs: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          params: true,
          billedFeatureKey: true,
          createdAt: true,
        },
      },
    },
  })
  if (!project) {
    throw new NotFoundError("Project", projectId)
  }

  const bucket = env.MVP_S3_PROJECTS_BUCKET
  const kmzKey = `projects/${userId}/kmz/${project.kmzSha256}.kmz`
  const kmzDownloadUrl = bucket
    ? await getPresignedDownloadUrl(
        kmzKey,
        `${project.name}.kmz`,
        KMZ_DOWNLOAD_TTL_SECONDS,
        bucket,
      )
    : null

  const runs = await Promise.all(
    project.runs.map(async (r) => ({
      id: r.id,
      name: r.name,
      params: r.params,
      billedFeatureKey: r.billedFeatureKey,
      createdAt: r.createdAt.toISOString(),
      thumbnailBlobUrl: bucket
        ? await getPresignedDownloadUrl(
            `projects/${userId}/${projectId}/runs/${r.id}/thumbnail.webp`,
            "thumbnail.webp",
            THUMBNAIL_DOWNLOAD_TTL_SECONDS,
            bucket,
          )
        : null,
    })),
  )

  return {
    id: project.id,
    userId: project.userId,
    name: project.name,
    kmzBlobUrl: project.kmzBlobUrl,
    kmzSha256: project.kmzSha256,
    edits: project.edits,
    boundaryGeojson:
      (project.boundaryGeojson as BoundaryGeojson | null) ?? null,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    deletedAt: project.deletedAt?.toISOString() ?? null,
    kmzDownloadUrl,
    runs,
  }
}

export interface PatchProjectInput {
  name?: string
  edits?: unknown
}

/**
 * Auto-save target. Updates only the supplied fields; `kmzBlobUrl` and
 * `kmzSha256` are immutable post-create (rejected at the route via Zod
 * `.strict()` so the desktop fails fast on a mistakenly-included key).
 *
 * Ownership is checked via a pre-flight findFirst — projects owned by
 * another user, soft-deleted projects, and non-existent IDs all return
 * the same 404, never leaking which case applies. Two queries (find +
 * update) is acceptable for an auto-save endpoint where network latency
 * dwarfs DB ops.
 */
export async function patchProject(
  userId: string,
  projectId: string,
  patch: PatchProjectInput,
): Promise<ProjectWire> {
  const existing = await db.project.findFirst({
    where: { id: projectId, userId, deletedAt: null },
    select: { id: true },
  })
  if (!existing) {
    throw new NotFoundError("Project", projectId)
  }

  const updated = await db.project.update({
    where: { id: projectId },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.edits !== undefined
        ? { edits: patch.edits as object }
        : {}),
    },
  })

  return {
    id: updated.id,
    userId: updated.userId,
    name: updated.name,
    kmzBlobUrl: updated.kmzBlobUrl,
    kmzSha256: updated.kmzSha256,
    edits: updated.edits,
    boundaryGeojson:
      (updated.boundaryGeojson as BoundaryGeojson | null) ?? null,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
    deletedAt: updated.deletedAt?.toISOString() ?? null,
  }
}

/**
 * Soft-delete a project + cascade soft-delete to its non-deleted runs.
 *
 * Both updates land in a single $transaction so we can never end up
 * with a deleted project that still shows live runs (or vice-versa).
 * Single Date is used for both updates so the audit trail makes the
 * cascade obvious.
 *
 * Blob assets in S3 are NOT touched — orphan-cleanup is a deferred
 * job (see plan §7). Multiple Projects may share the same KMZ
 * (content-addressed by sha256), so blob lifetime depends on whether
 * any non-deleted Project still references it.
 *
 * 404 on miss: project doesn't exist, soft-deleted, or owned by a
 * different user. A second DELETE on a soft-deleted project is also
 * 404 (idempotent in the GET-after-DELETE sense, not the
 * "POST twice == one effect" sense).
 */
export async function deleteProject(
  userId: string,
  projectId: string,
): Promise<void> {
  const existing = await db.project.findFirst({
    where: { id: projectId, userId, deletedAt: null },
    select: { id: true },
  })
  if (!existing) {
    throw new NotFoundError("Project", projectId)
  }

  const now = new Date()
  await db.$transaction([
    db.project.update({
      where: { id: projectId },
      data: { deletedAt: now },
    }),
    db.run.updateMany({
      where: { projectId, deletedAt: null },
      data: { deletedAt: now },
    }),
  ])
}
