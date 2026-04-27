import { describe, it, expect, mock, beforeEach } from "bun:test"

const mockEntitlementFindUnique = mock(async () => ({
  id: "ent1",
  userId: "usr1",
  productId: "prod1",
  totalCalculations: 10,
  usedCalculations: 3,
  deactivatedAt: null,
  purchasedAt: new Date("2026-01-15"),
}))
const mockEntitlementUpdate = mock(async () => ({
  id: "ent1",
  deactivatedAt: new Date(),
}))

// Used by listCustomers to fetch entitlements for active-count computation
const mockEntitlementFindMany = mock(async () => [
  { userId: "usr1", deactivatedAt: null },
  { userId: "usr1", deactivatedAt: new Date() },
])

// Used by listCustomers for per-user spend groupBy
const mockTransactionGroupBy = mock(async () => [
  { userId: "usr1", _sum: { amount: 4999 } },
])

// Used by getCustomer for single-customer aggregate
const mockTransactionAggregate = mock(async () => ({
  _sum: { amount: 4999 },
}))

// Used by listCustomers for usage record counts
const mockUsageRecordGroupBy = mock(async () => [
  { userId: "usr1", _count: { id: 7 } },
])

const mockUserFindMany = mock(async () => [
  {
    id: "usr1",
    email: "alice@example.com",
    name: "Alice",
    roles: [],
    status: "ACTIVE",
    createdAt: new Date("2026-01-01"),
  },
])
const mockUserCount = mock(async () => 1)
const mockUserFindUnique = mock(async () => ({
  id: "usr1",
  email: "alice@example.com",
  name: "Alice",
  roles: [],
  status: "ACTIVE",
  createdAt: new Date("2026-01-01"),
  entitlements: [
    {
      id: "ent1",
      productId: "prod1",
      totalCalculations: 10,
      usedCalculations: 3,
      purchasedAt: new Date("2026-01-15"),
      deactivatedAt: null,
      product: { id: "prod1", name: "Pro", slug: "pv-layout-pro" },
    },
    {
      id: "ent2",
      productId: "prod1",
      totalCalculations: 5,
      usedCalculations: 5,
      purchasedAt: new Date("2026-02-01"),
      deactivatedAt: null,
      product: { id: "prod1", name: "Pro", slug: "pv-layout-pro" },
    },
    {
      id: "ent3",
      productId: "prod1",
      totalCalculations: 10,
      usedCalculations: 0,
      purchasedAt: new Date("2026-03-01"),
      deactivatedAt: new Date("2026-03-10"),
      product: { id: "prod1", name: "Pro", slug: "pv-layout-pro" },
    },
  ],
}))

mock.module("../../lib/db.js", () => ({
  db: {
    user: {
      findMany: mockUserFindMany,
      count: mockUserCount,
      findUnique: mockUserFindUnique,
    },
    entitlement: {
      findUnique: mockEntitlementFindUnique,
      update: mockEntitlementUpdate,
      findMany: mockEntitlementFindMany,
    },
    transaction: {
      groupBy: mockTransactionGroupBy,
      aggregate: mockTransactionAggregate,
    },
    usageRecord: {
      groupBy: mockUsageRecordGroupBy,
    },
  },
}))

const { listCustomers, getCustomer, updateEntitlementStatus } = await import("./customer.service.js")

describe("listCustomers", () => {
  beforeEach(() => {
    mockUserFindMany.mockReset()
    mockUserFindMany.mockImplementation(async () => [
      {
        id: "usr1",
        email: "alice@example.com",
        name: "Alice",
        roles: [],
        status: "ACTIVE",
        createdAt: new Date("2026-01-01"),
      },
    ])
    mockUserCount.mockReset()
    mockUserCount.mockImplementation(async () => 1)
    mockTransactionGroupBy.mockReset()
    mockTransactionGroupBy.mockImplementation(async () => [
      { userId: "usr1", _sum: { amount: 4999 } },
    ])
    mockEntitlementFindMany.mockReset()
    mockEntitlementFindMany.mockImplementation(async () => [
      { userId: "usr1", deactivatedAt: null },
      { userId: "usr1", deactivatedAt: new Date() },
    ])
    mockUsageRecordGroupBy.mockReset()
    mockUsageRecordGroupBy.mockImplementation(async () => [
      { userId: "usr1", _count: { id: 7 } },
    ])
  })

  it("returns paginated list with computed spend and active entitlement count", async () => {
    const result = await listCustomers({ page: 1, pageSize: 20 })
    expect(result.data).toHaveLength(1)
    const customer = result.data[0]!
    expect(customer.id).toBe("usr1")
    expect(customer.totalSpendUsd).toBeCloseTo(49.99)
    expect(customer.activeEntitlementCount).toBe(1)
    expect(customer.totalCalculations).toBe(7)
    expect(result.pagination.total).toBe(1)
  })

  it("totalSpend sums Transaction.amount for STRIPE+MANUAL only (excludes FREE_AUTO)", async () => {
    const aggMock = mock(async () => [
      { userId: "usr_alice", _sum: { amount: 1998 } },
    ])
    mockTransactionGroupBy.mockImplementation(aggMock)
    mockUserFindMany.mockImplementation(async () => [
      {
        id: "usr_alice",
        email: "alice@example.com",
        name: "Alice",
        roles: [],
        status: "ACTIVE",
        createdAt: new Date("2026-01-01"),
      },
    ])
    mockEntitlementFindMany.mockImplementation(async () => [])
    mockUsageRecordGroupBy.mockImplementation(async () => [])

    const result = await listCustomers({ page: 1, pageSize: 20 })
    expect(result.data[0]!.totalSpendUsd).toBeCloseTo(19.98)

    expect(mockTransactionGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        _sum: { amount: true },
        where: expect.objectContaining({
          source: { in: ["STRIPE", "MANUAL"] },
        }),
      }),
    )
  })

  it("treats missing spend entry as zero", async () => {
    mockTransactionGroupBy.mockImplementation(async () => [])
    mockUserFindMany.mockImplementation(async () => [
      {
        id: "usr2",
        email: "bob@example.com",
        name: "Bob",
        roles: [],
        status: "ACTIVE",
        createdAt: new Date("2026-01-01"),
      },
    ])
    mockEntitlementFindMany.mockImplementation(async () => [])
    mockUsageRecordGroupBy.mockImplementation(async () => [])

    const result = await listCustomers({ page: 1, pageSize: 20 })
    expect(result.data[0]!.totalSpendUsd).toBe(0)
  })
})

