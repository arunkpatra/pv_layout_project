const MVP_API_URL =
  process.env.NEXT_PUBLIC_MVP_API_URL ?? "http://localhost:3003"

export { MVP_API_URL }

export type UserListItem = {
  id: string
  clerkId: string
  email: string
  name: string | null
  roles: string[]
  status: string
  createdAt: string
}

export type PaginationMeta = {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type AdminUsersResponse = {
  data: UserListItem[]
  pagination: PaginationMeta
}

export type CustomerListItem = {
  id: string
  name: string | null
  email: string
  roles: string[]
  status: string
  createdAt: string
  totalSpendUsd: number
  activeEntitlementCount: number
}

export type AdminCustomersResponse = {
  data: CustomerListItem[]
  pagination: PaginationMeta
}

export type EntitlementDetail = {
  id: string
  productId: string
  productName: string
  productSlug: string
  totalCalculations: number
  usedCalculations: number
  remainingCalculations: number
  purchasedAt: string
  deactivatedAt: string | null
  state: "ACTIVE" | "EXHAUSTED" | "DEACTIVATED"
}

export type CustomerDetail = {
  id: string
  name: string | null
  email: string
  roles: string[]
  status: string
  createdAt: string
  totalSpendUsd: number
  entitlements: EntitlementDetail[]
}

export type ProductListItem = {
  slug: string
  name: string
  priceAmount: number
  priceCurrency: string
  calculations: number
  active: boolean
  isFree: boolean
  totalRevenueUsd: number
  purchaseCount: number
  activeEntitlementCount: number
}

export type AdminProductsResponse = {
  data: ProductListItem[]
  pagination: PaginationMeta
}

export type SalesDataPoint = {
  period: string
  revenueUsd: number
  purchaseCount: number
}

export type ProductSalesResponse = {
  granularity: "daily" | "weekly" | "monthly"
  data: SalesDataPoint[]
}

export type DashboardSummary = {
  totalRevenueUsd: number
  totalCustomers: number
  totalPurchases: number
  activeEntitlements: number
}

export type RevenueTrendPoint = {
  period: string
  revenueUsd: number
}

export type CustomerTrendPoint = {
  period: string
  count: number
}

export type DashboardTrends = {
  granularity: "daily" | "weekly" | "monthly"
  revenue: RevenueTrendPoint[]
  customers: CustomerTrendPoint[]
}

export type ProductsSummary = {
  totalRevenueUsd: number
  totalPurchases: number
  activeEntitlements: number
}
