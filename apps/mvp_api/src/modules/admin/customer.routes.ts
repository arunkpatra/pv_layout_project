import { Hono } from "hono"
import { z } from "zod"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"
import { clerkAuth } from "../../middleware/clerk-auth.js"
import { requireRole } from "../../middleware/rbac.js"
import {
  listCustomers,
  getCustomer,
  updateEntitlementStatus,
  updateEntitlementUsed,
} from "./customer.service.js"
import { ok } from "../../lib/response.js"
import { ValidationError } from "../../lib/errors.js"

export const customerRoutes = new Hono<MvpHonoEnv>()

const EntitlementStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
})

const EntitlementUsedSchema = z.object({
  usedCalculations: z.number().int().min(0),
})

customerRoutes.use("/admin/*", clerkAuth, requireRole("ADMIN", "OPS"))

customerRoutes.get("/admin/customers", async (c) => {
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1)
  const pageSize = Math.min(
    Math.max(1, parseInt(c.req.query("pageSize") ?? "20", 10) || 20),
    100,
  )
  const result = await listCustomers({ page, pageSize })
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

customerRoutes.patch("/admin/entitlements/:id/used", async (c) => {
  const { id } = c.req.param()
  const parsed = EntitlementUsedSchema.safeParse(await c.req.json())
  if (!parsed.success) {
    throw new ValidationError(parsed.error.flatten().fieldErrors)
  }
  const updated = await updateEntitlementUsed({
    entitlementId: id,
    usedCalculations: parsed.data.usedCalculations,
  })
  return c.json(ok(updated))
})
