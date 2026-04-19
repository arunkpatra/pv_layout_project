import { db } from "../../lib/db.js"
import { uploadToS3 } from "../../lib/s3.js"
import { dispatchLayoutJobHttp } from "../../lib/layout-engine.js"
import { publishLayoutJob } from "../../lib/sqs.js"
import { NotFoundError, ForbiddenError, ConflictError } from "../../lib/errors.js"
import type {
  Project,
  VersionDetail,
  LayoutJobSummary,
  EnergyJobSummary,
  CreateProjectInput,
  CreateVersionInput,
} from "@renewable-energy/shared"

// ─── Shappers ──────────────────────────────────────────────────────────────────

function shapeProject(p: {
  id: string
  userId: string
  name: string
  createdAt: Date
  updatedAt: Date
}): Project {
  return {
    id: p.id,
    userId: p.userId,
    name: p.name,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  }
}

function shapeLayoutJob(j: {
  id: string
  status: string
  kmzArtifactS3Key: string | null
  svgArtifactS3Key: string | null
  dxfArtifactS3Key: string | null
  statsJson: unknown
  errorDetail: string | null
  startedAt: Date | null
  completedAt: Date | null
} | null): LayoutJobSummary | null {
  if (!j) return null
  return {
    id: j.id,
    status: j.status as LayoutJobSummary["status"],
    kmzArtifactS3Key: j.kmzArtifactS3Key,
    svgArtifactS3Key: j.svgArtifactS3Key,
    dxfArtifactS3Key: j.dxfArtifactS3Key,
    statsJson: j.statsJson ?? null,
    errorDetail: j.errorDetail,
    startedAt: j.startedAt ? j.startedAt.toISOString() : null,
    completedAt: j.completedAt ? j.completedAt.toISOString() : null,
  }
}

function shapeEnergyJob(j: {
  id: string
  status: string
  pdfArtifactS3Key: string | null
  statsJson: unknown
  irradianceSource: string | null
  errorDetail: string | null
  startedAt: Date | null
  completedAt: Date | null
} | null): EnergyJobSummary | null {
  if (!j) return null
  return {
    id: j.id,
    status: j.status as EnergyJobSummary["status"],
    pdfArtifactS3Key: j.pdfArtifactS3Key,
    statsJson: j.statsJson ?? null,
    irradianceSource: j.irradianceSource,
    errorDetail: j.errorDetail,
    startedAt: j.startedAt ? j.startedAt.toISOString() : null,
    completedAt: j.completedAt ? j.completedAt.toISOString() : null,
  }
}

function shapeVersion(v: {
  id: string
  projectId: string
  number: number
  label: string | null
  status: string
  kmzS3Key: string | null
  inputSnapshot: unknown
  layoutJob: Parameters<typeof shapeLayoutJob>[0]
  energyJob: Parameters<typeof shapeEnergyJob>[0]
  createdAt: Date
  updatedAt: Date
}): VersionDetail {
  return {
    id: v.id,
    projectId: v.projectId,
    number: v.number,
    label: v.label,
    status: v.status as VersionDetail["status"],
    kmzS3Key: v.kmzS3Key,
    inputSnapshot: v.inputSnapshot,
    layoutJob: shapeLayoutJob(v.layoutJob),
    energyJob: shapeEnergyJob(v.energyJob),
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  }
}

// ─── Ownership guard ───────────────────────────────────────────────────────────

async function requireProjectOwnership(
  projectId: string,
  userId: string,
): Promise<{ id: string; userId: string; name: string; createdAt: Date; updatedAt: Date }> {
  const project = await db.project.findUnique({ where: { id: projectId } })
  if (!project) throw new NotFoundError("Project", projectId)
  if (project.userId !== userId) throw new ForbiddenError()
  return project
}

// ─── Projects ──────────────────────────────────────────────────────────────────

export async function listProjects(userId: string): Promise<Project[]> {
  const projects = await db.project.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  })
  return projects.map(shapeProject)
}

export async function getProject(projectId: string, userId: string): Promise<Project> {
  const project = await requireProjectOwnership(projectId, userId)
  return shapeProject(project)
}

export async function createProject(
  userId: string,
  input: CreateProjectInput,
): Promise<Project> {
  const project = await db.project.create({
    data: { userId, name: input.name },
  })
  return shapeProject(project)
}

export async function deleteProject(projectId: string, userId: string): Promise<void> {
  await requireProjectOwnership(projectId, userId)
  await db.project.delete({ where: { id: projectId } })
}

// ─── Versions ──────────────────────────────────────────────────────────────────

export async function createVersion(
  userId: string,
  input: CreateVersionInput & { kmzBuffer?: Buffer },
): Promise<VersionDetail> {
  await requireProjectOwnership(input.projectId, userId)

  const count = await db.version.count({ where: { projectId: input.projectId } })

  let version: Awaited<ReturnType<typeof db.version.create>>
  try {
    version = await db.version.create({
      data: {
        projectId: input.projectId,
        number: count + 1,
        label: input.label ?? null,
        kmzS3Key: null,
        inputSnapshot: JSON.parse(JSON.stringify(input.inputSnapshot)),
      },
    })
  } catch (err: unknown) {
    if (
      err !== null &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: unknown }).code === "P2002"
    ) {
      throw new ConflictError("Version number conflict — please retry")
    }
    throw err
  }

  let kmzS3Key: string | null = null
  if (input.kmzBuffer) {
    kmzS3Key = `projects/${input.projectId}/versions/${version.id}/input.kmz`
    await uploadToS3(input.kmzBuffer, kmzS3Key, "application/vnd.google-earth.kmz")
    await db.version.update({
      where: { id: version.id },
      data: { kmzS3Key },
    })
  }

  const [layoutJob, energyJob] = await Promise.all([
    db.layoutJob.create({ data: { versionId: version.id } }),
    db.energyJob.create({ data: { versionId: version.id } }),
  ])

  if (process.env.USE_LOCAL_ENV === "true") {
    try {
      dispatchLayoutJobHttp(version.id)
    } catch (err) {
      console.error("HTTP dispatch failed", err)
    }
  } else {
    publishLayoutJob(version.id).catch((err) => {
      console.error("SQS publish failed", err)
    })
  }

  return shapeVersion({ ...version, kmzS3Key, layoutJob, energyJob })
}

export async function getVersion(
  versionId: string,
  userId: string,
): Promise<VersionDetail> {
  const version = await db.version.findUnique({
    where: { id: versionId },
    include: {
      project: { select: { userId: true } },
      layoutJob: true,
      energyJob: true,
    },
  })

  if (!version) throw new NotFoundError("Version", versionId)
  if (version.project.userId !== userId) throw new ForbiddenError()

  return shapeVersion(version)
}
