import { Hono } from "hono"
import { z } from "zod"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"
import { clerkAuth } from "../../middleware/clerk-auth.js"
import { requireRole } from "../../middleware/rbac.js"
import {
  listAdminUsers,
  getAdminUser,
  createAdminUser,
  updateUserRoles,
  updateUserStatus,
  searchUsersByEmail,
} from "./admin.service.js"
import { ok } from "../../lib/response.js"
import { ValidationError } from "../../lib/errors.js"

export const adminRoutes = new Hono<MvpHonoEnv>()

const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  roles: z.array(z.enum(["ADMIN", "OPS"])).min(1),
})

const RoleActionSchema = z.object({
  role: z.enum(["ADMIN", "OPS"]),
  action: z.enum(["add", "remove"]),
})

const StatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE"]),
})

// All admin routes require ADMIN role
adminRoutes.use("/admin/*", clerkAuth, requireRole("ADMIN"))

adminRoutes.get("/admin/users", async (c) => {
  const page = parseInt(c.req.query("page") ?? "1", 10)
  const pageSize = Math.min(
    parseInt(c.req.query("pageSize") ?? "20", 10),
    100,
  )
  const result = await listAdminUsers({
    page: isNaN(page) ? 1 : page,
    pageSize: isNaN(pageSize) ? 20 : pageSize,
  })
  return c.json(ok(result))
})

adminRoutes.get("/admin/users/search", async (c) => {
  const email = c.req.query("email") ?? ""
  const users = await searchUsersByEmail(email)
  return c.json({ success: true, data: { users } })
})

adminRoutes.get("/admin/users/:id", async (c) => {
  const { id } = c.req.param()
  const user = await getAdminUser(id)
  return c.json(ok(user))
})

adminRoutes.post("/admin/users", async (c) => {
  const parsed = CreateUserSchema.safeParse(await c.req.json())
  if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors)
  const user = await createAdminUser(parsed.data)
  return c.json(ok(user), 201)
})

adminRoutes.patch("/admin/users/:id/roles", async (c) => {
  const { id } = c.req.param()
  const parsed = RoleActionSchema.safeParse(await c.req.json())
  if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors)
  await updateUserRoles({ userId: id, ...parsed.data })
  return c.json(ok({ userId: id, role: parsed.data.role, action: parsed.data.action }))
})

adminRoutes.patch("/admin/users/:id/status", async (c) => {
  const { id } = c.req.param()
  const parsed = StatusSchema.safeParse(await c.req.json())
  if (!parsed.success) throw new ValidationError(parsed.error.flatten().fieldErrors)
  await updateUserStatus({ userId: id, status: parsed.data.status })
  return c.json(ok({ userId: id, status: parsed.data.status }))
})
