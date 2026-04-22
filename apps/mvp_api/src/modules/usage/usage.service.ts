import { db } from "../../lib/db.js"
import { AppError } from "../../lib/errors.js"
import { computeEntitlementSummary } from "../entitlements/entitlements.service.js"

export async function reportUsage(
  userId: string,
  licenseKeyId: string,
  featureKey: string,
): Promise<{ recorded: boolean; remainingCalculations: number }> {
  // 1. Validate feature key exists in any product
  const featureExists = await db.productFeature.findFirst({
    where: { featureKey },
  })
  if (!featureExists) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Unknown feature key: ${featureKey}`,
      400,
    )
  }

  // 2. Select pool: cheapest-first (lowest displayOrder) with remaining > 0 and matching feature
  const entitlements = await db.entitlement.findMany({
    where: { userId },
    include: {
      product: {
        include: { features: true },
      },
    },
    orderBy: { product: { displayOrder: "asc" } },
  })

  const pool = entitlements.find(
    (e) =>
      e.totalCalculations - e.usedCalculations > 0 &&
      e.product.features.some((f) => f.featureKey === featureKey),
  )

  if (!pool) {
    throw new AppError(
      "PAYMENT_REQUIRED",
      "No remaining calculations — purchase more at solarlayout.in",
      402,
    )
  }

  // 3. Atomic decrement: guard against concurrent race conditions
  await db.$transaction(async (tx) => {
    const rowsUpdated = await (
      tx as unknown as {
        $executeRaw: (...args: unknown[]) => Promise<number>
      }
    ).$executeRaw`
      UPDATE entitlements
      SET "usedCalculations" = "usedCalculations" + 1
      WHERE id = ${pool.id}
        AND "usedCalculations" < "totalCalculations"
    `

    if (rowsUpdated === 0) {
      throw new AppError(
        "CONFLICT",
        "Calculation already in progress — retry",
        409,
      )
    }

    await tx.usageRecord.create({
      data: {
        userId,
        licenseKeyId,
        productId: pool.productId,
        featureKey,
      },
    })
  })

  // 4. Return updated total remaining across all entitlements
  const { remainingCalculations } = await computeEntitlementSummary(userId)
  return { recorded: true, remainingCalculations }
}
