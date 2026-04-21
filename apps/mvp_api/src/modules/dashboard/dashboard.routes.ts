import { Hono } from "hono"
import { clerkAuth } from "../../middleware/clerk-auth.js"
import { getPresignedDownloadUrl } from "../../lib/s3.js"
import { ok } from "../../lib/response.js"
import { ValidationError } from "../../lib/errors.js"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"

const VALID_PRODUCTS = [
  "pv-layout-basic",
  "pv-layout-pro",
  "pv-layout-pro-plus",
] as const

type ProductSlug = (typeof VALID_PRODUCTS)[number]

const PRODUCT_S3_KEYS: Record<ProductSlug, string> = {
  "pv-layout-basic": "downloads/pv-layout-basic.exe",
  "pv-layout-pro": "downloads/pv-layout-pro.exe",
  "pv-layout-pro-plus": "downloads/pv-layout-pro-plus.exe",
}

const PRODUCT_FILENAMES: Record<ProductSlug, string> = {
  "pv-layout-basic": "pv-layout-basic.exe",
  "pv-layout-pro": "pv-layout-pro.exe",
  "pv-layout-pro-plus": "pv-layout-pro-plus.exe",
}

function isValidProduct(slug: string): slug is ProductSlug {
  return (VALID_PRODUCTS as readonly string[]).includes(slug)
}

export const dashboardRoutes = new Hono<MvpHonoEnv>()

// All /dashboard/* routes require Clerk authentication
dashboardRoutes.use("/dashboard/*", clerkAuth)

// GET /dashboard/download/:product
dashboardRoutes.get("/dashboard/download/:product", async (c) => {
  const product = c.req.param("product")

  if (!isValidProduct(product)) {
    throw new ValidationError({
      product: [
        `Invalid product. Must be one of: ${VALID_PRODUCTS.join(", ")}`,
      ],
    })
  }

  const s3Key = PRODUCT_S3_KEYS[product]
  const filename = PRODUCT_FILENAMES[product]
  const url = await getPresignedDownloadUrl(s3Key, filename, 60)

  if (!url) {
    throw new Error("S3 not configured — cannot generate download URL")
  }

  return c.json(ok({ url }))
})
