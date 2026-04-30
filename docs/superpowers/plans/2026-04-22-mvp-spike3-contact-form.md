# MVP Spike 3 — Contact Form Endpoint + Frontend Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `ContactSubmission` model, a `POST /contact` API endpoint, and wire the existing stubbed contact form in `apps/mvp_web` to call the real API with loading state, error handling, and a success message.

**Architecture:** `packages/mvp_db` gets a new `ContactSubmission` Prisma model mapped to `contact_submissions`. `apps/mvp_api` gets a new `modules/contact/` module following the exact same pattern as `modules/downloads/` (Zod schema, service function, route handler, bun:test with mocked DB). The frontend `apps/mvp_web` contact form switches from a stubbed toast to a real `fetch()` call following the `download-modal.tsx` pattern.

**Tech Stack:** Prisma v7, Hono v4, Bun runtime, Zod validation, Next.js 16 App Router, Vitest (frontend tests)

---

## Task 1: Add ContactSubmission model + migration

**Files:**
- `packages/mvp_db/prisma/schema.prisma`
- `packages/mvp_db/src/extensions/semantic-id/id-prefixes.ts`

### Steps

- [ ] **1.1** Add the `ContactSubmission` model to `packages/mvp_db/prisma/schema.prisma`:

Append after the `DownloadRegistration` model:

```prisma
model ContactSubmission {
  id        String   @id @default("")
  name      String
  email     String
  subject   String
  message   String
  ipAddress String
  createdAt DateTime @default(now())

  @@map("contact_submissions")
}
```

- [ ] **1.2** Add the `csb` prefix to `packages/mvp_db/src/extensions/semantic-id/id-prefixes.ts`:

```typescript
/**
 * MVP semantic ID prefix registry.
 * Maps Prisma model names to their entity prefix.
 *
 * Format: {prefix}_{base62_random} = 40 chars total
 * The prefix must be short enough to leave at least 8 chars for the suffix.
 */
export const ID_PREFIXES: Record<string, string> = {
  DownloadRegistration: "drg",
  ContactSubmission: "csb",
}
```

- [ ] **1.3** Regenerate the Prisma client:

```bash
cd packages/mvp_db && bun run db:generate
```

- [ ] **1.4** Run the migration locally:

```bash
cd packages/mvp_db && bun run db:migrate
```

When prompted for a migration name, use: `add_contact_submissions`

- [ ] **1.5** Verify the migration was created by checking that a new file exists under `packages/mvp_db/prisma/migrations/` with name containing `add_contact_submissions`.

---

## Task 2: Add POST /contact endpoint + tests

**Files:**
- `apps/mvp_api/src/modules/contact/contact.service.ts` (new)
- `apps/mvp_api/src/modules/contact/contact.routes.ts` (new)
- `apps/mvp_api/src/modules/contact/contact.test.ts` (new)
- `apps/mvp_api/src/app.ts` (modify)

### Steps

- [ ] **2.1** Create `apps/mvp_api/src/modules/contact/contact.service.ts`:

```typescript
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
```

- [ ] **2.2** Create `apps/mvp_api/src/modules/contact/contact.routes.ts`:

```typescript
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
```

- [ ] **2.3** Create `apps/mvp_api/src/modules/contact/contact.test.ts`:

