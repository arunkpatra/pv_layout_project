import { Hono } from "hono"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"
import { clerkAuth } from "../../middleware/clerk-auth.js"
import { requireRole } from "../../middleware/rbac.js"
import {
  createManualTransaction,
  listTransactions,
  getTransaction,
} from "./transactions.service.js"
import { createManualTransactionBody, transactionFiltersQuery } from "./types.js"
import { ValidationError } from "../../lib/errors.js"

export const transactionsRoutes = new Hono<MvpHonoEnv>()

// All /admin/transactions* routes require authentication + ADMIN role
transactionsRoutes.use("/admin/transactions/*", clerkAuth, requireRole("ADMIN"))
transactionsRoutes.use("/admin/transactions", clerkAuth, requireRole("ADMIN"))

transactionsRoutes.post("/admin/transactions", async (c) => {
  const parsed = createManualTransactionBody.safeParse(await c.req.json())
  if (!parsed.success) {
    throw new ValidationError(parsed.error.flatten().fieldErrors)
  }

  const body = parsed.data
  const adminUser = c.get("user")

  const result = await createManualTransaction({
    userId: body.userId,
    productSlug: body.productSlug,
    paymentMethod: body.paymentMethod,
    externalReference: body.externalReference ?? null,
    notes: body.notes ?? null,
    purchasedAt: body.purchasedAt ? new Date(body.purchasedAt) : undefined,
    createdByUserId: adminUser.id,
  })

  return c.json({ success: true, data: result })
})

transactionsRoutes.get("/admin/transactions", async (c) => {
  const parseResult = transactionFiltersQuery.safeParse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  )
  if (!parseResult.success) {
    throw new ValidationError(parseResult.error.format())
  }
  const result = await listTransactions(parseResult.data)
  return c.json({ success: true, data: result })
})

transactionsRoutes.get("/admin/transactions/:id", async (c) => {
  const id = c.req.param("id")
  const result = await getTransaction(id)
  return c.json({ success: true, data: result })
})
