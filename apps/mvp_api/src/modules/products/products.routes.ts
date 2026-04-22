import { Hono } from "hono"
import { db } from "../../lib/db.js"
import { ok } from "../../lib/response.js"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"

export const productsRoutes = new Hono<MvpHonoEnv>()

productsRoutes.get("/products", async (c) => {
  const products = await db.product.findMany({
    where: { active: true, isFree: false },
    orderBy: { displayOrder: "asc" },
    select: {
      slug: true,
      name: true,
      description: true,
      priceAmount: true,
      priceCurrency: true,
      calculations: true,
      features: {
        select: {
          featureKey: true,
          label: true,
        },
      },
    },
  })

  return c.json(ok({ products }))
})
