import { Hono } from "hono"
import { licenseKeyAuth } from "../../middleware/license-key-auth.js"
import { db } from "../../lib/db.js"
import { ok } from "../../lib/response.js"
import { computeEntitlementSummary } from "./entitlements.service.js"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"

export const entitlementsRoutes = new Hono<MvpHonoEnv>()

entitlementsRoutes.use("/entitlements", licenseKeyAuth)
entitlementsRoutes.use("/usage/history", licenseKeyAuth)

entitlementsRoutes.get("/entitlements", async (c) => {
  const user = c.get("user")
  const summary = await computeEntitlementSummary(user)
  return c.json(ok(summary))
})

entitlementsRoutes.get("/usage/history", async (c) => {
  const user = c.get("user")
  const records = await db.usageRecord.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      product: { select: { name: true } },
    },
  })

  return c.json(
    ok({
      records: records.map((r) => ({
        featureKey: r.featureKey,
        productName: r.product.name,
        createdAt: r.createdAt.toISOString(),
      })),
    }),
  )
})
