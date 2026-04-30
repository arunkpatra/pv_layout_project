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
