import { db } from "../../lib/db.js"

export interface EntitlementSummary {
  licensed: boolean
  availableFeatures: string[]
  totalCalculations: number
  usedCalculations: number
  remainingCalculations: number
}

export async function computeEntitlementSummary(
  userId: string,
): Promise<EntitlementSummary> {
  const entitlements = await db.entitlement.findMany({
    where: { userId },
    include: {
      product: {
        include: { features: true },
      },
    },
  })

  const totalCalculations = entitlements.reduce(
    (sum, e) => sum + e.totalCalculations,
    0,
  )
  const usedCalculations = entitlements.reduce(
    (sum, e) => sum + e.usedCalculations,
    0,
  )
  const remainingCalculations = Math.max(0, totalCalculations - usedCalculations)

  const featureSet = new Set<string>()
  for (const e of entitlements) {
    if (e.totalCalculations - e.usedCalculations > 0) {
      for (const f of e.product.features) {
        featureSet.add(f.featureKey)
      }
    }
  }

  return {
    licensed: remainingCalculations > 0,
    availableFeatures: Array.from(featureSet),
    totalCalculations,
    usedCalculations,
    remainingCalculations,
  }
}
