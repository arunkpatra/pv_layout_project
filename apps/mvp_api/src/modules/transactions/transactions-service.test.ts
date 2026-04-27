import { describe, expect, it, mock, beforeEach } from "bun:test"
import { createManualTransaction } from "./transactions.service.js"

// Mock createEntitlementAndTransaction so we can isolate transactions.service logic
const createEntitlementAndTransactionMock = mock(async () => ({
  transactionId: "txn_new",
  entitlementId: "ent_new",
}))
mock.module("../billing/create-entitlement-and-transaction.js", () => ({
  createEntitlementAndTransaction: createEntitlementAndTransactionMock,
}))

const dbMock = {
  user: { findUnique: mock(async () => null as unknown) },
  product: { findUnique: mock(async () => null as unknown) },
  $transaction: mock(async (cb: (tx: unknown) => Promise<unknown>) => cb({} as unknown)),
}
mock.module("../../lib/db.js", () => ({ db: dbMock }))

beforeEach(() => {
  createEntitlementAndTransactionMock.mockClear()
  dbMock.user.findUnique.mockReset()
  dbMock.product.findUnique.mockReset()
  dbMock.$transaction.mockReset().mockImplementation(async (cb) => cb({} as unknown))
})

describe("createManualTransaction", () => {
  it("creates a Transaction + Entitlement for a valid manual purchase", async () => {
    dbMock.user.findUnique.mockResolvedValueOnce({ id: "usr_alice", email: "alice@example.com" })
    dbMock.product.findUnique.mockResolvedValueOnce({
      id: "prod_pro",
      slug: "pv-layout-pro",
      isFree: false,
      active: true,
      priceAmount: 499,
      calculations: 10,
    })

    const result = await createManualTransaction({
      userId: "usr_alice",
      productSlug: "pv-layout-pro",
      paymentMethod: "UPI",
      externalReference: "UPI-8472",
      notes: "Mumbai meetup",
      createdByUserId: "usr_admin",
    })

    expect(createEntitlementAndTransactionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "usr_alice",
        productId: "prod_pro",
        amount: 499,
        source: "MANUAL",
        paymentMethod: "UPI",
        externalReference: "UPI-8472",
        notes: "Mumbai meetup",
        createdByUserId: "usr_admin",
        totalCalculations: 10,
      }),
    )
    expect(result).toEqual({ transactionId: "txn_new", entitlementId: "ent_new" })
  })

  it("rejects with 404 when user does not exist", async () => {
    dbMock.user.findUnique.mockResolvedValueOnce(null)

    await expect(
      createManualTransaction({
        userId: "usr_missing",
        productSlug: "pv-layout-pro",
        paymentMethod: "CASH",
        createdByUserId: "usr_admin",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", statusCode: 404 })
  })

  it("rejects with 400 when product does not exist", async () => {
    dbMock.user.findUnique.mockResolvedValueOnce({ id: "usr_alice", email: "alice@example.com" })
    dbMock.product.findUnique.mockResolvedValueOnce(null)

    await expect(
      createManualTransaction({
        userId: "usr_alice",
        productSlug: "missing",
        paymentMethod: "CASH",
        createdByUserId: "usr_admin",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 })
  })

  it("rejects with 400 when product is inactive", async () => {
    dbMock.user.findUnique.mockResolvedValueOnce({ id: "usr_alice", email: "alice@example.com" })
    dbMock.product.findUnique.mockResolvedValueOnce({
      id: "prod_pro", slug: "pv-layout-pro", isFree: false, active: false,
      priceAmount: 499, calculations: 10,
    })

    await expect(
      createManualTransaction({
        userId: "usr_alice", productSlug: "pv-layout-pro",
        paymentMethod: "CASH", createdByUserId: "usr_admin",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 })
  })

  it("rejects with 400 (FREE_PRODUCT_NOT_PURCHASABLE) when product is free", async () => {
    dbMock.user.findUnique.mockResolvedValueOnce({ id: "usr_alice", email: "alice@example.com" })
    dbMock.product.findUnique.mockResolvedValueOnce({
      id: "prod_free", slug: "pv-layout-free", isFree: true, active: true,
      priceAmount: 0, calculations: 5,
    })

    await expect(
      createManualTransaction({
        userId: "usr_alice", productSlug: "pv-layout-free",
        paymentMethod: "CASH", createdByUserId: "usr_admin",
      }),
    ).rejects.toMatchObject({
      code: "FREE_PRODUCT_NOT_PURCHASABLE",
      statusCode: 400,
    })
  })

  it("snapshots the amount from product.priceAmount", async () => {
    dbMock.user.findUnique.mockResolvedValueOnce({ id: "usr_a", email: "a@b.com" })
    dbMock.product.findUnique.mockResolvedValueOnce({
      id: "prod_pp", slug: "pv-layout-pro-plus", isFree: false, active: true,
      priceAmount: 1499, calculations: 50,
    })

    await createManualTransaction({
      userId: "usr_a", productSlug: "pv-layout-pro-plus",
      paymentMethod: "BANK_TRANSFER", createdByUserId: "usr_admin",
    })

    expect(createEntitlementAndTransactionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amount: 1499, totalCalculations: 50 }),
    )
  })

  it("forwards purchasedAt when provided", async () => {
    dbMock.user.findUnique.mockResolvedValueOnce({ id: "usr_a", email: "a@b.com" })
    dbMock.product.findUnique.mockResolvedValueOnce({
      id: "prod_pro", slug: "pv-layout-pro", isFree: false, active: true,
      priceAmount: 499, calculations: 10,
    })
    const past = new Date("2026-04-20T12:00:00Z")

    await createManualTransaction({
      userId: "usr_a", productSlug: "pv-layout-pro",
      paymentMethod: "CASH", createdByUserId: "usr_admin",
      purchasedAt: past,
    })

    expect(createEntitlementAndTransactionMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ purchasedAt: past }),
    )
  })
})
