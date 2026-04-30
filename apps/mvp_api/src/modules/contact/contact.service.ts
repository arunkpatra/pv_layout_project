import { z } from "zod"
import { db } from "../../lib/db.js"

// ─── Validation ───────────────────────────────────────────────────────────────

export const ContactSchema = z.object({
  name: z.string().min(1, "name is required"),
  email: z.string().email("invalid email format"),
  subject: z.string().min(1, "subject is required"),
  message: z.string().min(1, "message is required"),
})

export type ContactInput = z.infer<typeof ContactSchema>

// ─── Service ──────────────────────────────────────────────────────────────────

export async function submitContact(
  input: ContactInput,
  ipAddress: string,
): Promise<{ message: string }> {
  await db.contactSubmission.create({
    data: {
      name: input.name,
      email: input.email,
      subject: input.subject,
      message: input.message,
      ipAddress,
    },
  })

  return {
    message:
      "Thank you for reaching out. We will get back to you within 2 business days.",
  }
}
