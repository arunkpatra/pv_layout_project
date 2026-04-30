import { Hono } from "hono"
import { authMiddleware } from "../../middleware/auth.js"
import { ok } from "../../lib/response.js"
import { getMe } from "./identity.service.js"
import type { HonoEnv } from "../../middleware/auth.js"

export const identityRoutes = new Hono<HonoEnv>()

// GET /auth/me — returns the DB user record for the authenticated caller
identityRoutes.get("/auth/me", authMiddleware, async (c) => {
  const { id } = c.get("user")
  const user = await getMe(id)
  return c.json(ok(user))
})
