import { verifyToken } from "@clerk/backend"
import type { MiddlewareHandler } from "hono"
import { env } from "../env.js"
import { AppError } from "../lib/errors.js"

export const clerkAuth: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header("Authorization")
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined

  if (!token) {
    throw new AppError("UNAUTHORIZED", "Authentication required", 401)
  }

  try {
    await verifyToken(token, { secretKey: env.CLERK_SECRET_KEY ?? "" })
  } catch {
    throw new AppError("UNAUTHORIZED", "Invalid or expired token", 401)
  }

  await next()
}
