import { Hono } from "hono"
import { z } from "zod"
import { licenseKeyAuth } from "../../middleware/license-key-auth.js"
import { ok } from "../../lib/response.js"
import { AppError } from "../../lib/errors.js"
import { reportUsage, reportUsageV2 } from "./usage.service.js"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"

export const usageRoutes = new Hono<MvpHonoEnv>()

usageRoutes.use("/usage/report", licenseKeyAuth)
usageRoutes.use("/v2/usage/report", licenseKeyAuth)

const UsageReportSchema = z.object({
  feature: z.string().min(1),
})

const UsageReportV2Schema = z.object({
  feature: z.string().min(1),
  idempotencyKey: z.string().min(1),
})

// FROZEN — no new features. Maintained for legacy install only.
// New usage-reporting fields ship on /v2/usage/report (below) only.
usageRoutes.post("/usage/report", async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw new AppError("VALIDATION_ERROR", "Body must be valid JSON", 400)
  }
  const parsed = UsageReportSchema.safeParse(body)
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid request body", 400)
  }

  const user = c.get("user")
  const licenseKey = c.get("licenseKey")!

  const result = await reportUsage(user.id, licenseKey.id, parsed.data.feature)
  return c.json(ok(result))
})

usageRoutes.post("/v2/usage/report", async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw new AppError("VALIDATION_ERROR", "Body must be valid JSON", 400)
  }
  const parsed = UsageReportV2Schema.safeParse(body)
  if (!parsed.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Invalid request body",
      400,
      parsed.error.flatten(),
    )
  }

  const user = c.get("user")
  const licenseKey = c.get("licenseKey")!

  const result = await reportUsageV2(
    user.id,
    licenseKey.id,
    parsed.data.feature,
    parsed.data.idempotencyKey,
  )
  return c.json(ok(result))
})
