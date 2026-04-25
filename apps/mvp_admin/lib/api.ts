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
