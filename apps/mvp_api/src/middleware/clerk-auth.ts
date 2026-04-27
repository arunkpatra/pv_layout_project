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

    const seedRoles = Array.isArray(clerkUser.publicMetadata?.roles)
      ? (clerkUser.publicMetadata.roles as string[])
      : []

    let createdNew = false
    try {
      user = await db.user.create({
        data: {
          clerkId,
          email,
          name:
            [clerkUser.firstName, clerkUser.lastName]
              .filter(Boolean)
              .join(" ") || null,
          roles: seedRoles,
          status: "ACTIVE",
        },
      })
      createdNew = true
    } catch (err) {
      // P2002 = unique constraint violation on clerkId — another concurrent request
      // created this user first. We lost the race; the winner already provisioned
      // (or is provisioning). Fetch the existing row and skip provisioning.
      const isP2002 =
        err !== null &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code?: string }).code === "P2002"
      if (isP2002) {
        user = await db.user.findFirst({ where: { clerkId } })
        if (!user) {
          throw new AppError(
            "INTERNAL_ERROR",
            "User race anomaly: P2002 but no row found",
            500,
          )
        }
      } else {
        throw err
      }
    }

    if (createdNew) {
      // Atomic gate satisfied — only ONE concurrent request reaches here.
      // Auto-provision Free plan for this new user.
      try {
        const freeProduct = await db.product.findFirst({
          where: { isFree: true },
        })
        if (freeProduct) {
          const licenseKey = `sl_live_${crypto.randomBytes(24).toString("base64url")}`
          await db.$transaction(async (tx) => {
            const transaction = await tx.transaction.create({
              data: {
                userId: user!.id,
                productId: freeProduct.id,
                source: "FREE_AUTO",
                amount: 0,
                currency: "usd",
                paymentMethod: null,
                externalReference: null,
                notes: "Auto-granted free tier on signup",
                createdByUserId: null,
                checkoutSessionId: null,
              },
            })
            await tx.entitlement.create({
              data: {
                userId: user!.id,
                productId: freeProduct.id,
                transactionId: transaction.id,
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
          console.warn(
            "[auth] Free product not found — skipping Free plan provisioning",
          )
        }
      } catch (err) {
        // Non-fatal: log and continue — auth must not fail due to provisioning error
        console.warn("[auth] Free plan provisioning failed:", err)
      }
    }
    // If !createdNew: race loser — winner already provisioned. Skip entirely.
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
