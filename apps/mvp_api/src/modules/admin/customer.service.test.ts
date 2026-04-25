import { describe, it, expect, mock, beforeEach } from "bun:test"

const mockUserFindMany = mock(async () => [
  {
    id: "usr1",
    email: "alice@example.com",
    name: "Alice",
    roles: [],
    status: "ACTIVE",
    createdAt: new Date("2026-01-01"),
    checkoutSessions: [{ amountTotal: 4999 }, { amountTotal: null }],
    entitlements: [
      { deactivatedAt: null },
      { deactivatedAt: new Date() },
    ],
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
  checkoutSessions: [{ amountTotal: 4999 }],
  entitlements: [
    {
      id: "ent1",
      productId: "prod1",
      totalCalculations: 10,
      usedCalculations: 3,
      purchasedAt: new Date("2026-01-15"),
      deactivatedAt: null,
      product: { id: "prod1", name: "PV Layout Pro", slug: "pv-layout-pro" },
    },
    {
      id: "ent2",
      productId: "prod1",
      totalCalculations: 5,
      usedCalculations: 5,
      purchasedAt: new Date("2026-02-01"),
      deactivatedAt: null,
      product: { id: "prod1", name: "PV Layout Pro", slug: "pv-layout-pro" },
    },
    {
      id: "ent3",
      productId: "prod1",
      totalCalculations: 10,
      usedCalculations: 0,
      purchasedAt: new Date("2026-03-01"),
      deactivatedAt: new Date("2026-03-10"),
      product: { id: "prod1", name: "PV Layout Pro", slug: "pv-layout-pro" },
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
  },
}))

const { listCustomers, getCustomer } = await import("./customer.service.js")

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
        checkoutSessions: [{ amountTotal: 4999 }, { amountTotal: null }],
        entitlements: [
          { deactivatedAt: null },
          { deactivatedAt: new Date() },
        ],
      },
    ])
    mockUserCount.mockReset()
    mockUserCount.mockImplementation(async () => 1)
  })

  it("returns paginated list with computed spend and active entitlement count", async () => {
    const result = await listCustomers({ page: 1, pageSize: 20 })
    expect(result.data).toHaveLength(1)
    const customer = result.data[0]!
    expect(customer.id).toBe("usr1")
    expect(customer.totalSpendUsd).toBeCloseTo(49.99)
    expect(customer.activeEntitlementCount).toBe(1)
    expect(result.pagination.total).toBe(1)
  })

  it("treats null amountTotal as zero in spend sum", async () => {
    mockUserFindMany.mockImplementation(async () => [
      {
        id: "usr2",
        email: "bob@example.com",
        name: "Bob",
        roles: [],
        status: "ACTIVE",
        createdAt: new Date("2026-01-01"),
        checkoutSessions: [{ amountTotal: null }],
        entitlements: [],
      },
    ])
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
      checkoutSessions: [{ amountTotal: 4999 }],
      entitlements: [
        {
          id: "ent1",
          productId: "prod1",
          totalCalculations: 10,
          usedCalculations: 3,
          purchasedAt: new Date("2026-01-15"),
          deactivatedAt: null,
          product: { id: "prod1", name: "PV Layout Pro", slug: "pv-layout-pro" },
        },
        {
          id: "ent2",
          productId: "prod1",
          totalCalculations: 5,
          usedCalculations: 5,
          purchasedAt: new Date("2026-02-01"),
          deactivatedAt: null,
          product: { id: "prod1", name: "PV Layout Pro", slug: "pv-layout-pro" },
        },
        {
          id: "ent3",
          productId: "prod1",
          totalCalculations: 10,
          usedCalculations: 0,
          purchasedAt: new Date("2026-03-01"),
          deactivatedAt: new Date("2026-03-10"),
          product: { id: "prod1", name: "PV Layout Pro", slug: "pv-layout-pro" },
        },
      ],
    }))
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
