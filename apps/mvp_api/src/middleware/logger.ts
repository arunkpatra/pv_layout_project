import type { MiddlewareHandler } from "hono"
import type { MvpHonoEnv } from "./error-handler.js"

export const requestLogger: MiddlewareHandler<MvpHonoEnv> = async (
  c,
  next,
) => {
  const start = Date.now()
  const requestId = crypto.randomUUID()

  await next()

  c.res.headers.set("X-Request-Id", requestId)
  const duration = Date.now() - start

  console.log(
    JSON.stringify({
      level: "info",
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: duration,
      timestamp: new Date().toISOString(),
    }),
  )
}
