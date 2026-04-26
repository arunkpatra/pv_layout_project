import { describe, test, expect, mock, beforeEach } from "bun:test"

// ─── Mock db ──────────────────────────────────────────────────────────────────

const now = new Date("2026-04-22T00:00:00.000Z")

const mockDbRegistration = {
  id: "drg_testRegistration0000000000000000000",
  name: "Test User",
  email: "test@example.com",
  mobile: null,
  product: "PV Layout Basic",
  ipAddress: "1.2.3.4",
  createdAt: now,
}

const mockDownloadRegistrationCreate = mock(() =>
  Promise.resolve(mockDbRegistration),
)

mock.module("../../lib/db.js", () => ({
  db: {
    downloadRegistration: {
      create: mockDownloadRegistrationCreate,
    },
  },
}))

// ─── Mock S3 ──────────────────────────────────────────────────────────────────

const mockGetPresignedDownloadUrl = mock(() =>
  Promise.resolve(
    "https://s3.amazonaws.com/test-bucket/downloads/pv-layout-basic.exe?signed",
  ),
)

mock.module("../../lib/s3.js", () => ({
  getPresignedDownloadUrl: mockGetPresignedDownloadUrl,
}))

// ─── Import after mocks ──────────────────────────────────────────────────────

import {
  registerDownload,
  DownloadRegisterSchema,
} from "./downloads.service.js"
import { app } from "../../app.js"

// ─── Schema validation tests ─────────────────────────────────────────────────

describe("DownloadRegisterSchema", () => {
  test("accepts valid input with all fields", () => {
    const result = DownloadRegisterSchema.safeParse({
      name: "Test User",
      email: "test@example.com",
      mobile: "+91 98765 43210",
      product: "PV Layout Basic",
    })
    expect(result.success).toBe(true)
  })

  test("accepts valid input without optional mobile", () => {
    const result = DownloadRegisterSchema.safeParse({
      name: "Test User",
      email: "test@example.com",
      product: "PV Layout Pro",
    })
    expect(result.success).toBe(true)
  })

  test("rejects missing name", () => {
    const result = DownloadRegisterSchema.safeParse({
      email: "test@example.com",
      product: "PV Layout Basic",
    })
    expect(result.success).toBe(false)
  })

  test("rejects empty name", () => {
    const result = DownloadRegisterSchema.safeParse({
      name: "",
      email: "test@example.com",
      product: "PV Layout Basic",
    })
    expect(result.success).toBe(false)
  })

  test("rejects invalid email", () => {
    const result = DownloadRegisterSchema.safeParse({
      name: "Test User",
      email: "not-an-email",
      product: "PV Layout Basic",
    })
    expect(result.success).toBe(false)
  })

  test("rejects invalid product name", () => {
    const result = DownloadRegisterSchema.safeParse({
      name: "Test User",
      email: "test@example.com",
      product: "Invalid Product",
    })
    expect(result.success).toBe(false)
  })

  test("accepts all valid product names", () => {
    const products = [
      "PV Layout",
      "PV Layout Basic",
      "PV Layout Pro",
      "PV Layout Pro Plus",
    ]
    for (const product of products) {
      const result = DownloadRegisterSchema.safeParse({
        name: "Test User",
        email: "test@example.com",
        product,
      })
      expect(result.success).toBe(true)
    }
  })
})

// ─── Service tests ───────────────────────────────────────────────────────────

