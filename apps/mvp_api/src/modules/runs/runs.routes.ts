import { Hono } from "hono"
import { z } from "zod"
import { licenseKeyAuth } from "../../middleware/license-key-auth.js"
import { ok } from "../../lib/response.js"
import { AppError } from "../../lib/errors.js"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"
import {
  createRunForProject,
  getRunDetail,
  listRunsForProject,
} from "./runs.service.js"

export const runsRoutes = new Hono<MvpHonoEnv>()

// All run endpoints are nested under /v2/projects/:id/runs and require
// license-key auth. Mounting on this app's own scope keeps the middleware
// declaration alongside the route handlers it guards.
runsRoutes.use("/v2/projects/*", licenseKeyAuth)

runsRoutes.get("/v2/projects/:id/runs", async (c) => {
  const user = c.get("user")
  const runs = await listRunsForProject(user.id, c.req.param("id"))
  return c.json(ok(runs))
})

runsRoutes.get("/v2/projects/:id/runs/:runId", async (c) => {
  const user = c.get("user")
  const detail = await getRunDetail(
    user.id,
    c.req.param("id"),
    c.req.param("runId"),
  )
  return c.json(ok(detail))
})

const CreateRunSchema = z.object({
  name: z.string().min(1).max(200),
  params: z.unknown(),
  inputsSnapshot: z.unknown(),
  billedFeatureKey: z.string().min(1),
  idempotencyKey: z.string().min(1),
})

runsRoutes.post("/v2/projects/:id/runs", async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw new AppError("VALIDATION_ERROR", "Body must be valid JSON", 400)
  }
  const parsed = CreateRunSchema.safeParse(body)
  if (!parsed.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Invalid request body",
      400,
      parsed.error.flatten(),
    )
  }
  // Zod doesn't error on missing optional `unknown`; explicitly require both.
  if (parsed.data.params === undefined) {
    throw new AppError("VALIDATION_ERROR", "params is required", 400)
  }
  if (parsed.data.inputsSnapshot === undefined) {
    throw new AppError("VALIDATION_ERROR", "inputsSnapshot is required", 400)
  }

  const user = c.get("user")
  const licenseKey = c.get("licenseKey")!
  const result = await createRunForProject(
    user.id,
    licenseKey.id,
    c.req.param("id"),
    {
      name: parsed.data.name,
      params: parsed.data.params,
      inputsSnapshot: parsed.data.inputsSnapshot,
      billedFeatureKey: parsed.data.billedFeatureKey,
      idempotencyKey: parsed.data.idempotencyKey,
    },
  )
  return c.json(ok(result), 201)
})
