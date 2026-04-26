import { z } from "zod"
import { db } from "../../lib/db.js"
import { getPresignedDownloadUrl } from "../../lib/s3.js"

// ─── Validation ───────────────────────────────────────────────────────────────

const ProductEnum = z.enum([
  "PV Layout",
  "PV Layout Basic",
  "PV Layout Pro",
  "PV Layout Pro Plus",
])

export const DownloadRegisterSchema = z.object({
  name: z.string().min(1, "name is required"),
  email: z.string().email("invalid email format"),
  mobile: z.string().optional(),
  product: ProductEnum,
})

export type DownloadRegisterInput = z.infer<typeof DownloadRegisterSchema>

// ─── Product to S3 key mapping ────────────────────────────────────────────────

const DOWNLOAD_S3_KEY = "downloads/pv_layout.zip"
const DOWNLOAD_FILENAME = "pv_layout.zip"

// ─── Service ──────────────────────────────────────────────────────────────────

export async function registerDownload(
  input: DownloadRegisterInput,
  ipAddress: string,
): Promise<{ downloadUrl: string }> {
  // Insert registration row
  await db.downloadRegistration.create({
    data: {
      name: input.name,
      email: input.email,
      mobile: input.mobile ?? null,
      product: input.product,
      ipAddress,
    },
  })

  // Generate presigned download URL
  const downloadUrl = await getPresignedDownloadUrl(
    DOWNLOAD_S3_KEY,
    DOWNLOAD_FILENAME,
    3600,
  )

  if (!downloadUrl) {
    throw new Error(
      "S3 download URL generation failed — check S3 configuration",
    )
  }

  return { downloadUrl }
}
