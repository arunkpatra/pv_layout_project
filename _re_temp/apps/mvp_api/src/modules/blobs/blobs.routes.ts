import { Hono } from "hono"
import { z } from "zod"
import { licenseKeyAuth } from "../../middleware/license-key-auth.js"
import { ok } from "../../lib/response.js"
import { AppError } from "../../lib/errors.js"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"
import {
  getKmzUploadUrl,
  getRunResultUploadUrl,
  MAX_KMZ_SIZE,
  RUN_RESULT_SPEC,
} from "./blobs.service.js"

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

const RunResultUploadUrlSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("layout"),
    projectId: z.string().min(1),
    runId: z.string().min(1),
    size: z.number().int().positive().max(RUN_RESULT_SPEC.layout.maxSize),
  }),
  z.object({
    type: z.literal("energy"),
    projectId: z.string().min(1),
    runId: z.string().min(1),
    size: z.number().int().positive().max(RUN_RESULT_SPEC.energy.maxSize),
  }),
  z.object({
    type: z.literal("dxf"),
    projectId: z.string().min(1),
    runId: z.string().min(1),
    size: z.number().int().positive().max(RUN_RESULT_SPEC.dxf.maxSize),
  }),
  z.object({
    type: z.literal("pdf"),
    projectId: z.string().min(1),
    runId: z.string().min(1),
    size: z.number().int().positive().max(RUN_RESULT_SPEC.pdf.maxSize),
  }),
  z.object({
    type: z.literal("kmz"),
    projectId: z.string().min(1),
    runId: z.string().min(1),
    size: z.number().int().positive().max(RUN_RESULT_SPEC.kmz.maxSize),
  }),
  z.object({
    type: z.literal("thumbnail"),
    projectId: z.string().min(1),
    runId: z.string().min(1),
    size: z.number().int().positive().max(RUN_RESULT_SPEC.thumbnail.maxSize),
  }),
])

blobsRoutes.post("/v2/blobs/run-result-upload-url", async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw new AppError("VALIDATION_ERROR", "Body must be valid JSON", 400)
  }

  const parsed = RunResultUploadUrlSchema.safeParse(body)
  if (!parsed.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Invalid request body",
      400,
      parsed.error.flatten(),
    )
  }

  const user = c.get("user")
  const result = await getRunResultUploadUrl(
    user.id,
    parsed.data.projectId,
    parsed.data.runId,
    parsed.data.type,
    parsed.data.size,
  )
  return c.json(ok(result))
})
