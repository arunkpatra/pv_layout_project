import type { ErrorHandler } from "hono"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import type { HonoEnv } from "./auth.js"
import { AppError } from "../lib/errors.js"
import { err } from "../lib/response.js"

export const errorHandler: ErrorHandler<HonoEnv> = (error, c) => {
  if (error instanceof AppError) {
    return c.json(
      err(error.code, error.message, error.details),
      error.statusCode as ContentfulStatusCode,
    )
  }

  console.error(
    JSON.stringify({
      level: "error",
      message: error.message,
      stack: error.stack,
    }),
  )
  return c.json(err("INTERNAL_ERROR", "An unexpected error occurred"), 500)
}