```typescript
import { describe, test, expect, mock, beforeEach } from "bun:test"

// ─── Mock db ──────────────────────────────────────────────────────────────────

const now = new Date("2026-04-22T00:00:00.000Z")

const mockDbSubmission = {
  id: "csb_testContactSubmission00000000000000",
  name: "Test User",
  email: "test@example.com",
  subject: "Support",
  message: "I need help with the software.",
  ipAddress: "1.2.3.4",
  createdAt: now,
}

const mockContactSubmissionCreate = mock(() =>
  Promise.resolve(mockDbSubmission),
)

mock.module("../../lib/db.js", () => ({
  db: {
    contactSubmission: {
      create: mockContactSubmissionCreate,
    },
  },
}))

// ─── Import after mocks ──────────────────────────────────────────────────────

import { submitContact, ContactSchema } from "./contact.service.js"
import { app } from "../../app.js"

// ─── Schema validation tests ─────────────────────────────────────────────────

describe("ContactSchema", () => {
  test("accepts valid input with all fields", () => {
    const result = ContactSchema.safeParse({
      name: "Test User",
      email: "test@example.com",
      subject: "Support",
      message: "I need help with the software.",
    })
    expect(result.success).toBe(true)
  })

  test("rejects missing name", () => {
    const result = ContactSchema.safeParse({
      email: "test@example.com",
      subject: "Support",
      message: "I need help.",
    })
    expect(result.success).toBe(false)
  })

  test("rejects empty name", () => {
    const result = ContactSchema.safeParse({
      name: "",
      email: "test@example.com",
      subject: "Support",
      message: "I need help.",
    })
    expect(result.success).toBe(false)
  })

  test("rejects invalid email", () => {
    const result = ContactSchema.safeParse({
      name: "Test User",
      email: "not-an-email",
      subject: "Support",
      message: "I need help.",
    })
    expect(result.success).toBe(false)
  })

  test("rejects missing subject", () => {
    const result = ContactSchema.safeParse({
      name: "Test User",
      email: "test@example.com",
      message: "I need help.",
    })
    expect(result.success).toBe(false)
  })

  test("rejects empty subject", () => {
    const result = ContactSchema.safeParse({
      name: "Test User",
      email: "test@example.com",
      subject: "",
      message: "I need help.",
    })
    expect(result.success).toBe(false)
  })

  test("rejects missing message", () => {
    const result = ContactSchema.safeParse({
      name: "Test User",
      email: "test@example.com",
      subject: "Support",
    })
    expect(result.success).toBe(false)
  })

  test("rejects empty message", () => {
    const result = ContactSchema.safeParse({
      name: "Test User",
      email: "test@example.com",
      subject: "Support",
      message: "",
    })
    expect(result.success).toBe(false)
  })
})

// ─── Service tests ───────────────────────────────────────────────────────────

describe("submitContact", () => {
  beforeEach(() => {
    mockContactSubmissionCreate.mockClear()
  })

  test("creates submission row and returns success message", async () => {
    const result = await submitContact(
      {
        name: "Test User",
        email: "test@example.com",
        subject: "Support",
        message: "I need help with the software.",
      },
      "1.2.3.4",
    )

    expect(mockContactSubmissionCreate).toHaveBeenCalledWith({
      data: {
        name: "Test User",
        email: "test@example.com",
        subject: "Support",
        message: "I need help with the software.",
        ipAddress: "1.2.3.4",
      },
    })
    expect(result.message).toBe(
      "Thank you for reaching out. We will get back to you within 2 business days.",
    )
  })
})

// ─── Route integration tests ─────────────────────────────────────────────────

describe("POST /contact", () => {
  beforeEach(() => {
    mockContactSubmissionCreate.mockClear()
    mockContactSubmissionCreate.mockImplementation(() =>
      Promise.resolve(mockDbSubmission),
    )
  })

  test("returns 200 with success message on valid request", async () => {
    const res = await app.request("/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "1.2.3.4",
      },
      body: JSON.stringify({
        name: "Test User",
        email: "test@example.com",
        subject: "Support",
        message: "I need help with the software.",
      }),
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      success: boolean
      data: { message: string }
    }
    expect(json.success).toBe(true)
    expect(json.data.message).toBe(
      "Thank you for reaching out. We will get back to you within 2 business days.",
    )
  })

  test("returns 400 on missing required fields", async () => {
    const res = await app.request("/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    })

    expect(res.status).toBe(400)
    const json = (await res.json()) as {
      success: boolean
      error: { code: string }
    }
    expect(json.success).toBe(false)
    expect(json.error.code).toBe("VALIDATION_ERROR")
  })

  test("returns 400 on invalid email", async () => {
    const res = await app.request("/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test User",
        email: "not-valid",
        subject: "Support",
        message: "Help me.",
      }),
    })

    expect(res.status).toBe(400)
    const json = (await res.json()) as {
      success: boolean
      error: { code: string }
    }
    expect(json.success).toBe(false)
    expect(json.error.code).toBe("VALIDATION_ERROR")
  })

  test("extracts IP from x-forwarded-for header", async () => {
    await app.request("/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "203.0.113.50, 70.41.3.18",
      },
      body: JSON.stringify({
        name: "Test User",
        email: "test@example.com",
        subject: "Support",
        message: "I need help.",
      }),
    })

    expect(mockContactSubmissionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ipAddress: "203.0.113.50",
        }),
      }),
    )
  })

  test("uses 'unknown' when x-forwarded-for is absent", async () => {
    await app.request("/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test User",
        email: "test@example.com",
        subject: "Support",
        message: "I need help.",
      }),
    })

    expect(mockContactSubmissionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ipAddress: "unknown",
        }),
      }),
    )
  })
})
```

- [ ] **2.4** Mount the contact routes in `apps/mvp_api/src/app.ts`.

Add the import at the top alongside the existing downloads import:

```typescript
import { contactRoutes } from "./modules/contact/contact.routes.js"
```

Add the route mounting after the existing `app.route("/", downloadsRoutes)` line:

```typescript
app.route("/", contactRoutes)
```

The full routes section of `app.ts` should read:

```typescript
// ─── Routes ────────────────────────────────────────────────────────────────────

app.route("/", downloadsRoutes)
app.route("/", contactRoutes)
```

