import { Hono } from "hono"
import { z } from "zod"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"
import { clerkAuth } from "../../middleware/clerk-auth.js"
import { requireRole } from "../../middleware/rbac.js"
import {
  listCustomers,
  getCustomer,
  updateEntitlementStatus,
} from "./customer.service.js"
import { ok } from "../../lib/response.js"
import { ValidationError } from "../../lib/errors.js"

export const customerRoutes = new Hono<MvpHonoEnv>()

const EntitlementStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
})

customerRoutes.use(
  "/admin/customers*",
  clerkAuth,
  requireRole("ADMIN", "OPS"),
)
customerRoutes.use(
  "/admin/entitlements*",
  clerkAuth,
  requireRole("ADMIN", "OPS"),
)

customerRoutes.get("/admin/customers", async (c) => {
  const page = parseInt(c.req.query("page") ?? "1", 10)
  const pageSize = Math.min(
    parseInt(c.req.query("pageSize") ?? "20", 10),
    100,
  )
  const result = await listCustomers({
    page: isNaN(page) ? 1 : page,
    pageSize: isNaN(pageSize) ? 20 : pageSize,
  })
  return c.json(ok(result))
})

customerRoutes.get("/admin/customers/:id", async (c) => {
  const { id } = c.req.param()
  const filterParam = c.req.query("filter")
  const filter = filterParam === "all" ? "all" : "active"
  const customer = await getCustomer(id, filter)
  return c.json(ok(customer))
})

customerRoutes.patch("/admin/entitlements/:id/status", async (c) => {
  const { id } = c.req.param()
  const parsed = EntitlementStatusSchema.safeParse(await c.req.json())
  if (!parsed.success) {
    throw new ValidationError(parsed.error.flatten().fieldErrors)
  }
  const updated = await updateEntitlementStatus({
    entitlementId: id,
    status: parsed.data.status,
  })
  return c.json(ok(updated))
})
