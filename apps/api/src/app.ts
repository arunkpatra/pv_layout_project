import { Hono } from "hono"
import { cors } from "hono/cors"
import { env } from "./env.js"
import { prisma } from "@renewable-energy/db"
import { requestLogger } from "./middleware/logger.js"
import { errorHandler } from "./middleware/error-handler.js"
import { authMiddleware } from "./middleware/auth.js"
import type { HonoEnv } from "./middleware/auth.js"
import { identityRoutes } from "./modules/identity/identity.routes.js"
import { renderRoot } from "./views/root.html.js"

export const app = new Hono<HonoEnv>()

// ─── Middleware ────────────────────────────────────────────────────────────────

// CORS — must be first so OPTIONS preflight requests are handled before auth/logging
const corsOrigins = env.CORS_ORIGINS
  ? env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:3000"] // web app dev default

app.use("*", cors({ origin: corsOrigins }))
app.use("*", requestLogger)
app.onError(errorHandler)

// ─── Routes ────────────────────────────────────────────────────────────────────

app.get("/", async (c) => {
  const status = {
    database: "ok" as "ok" | "error",
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  }

  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    status.database = "error"
  }

  return c.html(renderRoot(status))
})

app.route("/", identityRoutes)

// ─── Health Checks ─────────────────────────────────────────────────────────────

app.get("/health/live", (c) =>
  c.json({
    success: true,
    data: {
      status: "live",
      service: "renewable-energy-api",
      timestamp: new Date().toISOString(),
    },
  }),
)

// Protected health check — verifies auth middleware is wired correctly
app.get("/health/authed", authMiddleware, (c) => {
  const user = c.get("user")
  return c.json({
    success: true,
    data: { status: "authed", userId: user.id, clerkId: user.clerkId },
  })
})

app.get("/health/ready", async (c) => {
  const checks: Record<string, "ok" | "error"> = {}

  try {
    await prisma.$queryRaw`SELECT 1`
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
