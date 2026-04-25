import { describe, it, expect, mock, beforeEach } from "bun:test"

const mockCheckoutSessionFindUnique = mock(async () => ({
  id: "cs1",
  stripeCheckoutSessionId: "cs_test_123",
  userId: "usr1",
  productSlug: "pv-layout-pro",
  processedAt: null,
  user: { id: "usr1", email: "test@example.com" },
}))
const mockProductFindUnique = mock(async () => ({
  id: "prod1",
  slug: "pv-layout-pro",
  calculations: 100,
}))
const mockLicenseKeyFindFirst = mock(async () => null)
const mockTxEntitlementCreate = mock(async () => ({}))
const mockTxLicenseKeyCreate = mock(async () => ({}))
const mockTxCheckoutSessionUpdate = mock(async () => ({}))

const mockTx = {
  entitlement: { create: mockTxEntitlementCreate },
  licenseKey: { create: mockTxLicenseKeyCreate },
  checkoutSession: { update: mockTxCheckoutSessionUpdate },
}

mock.module("../../lib/db.js", () => ({
  db: {
    checkoutSession: { findUnique: mockCheckoutSessionFindUnique },
    product: { findUnique: mockProductFindUnique },
    licenseKey: { findFirst: mockLicenseKeyFindFirst },
    $transaction: async (fn: (tx: typeof mockTx) => Promise<void>) => fn(mockTx),
  },
}))

const { provisionEntitlement } = await import("./provision.js")

describe("provisionEntitlement", () => {
  beforeEach(() => {
    mockCheckoutSessionFindUnique.mockImplementation(async () => ({
      id: "cs1",
      stripeCheckoutSessionId: "cs_test_123",
      userId: "usr1",
      productSlug: "pv-layout-pro",
      processedAt: null,
      user: { id: "usr1", email: "test@example.com" },
    }))
    mockProductFindUnique.mockImplementation(async () => ({
      id: "prod1",
      slug: "pv-layout-pro",
      calculations: 100,
    }))
    mockLicenseKeyFindFirst.mockImplementation(async () => null)
    mockTxEntitlementCreate.mockReset()
    mockTxLicenseKeyCreate.mockReset()
    mockTxCheckoutSessionUpdate.mockReset()
    mockTxEntitlementCreate.mockImplementation(async () => ({}))
    mockTxLicenseKeyCreate.mockImplementation(async () => ({}))
    mockTxCheckoutSessionUpdate.mockImplementation(async () => ({}))
  })

  it("returns provisioned: true for valid session", async () => {
    const result = await provisionEntitlement("cs_test_123")
    expect(result.provisioned).toBe(true)
    expect(mockTxEntitlementCreate).toHaveBeenCalledTimes(1)
  })

  it("writes amountTotal and currency when purchase arg provided", async () => {
    await provisionEntitlement("cs_test_123", {
      amountTotal: 4999,
      currency: "usd",
    })
    const calls = mockTxCheckoutSessionUpdate.mock.calls as unknown as {
      data: Record<string, unknown>
    }[][]
    expect(calls.length).toBe(1)
    const arg = calls[0]![0]!
    expect(arg.data.amountTotal).toBe(4999)
    expect(arg.data.currency).toBe("usd")
    expect(arg.data.processedAt).toBeInstanceOf(Date)
  })

  it("omits amountTotal from update when no purchase arg", async () => {
    await provisionEntitlement("cs_test_123")
    const calls = mockTxCheckoutSessionUpdate.mock.calls as unknown as {
      data: Record<string, unknown>
    }[][]
    expect(calls.length).toBe(1)
    const arg = calls[0]![0]!
    expect(arg.data.processedAt).toBeInstanceOf(Date)
    expect("amountTotal" in arg.data).toBe(false)
  })

  it("returns provisioned: false for already processed session", async () => {
    mockCheckoutSessionFindUnique.mockImplementation(async () => ({
      id: "cs1",
      stripeCheckoutSessionId: "cs_test_123",
      userId: "usr1",
      productSlug: "pv-layout-pro",
      processedAt: new Date(),
      user: { id: "usr1", email: "test@example.com" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any)
    const result = await provisionEntitlement("cs_test_123")
    expect(result.provisioned).toBe(false)
  })

  it("returns provisioned: false for missing session", async () => {
    mockCheckoutSessionFindUnique.mockImplementation(async () => null as never)
    const result = await provisionEntitlement("nonexistent")
    expect(result.provisioned).toBe(false)
  })
})
