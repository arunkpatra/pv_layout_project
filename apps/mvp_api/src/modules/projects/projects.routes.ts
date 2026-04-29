import { Hono } from "hono"
import { z } from "zod"
import { licenseKeyAuth } from "../../middleware/license-key-auth.js"
import { ok } from "../../lib/response.js"
import { AppError } from "../../lib/errors.js"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"
import { createProject, listProjects } from "./projects.service.js"

export const projectsRoutes = new Hono<MvpHonoEnv>()

projectsRoutes.use("/v2/projects", licenseKeyAuth)
projectsRoutes.use("/v2/projects/*", licenseKeyAuth)

projectsRoutes.get("/v2/projects", async (c) => {
  const user = c.get("user")
  const projects = await listProjects(user.id)
  return c.json(ok(projects))
})

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  kmzBlobUrl: z.string().min(1),
  kmzSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/, "must be 64-char lowercase hex"),
  edits: z.unknown().optional(),
})

projectsRoutes.post("/v2/projects", async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw new AppError("VALIDATION_ERROR", "Body must be valid JSON", 400)
  }
  const parsed = CreateProjectSchema.safeParse(body)
  if (!parsed.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Invalid request body",
      400,
      parsed.error.flatten(),
    )
  }

  const user = c.get("user")
  const project = await createProject(user.id, parsed.data)
  return c.json(ok(project), 201)
})
