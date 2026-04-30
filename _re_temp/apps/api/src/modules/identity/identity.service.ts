import { db } from "../../lib/db.js"
import { NotFoundError } from "../../lib/errors.js"
import type { User } from "@renewable-energy/shared"

export async function getMe(userId: string): Promise<User> {
  const user = await db.user.findUnique({ where: { id: userId } })

  if (!user) {
    throw new NotFoundError("User", userId)
  }

  return {
    id: user.id,
    clerkId: user.clerkId,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }
}
