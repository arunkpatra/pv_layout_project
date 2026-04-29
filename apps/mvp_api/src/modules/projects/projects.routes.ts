import { Hono } from "hono"
import { licenseKeyAuth } from "../../middleware/license-key-auth.js"
import { ok } from "../../lib/response.js"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"
import { listProjects } from "./projects.service.js"

export const projectsRoutes = new Hono<MvpHonoEnv>()

projectsRoutes.use("/v2/projects", licenseKeyAuth)
projectsRoutes.use("/v2/projects/*", licenseKeyAuth)

projectsRoutes.get("/v2/projects", async (c) => {
  const user = c.get("user")
  const projects = await listProjects(user.id)
  return c.json(ok(projects))
})