- [ ] **2.5** Run the API tests to verify:

```bash
cd apps/mvp_api && bun test
```

All tests in `contact.test.ts` and `downloads.test.ts` must pass.

---

## Task 3: Wire frontend contact form to real API

**Files:**
- `apps/mvp_web/components/contact-form.tsx` (modify)
- `apps/mvp_web/components/contact-form.test.tsx` (modify)

### Steps

- [ ] **3.1** Replace `apps/mvp_web/components/contact-form.tsx` with the real API call implementation:

```tsx
"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@renewable-energy/ui/components/button"
import { Input } from "@renewable-energy/ui/components/input"
import { Textarea } from "@renewable-energy/ui/components/textarea"
import { Label } from "@renewable-energy/ui/components/label"

const API_URL =
  process.env.NEXT_PUBLIC_MVP_API_URL ?? "http://localhost:3003"

export function ContactForm() {
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (
      !fullName.trim() ||
      !email.trim() ||
      !subject.trim() ||
      !message.trim()
    ) {
      toast.error("Please fill in all required fields.")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`${API_URL}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fullName.trim(),
          email: email.trim(),
          subject: subject.trim(),
          message: message.trim(),
        }),
      })

      const json = await res.json()

      if (!res.ok || !json.success) {
        const errorMessage =
          json.error?.message ?? "Failed to send message. Please try again."
        toast.error(errorMessage)
        return
      }

      toast.success(
        "Thank you for reaching out. We will get back to you within 2 business days.",
      )
      setFullName("")
      setEmail("")
      setSubject("")
      setMessage("")
    } catch {
      toast.error("Failed to send message. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="contact-name">
          Full Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="contact-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Enter your full name"
          required
          disabled={submitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-email">
          Email Address <span className="text-destructive">*</span>
        </Label>
        <Input
          id="contact-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          required
          disabled={submitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-subject">
          Subject <span className="text-destructive">*</span>
        </Label>
        <Input
          id="contact-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="What is this regarding?"
          required
          disabled={submitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-message">
          Message <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us more..."
          rows={5}
          required
          disabled={submitting}
        />
      </div>

      <Button
        type="submit"
        disabled={submitting}
        className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
      >
        {submitting ? "Sending\u2026" : "Send Message"}
      </Button>
    </form>
  )
}
```

- [ ] **3.2** Replace `apps/mvp_web/components/contact-form.test.tsx` with updated tests:

```tsx
import { test, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

import { ContactForm } from "./contact-form"
import { toast } from "sonner"

beforeEach(() => {
  vi.restoreAllMocks()
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
})

test("renders all form fields", () => {
  render(<ContactForm />)
  expect(
    screen.getAllByPlaceholderText("Enter your full name").length,
  ).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByPlaceholderText("you@company.com").length,
  ).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByPlaceholderText("What is this regarding?").length,
  ).toBeGreaterThanOrEqual(1)
  expect(
    screen.getAllByPlaceholderText("Tell us more...").length,
  ).toBeGreaterThanOrEqual(1)
})

test("renders Send Message button", () => {
  render(<ContactForm />)
  const buttons = screen.getAllByRole("button", {
    name: /Send Message/i,
  })
  expect(buttons.length).toBeGreaterThanOrEqual(1)
})

test("shows success toast on valid submit", async () => {
  const user = userEvent.setup()

  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        data: {
          message:
            "Thank you for reaching out. We will get back to you within 2 business days.",
        },
      }),
  })
  vi.stubGlobal("fetch", mockFetch)

  render(<ContactForm />)

  await user.type(
    screen.getAllByPlaceholderText("Enter your full name")[0]!,
    "Test User",
  )
  await user.type(
    screen.getAllByPlaceholderText("you@company.com")[0]!,
    "test@example.com",
  )
  await user.type(
    screen.getAllByPlaceholderText("What is this regarding?")[0]!,
    "Support",
  )
  await user.type(
    screen.getAllByPlaceholderText("Tell us more...")[0]!,
    "I need help with the software.",
  )

  const buttons = screen.getAllByRole("button", {
    name: /Send Message/i,
  })
  await user.click(buttons[0]!)

  await waitFor(() => {
    expect(toast.success).toHaveBeenCalledWith(
      "Thank you for reaching out. We will get back to you within 2 business days.",
    )
  })
})

