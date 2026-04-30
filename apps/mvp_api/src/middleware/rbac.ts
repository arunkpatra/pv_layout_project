import type { MiddlewareHandler } from "hono"
import type { MvpHonoEnv } from "./error-handler.js"
import { AppError } from "../lib/errors.js"

export function requireRole(...roles: string[]): MiddlewareHandler<MvpHonoEnv> {
  return async (c, next) => {
    const user = c.get("user")
    if (!user.roles.some((r) => roles.includes(r))) {
      throw new AppError("FORBIDDEN", "Insufficient role", 403)
    }
    return next()
  }
}
