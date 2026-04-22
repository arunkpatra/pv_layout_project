import { Hono } from "hono"
import { z } from "zod"
import { licenseKeyAuth } from "../../middleware/license-key-auth.js"
import { ok } from "../../lib/response.js"
import { AppError } from "../../lib/errors.js"
import { reportUsage } from "./usage.service.js"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"

export const usageRoutes = new Hono<MvpHonoEnv>()

usageRoutes.use("/usage/report", licenseKeyAuth)

const UsageReportSchema = z.object({
  feature: z.string().min(1),
})

usageRoutes.post("/usage/report", async (c) => {
  const parsed = UsageReportSchema.safeParse(await c.req.json())
  if (!parsed.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid request body", 400)
  }

  const user = c.get("user")
  const licenseKey = c.get("licenseKey")!

  const result = await reportUsage(user.id, licenseKey.id, parsed.data.feature)
  return c.json(ok(result))
})
