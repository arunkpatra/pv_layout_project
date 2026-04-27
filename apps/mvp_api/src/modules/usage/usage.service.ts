import { db } from "../../lib/db.js"
import { AppError } from "../../lib/errors.js"

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
  // deactivatedAt: null enforces the kill switch — deactivated entitlements are never consumed
  const entitlements = await db.entitlement.findMany({
    where: { userId, deactivatedAt: null },
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
        $executeRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<number>
      }
    ).$executeRaw`
      UPDATE entitlements
      SET "usedCalculations" = "usedCalculations" + 1
      WHERE id = ${pool.id}
        AND "usedCalculations" < "totalCalculations"
        AND "deactivatedAt" IS NULL
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

  // 4. Compute remaining from already-loaded entitlements, subtracting the one just consumed.
  // Avoids a second DB round-trip that could race with concurrent decrements.
  const totalCalculations = entitlements.reduce((sum, e) => sum + e.totalCalculations, 0)
  const usedCalculations = entitlements.reduce((sum, e) => sum + e.usedCalculations, 0)
  const remainingCalculations = Math.max(0, totalCalculations - usedCalculations - 1)
  return { recorded: true, remainingCalculations }
}
