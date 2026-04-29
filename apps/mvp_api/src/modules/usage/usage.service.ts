import { db } from "../../lib/db.js"
import { AppError } from "../../lib/errors.js"

export async function reportUsage(
  userId: string,
  licenseKeyId: string,
  featureKey: string,
  idempotencyKey?: string,
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
        ...(idempotencyKey ? { idempotencyKey } : {}),
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

export interface UsageReportV2Result {
  recorded: true
  remainingCalculations: number
  availableFeatures: string[]
}

/**
 * Idempotent usage report.
 *
 * The desktop sends a fresh idempotencyKey per "Generate Layout" click and
 * retries the same request on transient failures. The first call debits a
 * calc and writes a UsageRecord with the key; subsequent calls with the
 * same key return the same response without double-debiting.
 *
 * Race-safe via the (userId, idempotencyKey) unique index on UsageRecord:
 * concurrent retries are serialized at insert time, the loser catches
 * P2002 and falls through to read the post-debit state.
 *
 * Response extends V1's reportUsage shape with `availableFeatures` so the
 * desktop can refresh its feature gating in one round-trip.
 */
export async function reportUsageV2(
  userId: string,
  licenseKeyId: string,
  featureKey: string,
  idempotencyKey: string,
): Promise<UsageReportV2Result> {
  // Fast path: have we already processed this key?
  const existing = await db.usageRecord.findFirst({
    where: { userId, idempotencyKey },
    select: { id: true },
  })

  if (!existing) {
    try {
      await reportUsage(userId, licenseKeyId, featureKey, idempotencyKey)
    } catch (e) {
      const code = (e as { code?: string }).code
      if (code !== "P2002") throw e
      // Race: a concurrent retry inserted the same key first. Fall through
      // to compute the summary from the now-existing post-debit state.
    }
  }

  // Compute summary from current state (post-debit, or post-replay).
  const entitlements = await db.entitlement.findMany({
    where: { userId, deactivatedAt: null },
    include: { product: { include: { features: true } } },
  })
  const usable = entitlements.filter(
    (e) => e.usedCalculations < e.totalCalculations,
  )
  const remainingCalculations = usable.reduce(
    (sum, e) => sum + (e.totalCalculations - e.usedCalculations),
    0,
  )
  const featureSet = new Set<string>()
  for (const e of usable) {
    for (const f of e.product.features) featureSet.add(f.featureKey)
  }

  return {
    recorded: true,
    remainingCalculations,
    availableFeatures: Array.from(featureSet),
  }
}