describe("registerDownload", () => {
  beforeEach(() => {
    mockDownloadRegistrationCreate.mockClear()
    mockGetPresignedDownloadUrl.mockClear()
  })

  test("creates registration row and returns presigned URL", async () => {
    const result = await registerDownload(
      {
        name: "Test User",
        email: "test@example.com",
        product: "PV Layout Basic",
      },
      "1.2.3.4",
    )

    expect(mockDownloadRegistrationCreate).toHaveBeenCalledWith({
      data: {
        name: "Test User",
        email: "test@example.com",
        mobile: null,
        product: "PV Layout Basic",
        ipAddress: "1.2.3.4",
      },
    })
    expect(result.downloadUrl).toContain("s3.amazonaws.com")
  })

  test("passes correct S3 key for PV Layout Pro", async () => {
    await registerDownload(
      {
        name: "Test User",
        email: "test@example.com",
        product: "PV Layout Pro",
      },
      "5.6.7.8",
    )

    expect(mockGetPresignedDownloadUrl).toHaveBeenCalledWith(
      "downloads/pv_layout.exe",
      "pv_layout.exe",
      3600,
    )
  })

  test("passes correct S3 key for PV Layout Pro Plus", async () => {
    await registerDownload(
      {
        name: "Test User",
        email: "test@example.com",
        product: "PV Layout Pro Plus",
      },
      "9.10.11.12",
    )

    expect(mockGetPresignedDownloadUrl).toHaveBeenCalledWith(
      "downloads/pv_layout.exe",
      "pv_layout.exe",
      3600,
    )
  })

  test("stores optional mobile when provided", async () => {
    await registerDownload(
      {
        name: "Test User",
        email: "test@example.com",
        mobile: "+91 98765 43210",
        product: "PV Layout Basic",
      },
      "1.2.3.4",
    )

    expect(mockDownloadRegistrationCreate).toHaveBeenCalledWith({
      data: {
        name: "Test User",
        email: "test@example.com",
        mobile: "+91 98765 43210",
        product: "PV Layout Basic",
        ipAddress: "1.2.3.4",
      },
    })
  })

  test("throws when S3 returns null URL", async () => {
    mockGetPresignedDownloadUrl.mockResolvedValueOnce(null as unknown as string)

    await expect(
      registerDownload(
        {
          name: "Test User",
          email: "test@example.com",
          product: "PV Layout Basic",
        },
        "1.2.3.4",
      ),
    ).rejects.toThrow("S3 download URL generation failed")
  })
})

// ─── Route integration tests ─────────────────────────────────────────────────

describe("POST /download-register", () => {
  beforeEach(() => {
    mockDownloadRegistrationCreate.mockClear()
    mockGetPresignedDownloadUrl.mockClear()
    mockDownloadRegistrationCreate.mockImplementation(() =>
      Promise.resolve(mockDbRegistration),
    )
    mockGetPresignedDownloadUrl.mockImplementation(() =>
      Promise.resolve(
        "https://s3.amazonaws.com/test-bucket/downloads/pv-layout-basic.exe?signed",
      ),
    )
  })

  test("returns 200 with downloadUrl on valid request", async () => {
    const res = await app.request("/download-register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "1.2.3.4",
      },
      body: JSON.stringify({
        name: "Test User",
        email: "test@example.com",
        product: "PV Layout Basic",
      }),
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as { success: boolean; data: { downloadUrl: string } }
    expect(json.success).toBe(true)
    expect(json.data.downloadUrl).toContain("s3.amazonaws.com")
  })

  test("returns 400 on missing required fields", async () => {
    const res = await app.request("/download-register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    })

    expect(res.status).toBe(400)
    const json = (await res.json()) as { success: boolean; error: { code: string } }
    expect(json.success).toBe(false)
    expect(json.error.code).toBe("VALIDATION_ERROR")
  })

  test("returns 400 on invalid product name", async () => {
    const res = await app.request("/download-register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test User",
        email: "test@example.com",
        product: "Nonexistent Product",
      }),
    })

    expect(res.status).toBe(400)
    const json = (await res.json()) as { success: boolean; error: { code: string } }
    expect(json.success).toBe(false)
    expect(json.error.code).toBe("VALIDATION_ERROR")
  })

  test("extracts IP from x-forwarded-for header", async () => {
    await app.request("/download-register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "203.0.113.50, 70.41.3.18",
      },
      body: JSON.stringify({
        name: "Test User",
        email: "test@example.com",
        product: "PV Layout Basic",
      }),
    })

    expect(mockDownloadRegistrationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ipAddress: "203.0.113.50",
        }),
      }),
    )
  })

  test("uses 'unknown' when x-forwarded-for is absent", async () => {
    await app.request("/download-register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test User",
        email: "test@example.com",
        product: "PV Layout Basic",
      }),
    })

    expect(mockDownloadRegistrationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ipAddress: "unknown",
        }),
      }),
    )
  })
})
