import { db } from "../../lib/db.js"

export interface PlanSummary {
  planName: string
  /** Human-readable labels from ProductFeature.label — for display only */
  features: string[]
  totalCalculations: number
  usedCalculations: number
  remainingCalculations: number
}

export interface EntitlementSummary {
  user: { name: string | null; email: string }
  plans: PlanSummary[]
  licensed: boolean
  /** Feature keys (e.g. "plant_layout") — used for runtime feature gating */
  availableFeatures: string[]
  totalCalculations: number
  usedCalculations: number
  remainingCalculations: number
}

export async function computeEntitlementSummary(user: {
  id: string
  name: string | null
  email: string
}): Promise<EntitlementSummary> {
  // Only return usable entitlements — exclude deactivated and exhausted.
  // The desktop app only needs entitlements the user can actively use.
  const allEntitlements = await db.entitlement.findMany({
    where: { userId: user.id, deactivatedAt: null },
    orderBy: { product: { displayOrder: "asc" } },
    include: {
      product: {
        include: { features: true },
      },
    },
  })

  // Further exclude exhausted (usedCalculations >= totalCalculations)
  const entitlements = allEntitlements.filter(
    (e) => e.usedCalculations < e.totalCalculations,
  )

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
    for (const f of e.product.features) {
      featureSet.add(f.featureKey)
    }
  }

  const plans: PlanSummary[] = entitlements.map((e) => ({
    planName: e.product.name,
    features: e.product.features.map((f) => f.label),
    totalCalculations: e.totalCalculations,
    usedCalculations: e.usedCalculations,
    remainingCalculations: Math.max(0, e.totalCalculations - e.usedCalculations),
  }))

  return {
    user: { name: user.name, email: user.email },
    plans,
    licensed: remainingCalculations > 0,
    availableFeatures: Array.from(featureSet),
    totalCalculations,
    usedCalculations,
    remainingCalculations,
  }
}
