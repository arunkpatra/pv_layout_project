import type { MiddlewareHandler } from "hono"
import { verifyToken, createClerkClient } from "@clerk/backend"
import { db } from "../lib/db.js"
import { env } from "../env.js"
import { UnauthorizedError } from "../lib/errors.js"
import type { UserStatus } from "@renewable-energy/shared"

export type AuthUser = {
  id: string
  clerkId: string
  status: UserStatus
}

export type HonoEnv = { Variables: { user: AuthUser } }

export const authMiddleware: MiddlewareHandler<HonoEnv> = async (c, next) => {
  // Dev mode: no CLERK_SECRET_KEY — upsert a mock user so the API works locally
  // without Clerk credentials
  if (!env.CLERK_SECRET_KEY) {
    const devUser = await db.user.upsert({
      where: { clerkId: "dev-clerk-id" },
      create: {
        clerkId: "dev-clerk-id",
        name: "Dev User",
        email: "dev@renewable-energy.local",
        status: "ACTIVE",
      },
      update: {},
    })
    c.set("user", {
      id: devUser.id,
      clerkId: "dev-clerk-id",
      status: "ACTIVE",
    })
    return next()
  }

  const authHeader = c.req.header("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or invalid Authorization header")
  }

  const token = authHeader.slice(7)
  let clerkId: string

  try {
    const payload = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY,
    })
    clerkId = payload.sub
  } catch {
    throw new UnauthorizedError("Invalid or expired token")
  }

  let user = await db.user.findUnique({ where: { clerkId } })

  if (!user) {
    // First sign-in: fetch profile from Clerk and create DB record
    const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY })
    const clerkUser = await clerk.users.getUser(clerkId)

    const email = clerkUser.emailAddresses[0]?.emailAddress ?? null
    const name =
      [clerkUser.firstName, clerkUser.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() || "Unnamed User"

    user = await db.user.upsert({
      where: { clerkId },
      create: {
        clerkId,
        name,
        email,
        avatarUrl: clerkUser.imageUrl ?? null,
        status: "ACTIVE",
      },
      update: {
        name,
        email,
        avatarUrl: clerkUser.imageUrl ?? null,
      },
    })
  }

  // Returning user — profile fields (name, email, avatarUrl) are NOT synced here.
  // Clerk profile changes are infrequent; syncing on every request is wasteful.
  // A dedicated profile-sync endpoint or background job will handle this in a
  // future iteration when profile management is built.

  if (user.status !== "ACTIVE") {
    throw new UnauthorizedError("Account is not active")
  }

  c.set("user", {
    id: user.id,
    clerkId: user.clerkId,
    status: user.status,
  })

  return next()
}
