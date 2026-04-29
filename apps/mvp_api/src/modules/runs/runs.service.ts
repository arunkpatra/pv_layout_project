import { db } from "../../lib/db.js"
import { NotFoundError } from "../../lib/errors.js"
import type { RunSummary } from "../projects/projects.service.js"

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

  return runs.map((r) => ({
    id: r.id,
    name: r.name,
    params: r.params,
    billedFeatureKey: r.billedFeatureKey,
    createdAt: r.createdAt.toISOString(),
  }))
}
