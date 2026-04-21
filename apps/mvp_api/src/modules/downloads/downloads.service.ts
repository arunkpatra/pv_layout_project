import { z } from "zod"
import { db } from "../../lib/db.js"
import { getPresignedDownloadUrl } from "../../lib/s3.js"

// ─── Validation ───────────────────────────────────────────────────────────────

const ProductEnum = z.enum([
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

const PRODUCT_S3_KEYS: Record<string, string> = {
  "PV Layout Basic": "downloads/pv-layout-basic.exe",
  "PV Layout Pro": "downloads/pv-layout-pro.exe",
  "PV Layout Pro Plus": "downloads/pv-layout-pro-plus.exe",
}

const PRODUCT_FILENAMES: Record<string, string> = {
  "PV Layout Basic": "pv-layout-basic.exe",
  "PV Layout Pro": "pv-layout-pro.exe",
  "PV Layout Pro Plus": "pv-layout-pro-plus.exe",
}

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
  const s3Key = PRODUCT_S3_KEYS[input.product]!
  const filename = PRODUCT_FILENAMES[input.product]!
  const downloadUrl = await getPresignedDownloadUrl(s3Key, filename, 3600)

  if (!downloadUrl) {
    throw new Error(
      "S3 download URL generation failed — check S3 configuration",
    )
  }

  return { downloadUrl }
}
