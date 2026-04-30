import type { MiddlewareHandler } from "hono"
import { AppError } from "../lib/errors.js"
import { db } from "../lib/db.js"

export const licenseKeyAuth: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header("Authorization")
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined

  if (!token || !token.startsWith("sl_live_")) {
    throw new AppError("UNAUTHORIZED", "Authentication required", 401)
  }

  const licenseKey = await db.licenseKey.findFirst({
    where: { key: token, revokedAt: null },
    include: { user: true },
  })

  if (!licenseKey) {
    throw new AppError("UNAUTHORIZED", "Invalid or revoked license key", 401)
  }

  c.set("user", licenseKey.user)
  c.set("licenseKey", licenseKey)
  await next()
}
