import { Hono } from "hono"
import { licenseKeyAuth } from "../../middleware/license-key-auth.js"
import { ok } from "../../lib/response.js"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"
import { listRunsForProject } from "./runs.service.js"

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
