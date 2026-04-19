export type UserStatus = "ACTIVE" | "INACTIVE"

export type User = {
  id: string
  clerkId: string
  email: string | null
  name: string
  avatarUrl: string | null
  status: UserStatus
  createdAt: string
  updatedAt: string
}
