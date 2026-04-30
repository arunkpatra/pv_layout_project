import { describe, expect, it, mock, beforeEach } from "bun:test"
import { createManualTransaction, listTransactions, getTransaction } from "./transactions.service.js"

// mockTx — the object the real helper (createEntitlementAndTransaction) will use.
// db.$transaction passes this to the callback so the helper runs for real.
const mockTxTransactionCreate = mock(async () => ({ id: "txn_new" }))
const mockTxEntitlementCreate = mock(async () => ({ id: "ent_new" }))
const mockTxLicenseKeyFindFirst = mock(async () => null)
const mockTxLicenseKeyCreate = mock(async () => ({}))

const mockTx = {
  transaction: { create: mockTxTransactionCreate },
  entitlement: { create: mockTxEntitlementCreate },
  licenseKey: {
    findFirst: mockTxLicenseKeyFindFirst,
    create: mockTxLicenseKeyCreate,
  },
}

const dbMock = {
  user: { findUnique: mock(async () => null as unknown) },
  product: { findUnique: mock(async () => null as unknown) },
  $transaction: mock(async (cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
}
mock.module("../../lib/db.js", () => ({ db: dbMock }))

beforeEach(() => {
  dbMock.user.findUnique.mockReset()
  dbMock.product.findUnique.mockReset()
  dbMock.$transaction.mockReset().mockImplementation(async (cb) => cb(mockTx))
  mockTxTransactionCreate.mockReset().mockImplementation(async () => ({ id: "txn_new" }))
  mockTxEntitlementCreate.mockReset().mockImplementation(async () => ({ id: "ent_new" }))
  mockTxLicenseKeyFindFirst.mockReset().mockImplementation(async () => null)
  mockTxLicenseKeyCreate.mockReset().mockImplementation(async () => ({}))
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
      projectQuota: 10,
    })

    const result = await createManualTransaction({
      userId: "usr_alice",
      productSlug: "pv-layout-pro",
      paymentMethod: "UPI",
      externalReference: "UPI-8472",
      notes: "Mumbai meetup",
      createdByUserId: "usr_admin",
    })

    expect(mockTxTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "usr_alice",
          productId: "prod_pro",
          amount: 499,
          source: "MANUAL",
          paymentMethod: "UPI",
          externalReference: "UPI-8472",
          notes: "Mumbai meetup",
          createdByUserId: "usr_admin",
        }),
      }),
    )
    expect(mockTxEntitlementCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          transactionId: "txn_new",
          totalCalculations: 10,
          projectQuota: 10,
        }),
      }),
    )
    expect(result).toEqual({ transactionId: "txn_new", entitlementId: "ent_new" })
  })

  it("rejects with 404 when user does not exist", async () => {
    dbMock.user.findUnique.mockResolvedValueOnce(null)

    const promise = createManualTransaction({
      userId: "usr_missing",
      productSlug: "pv-layout-pro",
      paymentMethod: "CASH",
      createdByUserId: "usr_admin",
    })
    await expect(promise).rejects.toMatchObject({ code: "NOT_FOUND", statusCode: 404 })
  })

  it("rejects with 400 when product does not exist", async () => {
    dbMock.user.findUnique.mockResolvedValueOnce({ id: "usr_alice", email: "alice@example.com" })
    dbMock.product.findUnique.mockResolvedValueOnce(null)

    const promise = createManualTransaction({
      userId: "usr_alice",
      productSlug: "missing",
      paymentMethod: "CASH",
      createdByUserId: "usr_admin",
    })
    await expect(promise).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 })
  })

  it("rejects with 400 when product is inactive", async () => {
    dbMock.user.findUnique.mockResolvedValueOnce({ id: "usr_alice", email: "alice@example.com" })
    dbMock.product.findUnique.mockResolvedValueOnce({
      id: "prod_pro", slug: "pv-layout-pro", isFree: false, active: false,
      priceAmount: 499, calculations: 10, projectQuota: 10,
    })

    const promise = createManualTransaction({
      userId: "usr_alice", productSlug: "pv-layout-pro",
      paymentMethod: "CASH", createdByUserId: "usr_admin",
    })
    await expect(promise).rejects.toMatchObject({ code: "VALIDATION_ERROR", statusCode: 400 })
  })

  it("rejects with 400 (FREE_PRODUCT_NOT_PURCHASABLE) when product is free", async () => {
    dbMock.user.findUnique.mockResolvedValueOnce({ id: "usr_alice", email: "alice@example.com" })
    dbMock.product.findUnique.mockResolvedValueOnce({
      id: "prod_free", slug: "pv-layout-free", isFree: true, active: true,
      priceAmount: 0, calculations: 5, projectQuota: 3,
    })

    const promise = createManualTransaction({
      userId: "usr_alice", productSlug: "pv-layout-free",
      paymentMethod: "CASH", createdByUserId: "usr_admin",
    })
    await expect(promise).rejects.toMatchObject({
      code: "FREE_PRODUCT_NOT_PURCHASABLE",
      statusCode: 400,
    })
  })

  it("snapshots the amount from product.priceAmount", async () => {
    dbMock.user.findUnique.mockResolvedValueOnce({ id: "usr_a", email: "a@b.com" })
    dbMock.product.findUnique.mockResolvedValueOnce({
      id: "prod_pp", slug: "pv-layout-pro-plus", isFree: false, active: true,
      priceAmount: 1499, calculations: 50, projectQuota: 15,
    })

    await createManualTransaction({
      userId: "usr_a", productSlug: "pv-layout-pro-plus",
      paymentMethod: "BANK_TRANSFER", createdByUserId: "usr_admin",
    })

    expect(mockTxTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amount: 1499 }),
      }),
    )
    expect(mockTxEntitlementCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          totalCalculations: 50,
          projectQuota: 15,
        }),
      }),
    )
  })

  it("forwards purchasedAt when provided", async () => {
    dbMock.user.findUnique.mockResolvedValueOnce({ id: "usr_a", email: "a@b.com" })
    dbMock.product.findUnique.mockResolvedValueOnce({
      id: "prod_pro", slug: "pv-layout-pro", isFree: false, active: true,
      priceAmount: 499, calculations: 10, projectQuota: 10,
    })
    const past = new Date("2026-04-20T12:00:00Z")

    await createManualTransaction({
      userId: "usr_a", productSlug: "pv-layout-pro",
      paymentMethod: "CASH", createdByUserId: "usr_admin",
      purchasedAt: past,
    })

    expect(mockTxTransactionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ purchasedAt: past }),
      }),
    )
  })
})

