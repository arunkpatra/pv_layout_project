import { Hono } from "hono"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"
import { clerkAuth } from "../../middleware/clerk-auth.js"
import { requireRole } from "../../middleware/rbac.js"
import { getDashboardSummary, getDashboardTrends } from "./dashboard.service.js"
import { ok } from "../../lib/response.js"

export const dashboardAdminRoutes = new Hono<MvpHonoEnv>()

dashboardAdminRoutes.use("/admin/*", clerkAuth, requireRole("ADMIN", "OPS"))

dashboardAdminRoutes.get("/admin/dashboard/summary", async (c) => {
  const result = await getDashboardSummary()
  return c.json(ok(result))
})

dashboardAdminRoutes.get("/admin/dashboard/trends", async (c) => {
  const raw = c.req.query("granularity")
  const granularity =
    raw === "daily" || raw === "weekly" || raw === "monthly" ? raw : "monthly"
  const result = await getDashboardTrends(granularity)
  return c.json(ok(result))
})
