import { createClerkClient } from "@clerk/backend"
import { db } from "../../lib/db.js"
import { env } from "../../env.js"
import { AppError } from "../../lib/errors.js"

export type AdminRole = "ADMIN" | "OPS"

export type UserListItem = {
  id: string
  clerkId: string
  email: string
  name: string | null
  roles: string[]
  status: string
  createdAt: Date
}

export type PaginationMeta = {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

function clerkClient() {
  return createClerkClient({ secretKey: env.CLERK_SECRET_KEY ?? "" })
}

export async function listAdminUsers(params: {
  page: number
  pageSize: number
}): Promise<{ data: UserListItem[]; pagination: PaginationMeta }> {
  const { page, pageSize } = params
  const skip = (page - 1) * pageSize

  const [users, total] = await Promise.all([
    db.user.findMany({
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        clerkId: true,
        email: true,
        name: true,
        roles: true,
        status: true,
        createdAt: true,
      },
    }),
    db.user.count(),
  ])

  return {
    data: users as UserListItem[],
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  }
}

export async function getAdminUser(id: string): Promise<UserListItem> {
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      clerkId: true,
      email: true,
      name: true,
      roles: true,
      status: true,
      createdAt: true,
    },
  })
  if (!user) {
    throw new AppError("NOT_FOUND", `User ${id} not found`, 404)
  }
  return user as UserListItem
}

export async function createAdminUser(params: {
  name: string
  email: string
  roles: AdminRole[]
}): Promise<UserListItem> {
  const { name, email, roles } = params
  const clerk = clerkClient()

  const nameParts = name.trim().split(" ")
  const firstName = nameParts[0] ?? name
  const lastName = nameParts.slice(1).join(" ") || undefined

  const clerkUser = await clerk.users.createUser({
    emailAddress: [email],
    firstName,
    ...(lastName ? { lastName } : {}),
    publicMetadata: { roles },
    skipPasswordRequirement: true,
  })

  let user
  try {
    user = await db.user.upsert({
      where: { clerkId: clerkUser.id },
      create: {
        clerkId: clerkUser.id,
        email,
        name: name.trim(),
        roles,
        status: "ACTIVE",
      },
      update: {
        email,
        name: name.trim(),
        roles,
        status: "ACTIVE",
      },
    })
  } catch (dbErr) {
    // Best-effort cleanup: delete the Clerk user to avoid orphaned accounts
    try {
      await clerk.users.deleteUser(clerkUser.id)
    } catch {
      // Log but don't rethrow — the original DB error is the important one
      console.error(
        "[admin] Failed to cleanup Clerk user after DB error:",
        clerkUser.id,
      )
    }
    throw dbErr
  }

  return {
    id: user.id,
    clerkId: user.clerkId,
    email: user.email,
    name: user.name,
    roles: user.roles as string[],
    status: user.status,
    createdAt: user.createdAt,
  }
}

export async function updateUserRoles(params: {
  userId: string
  role: AdminRole
  action: "add" | "remove"
}): Promise<void> {
  const { userId, role, action } = params

  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) throw new AppError("NOT_FOUND", `User ${userId} not found`, 404)

  const clerk = clerkClient()
  const clerkUser = await clerk.users.getUser(user.clerkId)
  const currentRoles = (
    (clerkUser.publicMetadata as Record<string, unknown>)?.["roles"] ?? []
  ) as string[]

  const updatedRoles =
    action === "add"
      ? [...new Set([...currentRoles, role])]
      : currentRoles.filter((r) => r !== role)

  await clerk.users.updateUser(user.clerkId, {
    publicMetadata: {
      ...(clerkUser.publicMetadata as Record<string, unknown>),
      roles: updatedRoles,
    },
  })

  await db.user.update({ where: { id: userId }, data: { roles: updatedRoles } })
}

export async function updateUserStatus(params: {
  userId: string
  status: "ACTIVE" | "INACTIVE"
}): Promise<void> {
  const { userId, status } = params

  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) throw new AppError("NOT_FOUND", `User ${userId} not found`, 404)

  await db.user.update({ where: { id: userId }, data: { status } })
}
