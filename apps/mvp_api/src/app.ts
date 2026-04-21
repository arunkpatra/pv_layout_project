import { Hono } from "hono"
import { cors } from "hono/cors"
import { env } from "./env.js"
import { db } from "./lib/db.js"
import { requestLogger } from "./middleware/logger.js"
import { errorHandler } from "./middleware/error-handler.js"
import type { MvpHonoEnv } from "./middleware/error-handler.js"
import { renderRoot } from "./views/root.html.js"
import { downloadsRoutes } from "./modules/downloads/downloads.routes.js"

export const app = new Hono<MvpHonoEnv>()

// ─── Middleware ────────────────────────────────────────────────────────────────

// CORS — must be first so OPTIONS preflight requests are handled before logging
const corsOrigins = env.CORS_ORIGINS
  ? env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:3002"] // mvp_web dev default

app.use("*", cors({ origin: corsOrigins }))
app.use("*", requestLogger)
app.onError(errorHandler)

// ─── Routes ────────────────────────────────────────────────────────────────────

app.route("/", downloadsRoutes)

app.get("/", async (c) => {
  const status = {
    database: "ok" as "ok" | "error",
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  }

  try {
    await db.$queryRaw`SELECT 1`
  } catch {
    status.database = "error"
  }

  return c.html(renderRoot(status))
})

// ─── Health Checks ─────────────────────────────────────────────────────────────

app.get("/health/live", (c) =>
  c.json({
    success: true,
    data: {
      status: "live",
      service: "mvp-api",
      timestamp: new Date().toISOString(),
    },
  }),
)

app.get("/health/ready", async (c) => {
  const checks: Record<string, "ok" | "error"> = {}

  try {
    await db.$queryRaw`SELECT 1`
    checks.database = "ok"
  } catch {
    checks.database = "error"
  }

  const allOk = Object.values(checks).every((v) => v === "ok")
  return c.json(
    {
      success: allOk,
      data: { status: allOk ? "ready" : "degraded", checks },
    },
    allOk ? 200 : 503,
  )
})
