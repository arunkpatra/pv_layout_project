import { db } from "../../lib/db.js"

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