describe("listTransactions", () => {
  it("returns paginated, filtered, sorted by purchasedAt desc", async () => {
    const findManyMock = mock(async () => [
      {
        id: "txn_1",
        userId: "usr_a",
        productId: "prod_pro",
        source: "STRIPE",
        status: "COMPLETED",
        amount: 499,
        currency: "usd",
        purchasedAt: new Date("2026-04-25T10:00:00Z"),
        createdAt: new Date(),
        paymentMethod: null,
        externalReference: null,
        notes: null,
        createdByUserId: null,
        checkoutSessionId: "cs_1",
        user: { email: "alice@example.com", name: "Alice" },
        product: { slug: "pv-layout-pro", name: "Pro" },
        createdByUser: null,
      },
    ])
    const countMock = mock(async () => 1)
    ;(dbMock as any).transaction = { findMany: findManyMock, count: countMock }

    const result = await listTransactions({ source: "ALL", page: 1, pageSize: 20 })

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { purchasedAt: "desc" },
        take: 20,
        skip: 0,
      }),
    )
    expect(result.transactions[0]).toMatchObject({
      id: "txn_1",
      source: "STRIPE",
      userEmail: "alice@example.com",
      productSlug: "pv-layout-pro",
    })
    expect(result.pagination).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 })
  })

  it("filters by source when source != ALL", async () => {
    const findManyMock = mock(async () => [])
    const countMock = mock(async () => 0)
    ;(dbMock as any).transaction = { findMany: findManyMock, count: countMock }

    await listTransactions({ source: "MANUAL", page: 1, pageSize: 20 })

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ source: "MANUAL" }),
      }),
    )
  })

  it("filters by email substring (insensitive) and date range", async () => {
    const findManyMock = mock(async () => [])
    const countMock = mock(async () => 0)
    ;(dbMock as any).transaction = { findMany: findManyMock, count: countMock }

    await listTransactions({
      source: "ALL",
      email: "alice",
      from: "2026-04-01T00:00:00Z",
      to: "2026-04-30T23:59:59Z",
      page: 1,
      pageSize: 20,
    })

    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          user: { email: { contains: "alice", mode: "insensitive" } },
          purchasedAt: {
            gte: new Date("2026-04-01T00:00:00Z"),
            lte: new Date("2026-04-30T23:59:59Z"),
          },
        }),
      }),
    )
  })
})

describe("getTransaction", () => {
  it("returns the transaction with user/product/createdBy joined", async () => {
    const findUniqueMock = mock(async () => ({
      id: "txn_1",
      userId: "usr_a",
      productId: "prod_pro",
      source: "MANUAL",
      status: "COMPLETED",
      amount: 499,
      currency: "usd",
      purchasedAt: new Date("2026-04-25T10:00:00Z"),
      createdAt: new Date(),
      paymentMethod: "UPI",
      externalReference: "UPI-1",
      notes: "n",
      createdByUserId: "usr_admin",
      checkoutSessionId: null,
      user: { email: "alice@example.com", name: "Alice" },
      product: { slug: "pv-layout-pro", name: "Pro" },
      createdByUser: { email: "admin@example.com" },
    }))
    ;(dbMock as any).transaction = { findUnique: findUniqueMock }

    const result = await getTransaction("txn_1")
    expect(result).toMatchObject({
      id: "txn_1",
      source: "MANUAL",
      paymentMethod: "UPI",
      createdByEmail: "admin@example.com",
    })
  })

  it("throws 404 when not found", async () => {
    ;(dbMock as { transaction?: unknown }).transaction = {
      findUnique: mock(async () => null),
    }
    const promise: Promise<unknown> = getTransaction("missing")
    // Bun's expect().rejects.toMatchObject() is typed as void in this position;
    // the await is functionally required for the matcher to settle.
    // eslint-disable-next-line @typescript-eslint/await-thenable
    await expect(promise).rejects.toMatchObject({ statusCode: 404 })
  })
})
