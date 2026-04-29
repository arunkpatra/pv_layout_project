import { Hono } from "hono"
import { z } from "zod"
import { licenseKeyAuth } from "../../middleware/license-key-auth.js"
import { ok } from "../../lib/response.js"
import { AppError } from "../../lib/errors.js"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"
import { getKmzUploadUrl, MAX_KMZ_SIZE } from "./blobs.service.js"

export const blobsRoutes = new Hono<MvpHonoEnv>()

blobsRoutes.use("/v2/blobs/*", licenseKeyAuth)

const KmzUploadUrlSchema = z.object({
  kmzSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/, "must be 64-char lowercase hex"),
  kmzSize: z.number().int().positive().max(MAX_KMZ_SIZE),
})

blobsRoutes.post("/v2/blobs/kmz-upload-url", async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw new AppError("VALIDATION_ERROR", "Body must be valid JSON", 400)
  }

  const parsed = KmzUploadUrlSchema.safeParse(body)
  if (!parsed.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Invalid request body",
      400,
      parsed.error.flatten(),
    )
  }

  const user = c.get("user")
  const result = await getKmzUploadUrl(
    user.id,
    parsed.data.kmzSha256,
    parsed.data.kmzSize,
  )
  return c.json(ok(result))
})
