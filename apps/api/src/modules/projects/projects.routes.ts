import { Hono } from "hono"
import { authMiddleware } from "../../middleware/auth.js"
import { ok } from "../../lib/response.js"
import { ValidationError, NotFoundError } from "../../lib/errors.js"
import {
  listProjects,
  getProject,
  createProject,
  deleteProject,
  createVersion,
  getVersion,
} from "./projects.service.js"
import type { HonoEnv } from "../../middleware/auth.js"

export const projectsRoutes = new Hono<HonoEnv>()

// All project routes require auth
projectsRoutes.use("/projects/*", authMiddleware)
projectsRoutes.use("/projects", authMiddleware)

// GET /projects — list all projects for the authenticated user
projectsRoutes.get("/projects", async (c) => {
  const { id: userId } = c.get("user")
  const projects = await listProjects(userId)
  return c.json(ok(projects))
})

// POST /projects — create a new project
projectsRoutes.post("/projects", async (c) => {
  const { id: userId } = c.get("user")
  const body = await c.req.json()
  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    throw new ValidationError({ name: "name is required" })
  }
  const project = await createProject(userId, { name: body.name.trim() })
  return c.json(ok(project), 201)
})

// GET /projects/:projectId — get a single project
projectsRoutes.get("/projects/:projectId", async (c) => {
  const { id: userId } = c.get("user")
  const { projectId } = c.req.param()
  const project = await getProject(projectId, userId)
  return c.json(ok(project))
})

// DELETE /projects/:projectId — delete a project (cascades to versions and jobs)
projectsRoutes.delete("/projects/:projectId", async (c) => {
  const { id: userId } = c.get("user")
  const { projectId } = c.req.param()
  await deleteProject(projectId, userId)
  return c.json(ok(null))
})

// POST /projects/:projectId/versions — submit a new version (with optional KMZ upload)
projectsRoutes.post("/projects/:projectId/versions", async (c) => {
  const { id: userId } = c.get("user")
  const { projectId } = c.req.param()

  const contentType = c.req.header("content-type") ?? ""

  let inputSnapshot: Record<string, unknown>
  let kmzBuffer: Buffer | undefined

  let label: string | undefined

  if (contentType.includes("multipart/form-data")) {
    const formData = await c.req.formData()
    const paramsRaw = formData.get("params")
    if (!paramsRaw || typeof paramsRaw !== "string") {
      throw new ValidationError({ params: "params JSON field is required" })
    }
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(paramsRaw)
    } catch {
      throw new ValidationError({ params: "params must be valid JSON" })
    }
    if (typeof parsed.label === "string") {
      label = parsed.label
      delete parsed.label
    }
    inputSnapshot = parsed
    const kmzFile = formData.get("kmz")
    if (kmzFile && typeof kmzFile !== "string") {
      kmzBuffer = Buffer.from(await kmzFile.arrayBuffer())
    }
  } else {
    const body = await c.req.json()
    label = typeof body.label === "string" ? body.label : undefined
    inputSnapshot = body.inputSnapshot ?? body
  }

  const version = await createVersion(userId, {
    projectId,
    label,
    inputSnapshot,
    kmzBuffer,
  })
  return c.json(ok(version), 201)
})

// GET /projects/:projectId/versions/:versionId — poll version status
projectsRoutes.get("/projects/:projectId/versions/:versionId", async (c) => {
  const { id: userId } = c.get("user")
  const { projectId, versionId } = c.req.param()
  const version = await getVersion(versionId, userId)
  if (version.projectId !== projectId) {
    throw new NotFoundError("Version", versionId)
  }
  return c.json(ok(version))
})
