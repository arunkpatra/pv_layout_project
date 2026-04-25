import { Hono } from "hono"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"
import { clerkAuth } from "../../middleware/clerk-auth.js"
import { requireRole } from "../../middleware/rbac.js"
import { listProducts, getProduct, getProductSales, getProductsSummary } from "./product.service.js"
import { ok } from "../../lib/response.js"

export const productRoutes = new Hono<MvpHonoEnv>()

productRoutes.use("/admin/*", clerkAuth, requireRole("ADMIN", "OPS"))

productRoutes.get("/admin/products", async (c) => {
  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1)
  const pageSize = Math.min(
    Math.max(1, parseInt(c.req.query("pageSize") ?? "20", 10) || 20),
    100,
  )
  const result = await listProducts({ page, pageSize })
  return c.json(ok(result))
})

// NOTE: summary route MUST be registered before /:slug to prevent Hono matching
// "summary" as the :slug param value
productRoutes.get("/admin/products/summary", async (c) => {
  const result = await getProductsSummary()
  return c.json(ok(result))
})

// NOTE: sales route MUST be registered before /:slug to prevent Hono matching
// "sales" as the :slug param value
productRoutes.get("/admin/products/:slug/sales", async (c) => {
  const { slug } = c.req.param()
  const raw = c.req.query("granularity")
  const granularity =
    raw === "daily" || raw === "weekly" || raw === "monthly" ? raw : "monthly"
  const result = await getProductSales(slug, granularity)
  return c.json(ok(result))
})

productRoutes.get("/admin/products/:slug", async (c) => {
  const { slug } = c.req.param()
  const product = await getProduct(slug)
  return c.json(ok(product))
})
