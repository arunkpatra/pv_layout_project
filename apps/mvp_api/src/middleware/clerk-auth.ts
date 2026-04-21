import { createClerkClient } from "@clerk/backend"
import type { MiddlewareHandler } from "hono"
import { env } from "../env.js"
import { AppError } from "../lib/errors.js"

const clerk = createClerkClient({
  secretKey: env.MVP_CLERK_SECRET_KEY ?? "",
})

export const clerkAuth: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header("Authorization")
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined

  if (!token) {
    throw new AppError("UNAUTHORIZED", "Authentication required", 401)
  }

  try {
    await clerk.verifyToken(token)
  } catch {
    throw new AppError("UNAUTHORIZED", "Invalid or expired token", 401)
  }

  await next()
}
