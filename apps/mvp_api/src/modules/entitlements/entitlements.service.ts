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

export interface EntitlementSummaryV2 extends EntitlementSummary {
  /** Max projectQuota across active + non-exhausted entitlements. 0 if none. */
  projectQuota: number
  /** Count of the user's non-deleted Project rows. */
  projectsActive: number
  /** max(0, projectQuota - projectsActive). When 0, the desktop must
   *  enter read-only mode for any over-quota project. */
  projectsRemaining: number
}

/**
 * V2 entitlement summary — strict superset of V1.
 * V1 shape is preserved exactly (re-uses computeEntitlementSummary);
 * V2 adds projectQuota + projectsActive + projectsRemaining for the
 * desktop's per-tier project ceiling.
 */
export async function computeEntitlementSummaryV2(user: {
  id: string
  name: string | null
  email: string
}): Promise<EntitlementSummaryV2> {
  const v1 = await computeEntitlementSummary(user)

  const usable = await db.entitlement.findMany({
    where: { userId: user.id, deactivatedAt: null },
    select: {
      totalCalculations: true,
      usedCalculations: true,
      product: { select: { projectQuota: true } },
    },
  })
  const projectQuota = usable
    .filter((e) => e.usedCalculations < e.totalCalculations)
    .reduce((max, e) => Math.max(max, e.product.projectQuota), 0)

  const projectsActive = await db.project.count({
    where: { userId: user.id, deletedAt: null },
  })

  const projectsRemaining = Math.max(0, projectQuota - projectsActive)

  return { ...v1, projectQuota, projectsActive, projectsRemaining }
}
