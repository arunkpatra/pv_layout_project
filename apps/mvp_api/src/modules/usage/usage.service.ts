import { db } from "../../lib/db.js"
import { AppError } from "../../lib/errors.js"

/** Pool entitlement + the full sorted-by-displayOrder list (used for
 *  remaining-calc math without a second DB round-trip). */
export interface FeaturePool {
  pool: {
    id: string
    productId: string
    totalCalculations: number
    usedCalculations: number
  }
  entitlements: Array<{
    totalCalculations: number
    usedCalculations: number
  }>
}

/**
 * Validate feature key + pick the cheapest non-exhausted entitlement
 * that covers it. Shared between B9 (reportUsage) and B16
 * (createRunForProject) so both paths agree exactly on which pool gets
 * billed.
 */
export async function findFeaturePool(
  userId: string,
  featureKey: string,
): Promise<FeaturePool> {
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

  // Cheapest-first (lowest displayOrder), filtered to active entitlements.
  // deactivatedAt: null enforces the kill switch — deactivated entitlements
  // are never consumed.
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

  return { pool, entitlements }
}

/** Loose tx client interface — narrows to the surface debitInTx needs.
 *  Keeps the helper agnostic of the full Prisma client shape. */
interface DebitTxClient {
  $executeRaw: (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<number>
  usageRecord: {
    create: (args: {
      data: {
        userId: string
        licenseKeyId: string
        productId: string
        featureKey: string
        idempotencyKey?: string
      }
    }) => Promise<{ id: string }>
  }
}

/**
 * Atomically debit one calc from `pool` and write a UsageRecord — must
 * run inside an active `db.$transaction`. The UPDATE guards against
 * concurrent decrement races; the UsageRecord insert with
 * idempotencyKey lets B9/B16 catch P2002 from a concurrent retry.
 *
 * Throws 409 CONFLICT if the entitlement was deactivated or exhausted
 * between selection (findFeaturePool) and this UPDATE.
 */
export async function debitInTx(
  tx: DebitTxClient,
  pool: { id: string; productId: string },
  userId: string,
  licenseKeyId: string,
  featureKey: string,
  idempotencyKey?: string,
): Promise<{ id: string }> {
  const rowsUpdated = await tx.$executeRaw`
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

  return await tx.usageRecord.create({
    data: {
      userId,
      licenseKeyId,
      productId: pool.productId,
      featureKey,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    },
  })
}

export async function reportUsage(
  userId: string,
  licenseKeyId: string,
  featureKey: string,
  idempotencyKey?: string,
): Promise<{ recorded: boolean; remainingCalculations: number }> {
  const { pool, entitlements } = await findFeaturePool(userId, featureKey)

  await db.$transaction(async (tx) => {
    await debitInTx(
      tx as unknown as DebitTxClient,
      pool,
      userId,
      licenseKeyId,
      featureKey,
      idempotencyKey,
    )
  })

  // Compute remaining from already-loaded entitlements, subtracting the
  // one just consumed. Avoids a second DB round-trip that could race
  // with concurrent decrements.
  const totalCalculations = entitlements.reduce(
    (sum, e) => sum + e.totalCalculations,
    0,
  )
  const usedCalculations = entitlements.reduce(
    (sum, e) => sum + e.usedCalculations,
    0,
  )
  const remainingCalculations = Math.max(
    0,
    totalCalculations - usedCalculations - 1,
  )
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
