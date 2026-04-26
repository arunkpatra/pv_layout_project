import { Hono } from "hono"
import { clerkAuth } from "../../middleware/clerk-auth.js"
import { getPresignedDownloadUrl } from "../../lib/s3.js"
import { ok } from "../../lib/response.js"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"

const DOWNLOAD_S3_KEY = "downloads/pv_layout.exe"
const DOWNLOAD_FILENAME = "pv_layout.exe"

export const dashboardRoutes = new Hono<MvpHonoEnv>()

// All /dashboard/* routes require Clerk authentication
dashboardRoutes.use("/dashboard/*", clerkAuth)

// GET /dashboard/download
dashboardRoutes.get("/dashboard/download", async (c) => {
  const url = await getPresignedDownloadUrl(
    DOWNLOAD_S3_KEY,
    DOWNLOAD_FILENAME,
    60,
  )

  if (!url) {
    throw new Error("S3 not configured — cannot generate download URL")
  }

  return c.json(ok({ url }))
})
