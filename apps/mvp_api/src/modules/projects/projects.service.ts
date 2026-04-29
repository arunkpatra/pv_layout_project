import { db } from "../../lib/db.js"
import { AppError, NotFoundError } from "../../lib/errors.js"
import { getProjectQuotaState } from "../entitlements/entitlements.service.js"

export interface ProjectSummary {
  id: string
  name: string
  kmzBlobUrl: string
  kmzSha256: string
  createdAt: string
  updatedAt: string
  runsCount: number
  lastRunAt: string | null
}

const LIST_CAP = 100

/**
 * List the user's non-soft-deleted projects, sorted updatedAt DESC,
 * capped at 100 (no pagination at v1 — desktop ceiling is 15 quota
 * concurrent so 100 is comfortable headroom).
 *
 * Each summary carries runsCount (excluding soft-deleted runs) and
 * lastRunAt (latest non-soft-deleted Run.createdAt, or null).
 */
export async function listProjects(userId: string): Promise<ProjectSummary[]> {
  const projects = await db.project.findMany({
    where: { userId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
    take: LIST_CAP,
    include: {
      runs: {
        where: { deletedAt: null },
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      _count: {
        select: { runs: { where: { deletedAt: null } } },
      },
    },
  })

  return projects.map((p) => ({
    id: p.id,
    name: p.name,
    kmzBlobUrl: p.kmzBlobUrl,
    kmzSha256: p.kmzSha256,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    runsCount: p._count.runs,
    lastRunAt: p.runs[0]?.createdAt.toISOString() ?? null,
  }))
}

export interface CreateProjectInput {
  name: string
  kmzBlobUrl: string
  kmzSha256: string
  edits?: unknown
}

export interface ProjectWire {
  id: string
  userId: string
  name: string
  kmzBlobUrl: string
  kmzSha256: string
  edits: unknown
  createdAt: string
  updatedAt: string
  deletedAt: string | null
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
    },
  })

  return {
    id: project.id,
    userId: project.userId,
    name: project.name,
    kmzBlobUrl: project.kmzBlobUrl,
    kmzSha256: project.kmzSha256,
    edits: project.edits,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    deletedAt: project.deletedAt?.toISOString() ?? null,
  }
}

export interface RunSummary {
  id: string
  name: string
  params: unknown
  billedFeatureKey: string
  createdAt: string
}

export interface ProjectDetail extends ProjectWire {
  runs: RunSummary[]
}

/**
 * Project detail with embedded run summaries. Heavy fields
 * (inputsSnapshot, blob URLs, exports list) are intentionally omitted —
 * the desktop fetches them per-run via B17 (`GET /v2/projects/:id/runs/:runId`)
 * to keep this list view fast even for projects with many runs.
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
  return {
    id: project.id,
    userId: project.userId,
    name: project.name,
    kmzBlobUrl: project.kmzBlobUrl,
    kmzSha256: project.kmzSha256,
    edits: project.edits,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    deletedAt: project.deletedAt?.toISOString() ?? null,
    runs: project.runs.map((r) => ({
      id: r.id,
      name: r.name,
      params: r.params,
      billedFeatureKey: r.billedFeatureKey,
      createdAt: r.createdAt.toISOString(),
    })),
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
