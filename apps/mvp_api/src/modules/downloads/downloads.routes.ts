import { Hono } from "hono"
import { ok } from "../../lib/response.js"
import { ValidationError } from "../../lib/errors.js"
import {
  DownloadRegisterSchema,
  registerDownload,
} from "./downloads.service.js"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"

export const downloadsRoutes = new Hono<MvpHonoEnv>()

// POST /download-register — register a download and return presigned S3 URL
downloadsRoutes.post("/download-register", async (c) => {
  const body = await c.req.json()

  const parsed = DownloadRegisterSchema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.flatten().fieldErrors)
  }

  const ipAddress =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"

  const result = await registerDownload(parsed.data, ipAddress)
  return c.json(ok(result))
})
