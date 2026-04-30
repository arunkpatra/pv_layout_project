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
  priceAmount: 4999,
  projectQuota: 10,
}))
const mockTxTransactionCreate = mock(async () => ({ id: "txn1" }))
const mockTxEntitlementCreate = mock(async () => ({ id: "ent1" }))
const mockTxLicenseKeyFindFirst = mock(async () => null)
const mockTxLicenseKeyCreate = mock(async () => ({}))
const mockTxCheckoutSessionUpdate = mock(async () => ({}))

const mockTx = {
  transaction: { create: mockTxTransactionCreate },
  entitlement: { create: mockTxEntitlementCreate },
  licenseKey: {
    findFirst: mockTxLicenseKeyFindFirst,
    create: mockTxLicenseKeyCreate,
  },
  checkoutSession: { update: mockTxCheckoutSessionUpdate },
}

mock.module("../../lib/db.js", () => ({
  db: {
    checkoutSession: { findUnique: mockCheckoutSessionFindUnique },
    product: { findUnique: mockProductFindUnique },
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
      priceAmount: 4999,
      projectQuota: 10,
    }))
    mockTxTransactionCreate.mockReset()
    mockTxEntitlementCreate.mockReset()
    mockTxLicenseKeyFindFirst.mockReset()
    mockTxLicenseKeyCreate.mockReset()
    mockTxCheckoutSessionUpdate.mockReset()
    mockTxTransactionCreate.mockImplementation(async () => ({ id: "txn1" }))
    mockTxEntitlementCreate.mockImplementation(async () => ({ id: "ent1" }))
    mockTxLicenseKeyFindFirst.mockImplementation(async () => null)
    mockTxLicenseKeyCreate.mockImplementation(async () => ({}))
    mockTxCheckoutSessionUpdate.mockImplementation(async () => ({}))
  })

  it("returns provisioned: true for valid session", async () => {
    const result = await provisionEntitlement("cs_test_123")
    expect(result.provisioned).toBe(true)
    expect(mockTxTransactionCreate).toHaveBeenCalledTimes(1)
    expect(mockTxTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "usr1",
          productId: "prod1",
          source: "STRIPE",
          amount: 4999,
          currency: "usd",
          checkoutSessionId: "cs1",
          paymentMethod: null,
          createdByUserId: null,
        }),
      }),
    )
    expect(mockTxEntitlementCreate).toHaveBeenCalledTimes(1)
    expect(mockTxEntitlementCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalCalculations: 100,
          projectQuota: 10,
        }),
      }),
    )
  })

  it("uses purchase.amountTotal when purchase arg provided", async () => {
    await provisionEntitlement("cs_test_123", {
      amountTotal: 9999,
      currency: "usd",
    })
    expect(mockTxTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "usr1",
          productId: "prod1",
          source: "STRIPE",
          amount: 9999,
          currency: "usd",
          checkoutSessionId: "cs1",
          paymentMethod: null,
          createdByUserId: null,
        }),
      }),
    )
    const calls = mockTxCheckoutSessionUpdate.mock.calls as unknown as {
      data: Record<string, unknown>
    }[][]
    expect(calls.length).toBe(1)
    const arg = calls[0]![0]!
    expect(arg.data.processedAt).toBeInstanceOf(Date)
    expect("amountTotal" in arg.data).toBe(false)
    expect("currency" in arg.data).toBe(false)
  })

  it("falls back to product.priceAmount when no purchase arg", async () => {
    await provisionEntitlement("cs_test_123")
    expect(mockTxTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 4999,
          source: "STRIPE",
        }),
      }),
    )
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