test("shows error toast on API failure", async () => {
  const user = userEvent.setup()

  const mockFetch = vi.fn().mockResolvedValue({
    ok: false,
    json: () =>
      Promise.resolve({
        success: false,
        error: { message: "Validation failed" },
      }),
  })
  vi.stubGlobal("fetch", mockFetch)

  render(<ContactForm />)

  await user.type(
    screen.getAllByPlaceholderText("Enter your full name")[0]!,
    "Test User",
  )
  await user.type(
    screen.getAllByPlaceholderText("you@company.com")[0]!,
    "test@example.com",
  )
  await user.type(
    screen.getAllByPlaceholderText("What is this regarding?")[0]!,
    "Support",
  )
  await user.type(
    screen.getAllByPlaceholderText("Tell us more...")[0]!,
    "I need help.",
  )

  const buttons = screen.getAllByRole("button", {
    name: /Send Message/i,
  })
  await user.click(buttons[0]!)

  await waitFor(() => {
    expect(toast.error).toHaveBeenCalledWith("Validation failed")
  })
})

test("shows error toast on network failure", async () => {
  const user = userEvent.setup()

  const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"))
  vi.stubGlobal("fetch", mockFetch)

  render(<ContactForm />)

  await user.type(
    screen.getAllByPlaceholderText("Enter your full name")[0]!,
    "Test User",
  )
  await user.type(
    screen.getAllByPlaceholderText("you@company.com")[0]!,
    "test@example.com",
  )
  await user.type(
    screen.getAllByPlaceholderText("What is this regarding?")[0]!,
    "Support",
  )
  await user.type(
    screen.getAllByPlaceholderText("Tell us more...")[0]!,
    "I need help.",
  )

  const buttons = screen.getAllByRole("button", {
    name: /Send Message/i,
  })
  await user.click(buttons[0]!)

  await waitFor(() => {
    expect(toast.error).toHaveBeenCalledWith(
      "Failed to send message. Please try again.",
    )
  })
})

test("clears form fields after successful submit", async () => {
  const user = userEvent.setup()

  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        data: { message: "Thank you." },
      }),
  })
  vi.stubGlobal("fetch", mockFetch)

  render(<ContactForm />)

  const nameInput = screen.getAllByPlaceholderText(
    "Enter your full name",
  )[0]! as HTMLInputElement
  const emailInput = screen.getAllByPlaceholderText(
    "you@company.com",
  )[0]! as HTMLInputElement
  const subjectInput = screen.getAllByPlaceholderText(
    "What is this regarding?",
  )[0]! as HTMLInputElement
  const messageInput = screen.getAllByPlaceholderText(
    "Tell us more...",
  )[0]! as HTMLTextAreaElement

  await user.type(nameInput, "Test User")
  await user.type(emailInput, "test@example.com")
  await user.type(subjectInput, "Support")
  await user.type(messageInput, "I need help.")

  const buttons = screen.getAllByRole("button", {
    name: /Send Message/i,
  })
  await user.click(buttons[0]!)

  await waitFor(() => {
    expect(nameInput.value).toBe("")
    expect(emailInput.value).toBe("")
    expect(subjectInput.value).toBe("")
    expect(messageInput.value).toBe("")
  })
})

test("sends correct payload to API", async () => {
  const user = userEvent.setup()

  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        data: { message: "Thank you." },
      }),
  })
  vi.stubGlobal("fetch", mockFetch)

  render(<ContactForm />)

  await user.type(
    screen.getAllByPlaceholderText("Enter your full name")[0]!,
    "Test User",
  )
  await user.type(
    screen.getAllByPlaceholderText("you@company.com")[0]!,
    "test@example.com",
  )
  await user.type(
    screen.getAllByPlaceholderText("What is this regarding?")[0]!,
    "Support",
  )
  await user.type(
    screen.getAllByPlaceholderText("Tell us more...")[0]!,
    "I need help with the software.",
  )

  const buttons = screen.getAllByRole("button", {
    name: /Send Message/i,
  })
  await user.click(buttons[0]!)

  await waitFor(() => {
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/contact"),
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test User",
          email: "test@example.com",
          subject: "Support",
          message: "I need help with the software.",
        }),
      }),
    )
  })
})
```

- [ ] **3.3** Run the frontend tests to verify:

```bash
cd apps/mvp_web && bunx vitest run
```

All contact form tests must pass.

---

## Task 4: Full gate + prod migration

### Steps

- [ ] **4.1** Run the full pre-commit gate from repo root:

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

All four must pass with zero errors.

- [ ] **4.2** Commit all changes:

```bash
git add -A && git commit -m "feat: add contact form endpoint and wire frontend to real API"
```

- [ ] **4.3** After merge to main and production deployment, run the production migration:

```bash
cd packages/mvp_db && DATABASE_URL="<prod-connection-string>" bunx prisma migrate deploy
```

- [ ] **4.4** Verify the production endpoint responds correctly:

```bash
curl -X POST https://<MVP_API_PROD_URL>/contact \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@example.com","subject":"Test","message":"Hello"}'
```

Expected response:

```json
{
  "success": true,
  "data": {
    "message": "Thank you for reaching out. We will get back to you within 2 business days."
  }
}
```
