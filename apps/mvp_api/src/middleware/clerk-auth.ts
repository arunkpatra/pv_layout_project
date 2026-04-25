import { verifyToken } from "@clerk/backend"
import type { MiddlewareHandler } from "hono"
import { env } from "../env.js"
import { AppError } from "../lib/errors.js"
import { db } from "../lib/db.js"
import crypto from "node:crypto"

export const clerkAuth: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header("Authorization")
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined

  if (!token) {
    throw new AppError("UNAUTHORIZED", "Authentication required", 401)
  }

  let payload
  try {
    payload = await verifyToken(token, {
      secretKey: env.CLERK_SECRET_KEY ?? "",
    })
  } catch {
    throw new AppError("UNAUTHORIZED", "Invalid or expired token", 401)
  }

  const clerkId = payload.sub

  // Find or create user in our DB
  let user = await db.user.findFirst({ where: { clerkId } })

  if (!user) {
    // Fetch real user details from Clerk
    const { createClerkClient } = await import("@clerk/backend")
    const clerk = createClerkClient({
      secretKey: env.CLERK_SECRET_KEY ?? "",
    })
    const clerkUser = await clerk.users.getUser(clerkId)
    const email =
      clerkUser.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId,
      )?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress

    if (!email) {
      throw new AppError("BAD_REQUEST", "Clerk user has no email address", 400)
    }

    user = await db.user.upsert({
      where: { clerkId },
      create: {
        clerkId,
        email,
        name:
          [clerkUser.firstName, clerkUser.lastName]
            .filter(Boolean)
            .join(" ") || null,
        roles: [],
        status: "ACTIVE",
      },
      update: {
        email,
        name:
          [clerkUser.firstName, clerkUser.lastName]
            .filter(Boolean)
            .join(" ") || null,
      },
    })

    // Auto-provision Free plan for new users
    try {
      const freeProduct = await db.product.findFirst({ where: { isFree: true } })
      if (freeProduct) {
        const licenseKey = `sl_live_${crypto.randomBytes(24).toString("base64url")}`
        await db.$transaction(async (tx) => {
          await tx.entitlement.create({
            data: {
              userId: user!.id,
              productId: freeProduct.id,
              totalCalculations: freeProduct.calculations,
            },
          })
          await tx.licenseKey.create({
            data: {
              userId: user!.id,
              key: licenseKey,
            },
          })
        })
      } else {
        console.warn("[auth] Free product not found — skipping Free plan provisioning")
      }
    } catch (err) {
      // Non-fatal: log and continue — auth must not fail due to provisioning error
      console.warn("[auth] Free plan provisioning failed:", err)
    }
  }

  // Reject inactive users regardless of roles
  if (user.status !== "ACTIVE") {
    throw new AppError("UNAUTHORIZED", "Account is not active", 401)
  }

  c.set("user", {
    id: user.id,
    clerkId: user.clerkId,
    email: user.email,
    name: user.name,
    stripeCustomerId: user.stripeCustomerId ?? null,
    roles: user.roles as string[],
    status: user.status,
  })
  await next()
}
