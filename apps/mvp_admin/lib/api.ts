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
