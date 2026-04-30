import { Hono } from "hono"
import { ok } from "../../lib/response.js"
import { ValidationError } from "../../lib/errors.js"
import { ContactSchema, submitContact } from "./contact.service.js"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"

export const contactRoutes = new Hono<MvpHonoEnv>()

// POST /contact — submit a contact form message
contactRoutes.post("/contact", async (c) => {
  const body = await c.req.json()

  const parsed = ContactSchema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.flatten().fieldErrors)
  }

  const ipAddress =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"

  const result = await submitContact(parsed.data, ipAddress)
  return c.json(ok(result))
})
