import { Hono } from "hono"
import { z } from "zod"
import { licenseKeyAuth } from "../../middleware/license-key-auth.js"
import { ok } from "../../lib/response.js"
import { AppError } from "../../lib/errors.js"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  patchProject,
} from "./projects.service.js"

export const projectsRoutes = new Hono<MvpHonoEnv>()

projectsRoutes.use("/v2/projects", licenseKeyAuth)
projectsRoutes.use("/v2/projects/*", licenseKeyAuth)

projectsRoutes.get("/v2/projects", async (c) => {
  const user = c.get("user")
  const projects = await listProjects(user.id)
  return c.json(ok(projects))
})

/**
 * Loose GeoJSON Polygon | MultiPolygon validator. We don't enforce the
 * full spec (closed rings, right-hand rule, etc.) — just enough shape to
 * reject obvious garbage. Desktop is the only sender; full validation is
 * its job. The 50KB cap below catches malformed payloads independently.
 */
const BoundaryGeojsonSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("Polygon"),
    coordinates: z.array(z.array(z.array(z.number()).length(2))),
  }),
  z.object({
    type: z.literal("MultiPolygon"),
    coordinates: z.array(z.array(z.array(z.array(z.number()).length(2)))),
  }),
])

const MAX_BOUNDARY_GEOJSON_BYTES = 50 * 1024 // 50 KB

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  kmzBlobUrl: z.string().min(1),
  kmzSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/, "must be 64-char lowercase hex"),
  edits: z.unknown().optional(),
  boundaryGeojson: BoundaryGeojsonSchema.optional(),
})

projectsRoutes.get("/v2/projects/:id", async (c) => {
  const user = c.get("user")
  const project = await getProject(user.id, c.req.param("id"))
  return c.json(ok(project))
})

const PatchProjectSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    edits: z.unknown().optional(),
  })
  .strict()
  .refine((v) => v.name !== undefined || v.edits !== undefined, {
    message: "At least one of `name` or `edits` is required",
  })

projectsRoutes.delete("/v2/projects/:id", async (c) => {
  const user = c.get("user")
  await deleteProject(user.id, c.req.param("id"))
  return c.body(null, 204)
})

projectsRoutes.patch("/v2/projects/:id", async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw new AppError("VALIDATION_ERROR", "Body must be valid JSON", 400)
  }
  const parsed = PatchProjectSchema.safeParse(body)
  if (!parsed.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Invalid request body",
      400,
      parsed.error.flatten(),
    )
  }

  const user = c.get("user")
  const project = await patchProject(user.id, c.req.param("id"), parsed.data)
  return c.json(ok(project))
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

  if (parsed.data.boundaryGeojson) {
    const serialized = JSON.stringify(parsed.data.boundaryGeojson)
    if (serialized.length > MAX_BOUNDARY_GEOJSON_BYTES) {
      throw new AppError(
        "VALIDATION_ERROR",
        `boundaryGeojson must be ≤ ${MAX_BOUNDARY_GEOJSON_BYTES} bytes serialized`,
        400,
      )
    }
  }

  const user = c.get("user")
  const project = await createProject(user.id, parsed.data)
  return c.json(ok(project), 201)
})