describe("getCustomer", () => {
  beforeEach(() => {
    mockUserFindUnique.mockReset()
    mockUserFindUnique.mockImplementation(async () => ({
      id: "usr1",
      email: "alice@example.com",
      name: "Alice",
      roles: [],
      status: "ACTIVE",
      createdAt: new Date("2026-01-01"),
      entitlements: [
        {
          id: "ent1",
          productId: "prod1",
          totalCalculations: 10,
          usedCalculations: 3,
          purchasedAt: new Date("2026-01-15"),
          deactivatedAt: null,
          product: { id: "prod1", name: "Pro", slug: "pv-layout-pro" },
        },
        {
          id: "ent2",
          productId: "prod1",
          totalCalculations: 5,
          usedCalculations: 5,
          purchasedAt: new Date("2026-02-01"),
          deactivatedAt: null,
          product: { id: "prod1", name: "Pro", slug: "pv-layout-pro" },
        },
        {
          id: "ent3",
          productId: "prod1",
          totalCalculations: 10,
          usedCalculations: 0,
          purchasedAt: new Date("2026-03-01"),
          deactivatedAt: new Date("2026-03-10"),
          product: { id: "prod1", name: "Pro", slug: "pv-layout-pro" },
        },
      ],
    }))
    mockTransactionAggregate.mockReset()
    mockTransactionAggregate.mockImplementation(async () => ({
      _sum: { amount: 4999 },
    }))
  })

  it("totalSpend sums Transaction.amount for STRIPE+MANUAL only (excludes FREE_AUTO)", async () => {
    mockTransactionAggregate.mockImplementation(async () => ({
      _sum: { amount: 1998 },
    }))
    const result = await getCustomer("usr_alice", "all")
    expect(result.totalSpendUsd).toBeCloseTo(19.98)
    expect(mockTransactionAggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        _sum: { amount: true },
        where: expect.objectContaining({
          source: { in: ["STRIPE", "MANUAL"] },
        }),
      }),
    )
  })

  it("returns customer with entitlements and correct state", async () => {
    const result = await getCustomer("usr1", "all")
    expect(result.id).toBe("usr1")
    expect(result.entitlements).toHaveLength(3)

    const active = result.entitlements.find((e) => e.id === "ent1")!
    expect(active.state).toBe("ACTIVE")
    expect(active.remainingCalculations).toBe(7)

    const exhausted = result.entitlements.find((e) => e.id === "ent2")!
    expect(exhausted.state).toBe("EXHAUSTED")

    const deactivated = result.entitlements.find((e) => e.id === "ent3")!
    expect(deactivated.state).toBe("DEACTIVATED")
    expect(deactivated.deactivatedAt).not.toBeNull()
  })

  it("throws 404 when customer not found", async () => {
    mockUserFindUnique.mockImplementation(async () => null as never)
    await expect(getCustomer("nonexistent", "active")).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe("updateEntitlementStatus", () => {
  beforeEach(() => {
    mockEntitlementFindUnique.mockReset()
    mockEntitlementFindUnique.mockImplementation(async () => ({
      id: "ent1",
      userId: "usr1",
      productId: "prod1",
      totalCalculations: 10,
      usedCalculations: 3,
      deactivatedAt: null,
      purchasedAt: new Date("2026-01-15"),
    }))
    mockEntitlementUpdate.mockReset()
    mockEntitlementUpdate.mockImplementation(async () => ({
      id: "ent1",
      deactivatedAt: new Date(),
    }))
  })

  it("sets deactivatedAt to now when status is INACTIVE", async () => {
    await updateEntitlementStatus({ entitlementId: "ent1", status: "INACTIVE" })
    const calls = mockEntitlementUpdate.mock.calls
    expect(calls.length).toBe(1)
    const arg = (calls as unknown as Array<[{ data: { deactivatedAt: Date | null } }]>)[0]![0]
    expect(arg.data.deactivatedAt).toBeInstanceOf(Date)
  })

  it("sets deactivatedAt to null when status is ACTIVE", async () => {
    await updateEntitlementStatus({ entitlementId: "ent1", status: "ACTIVE" })
    const calls = mockEntitlementUpdate.mock.calls
    expect(calls.length).toBe(1)
    const arg = (calls as unknown as Array<[{ data: { deactivatedAt: null } }]>)[0]![0]
    expect(arg.data.deactivatedAt).toBeNull()
  })

  it("throws 404 when entitlement not found", async () => {
    mockEntitlementFindUnique.mockImplementation(async () => null as never)
    await expect(
      updateEntitlementStatus({ entitlementId: "nonexistent", status: "INACTIVE" }),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})
