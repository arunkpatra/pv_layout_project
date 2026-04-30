import { db } from "../../lib/db.js"
import type {
  EntitlementSummary,
  EntitlementSummaryV2,
  PlanSummary,
  ProjectQuotaState,
} from "@solarlayout/shared"

// Re-export so existing imports inside mvp_api keep working unchanged.
export type { EntitlementSummary, EntitlementSummaryV2, PlanSummary, ProjectQuotaState }

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

/**
 * Compute the user's per-tier concurrent-project quota state.
 *
 * `projectQuota` is the max `Entitlement.projectQuota` over rows
 * where `deactivatedAt IS NULL AND usedCalculations < totalCalculations`.
 * Exhausted or deactivated entitlements never contribute. Free-tier auto-
 * provisioning means a user with no purchased plans still has 3 (the
 * Free tier's quota) — until they exhaust their 5 free calcs, after which
 * `projectQuota` drops to 0 and projects become read-only.
 *
 * Post-B19: projectQuota is snapshotted onto Entitlement at creation time
 * (from Product.projectQuota), so this read no longer JOINs Product.
 */
export async function getProjectQuotaState(
  userId: string,
): Promise<ProjectQuotaState> {
  const usable = await db.entitlement.findMany({
    where: { userId, deactivatedAt: null },
    select: {
      totalCalculations: true,
      usedCalculations: true,
      projectQuota: true,
    },
  })
  const projectQuota = usable
    .filter((e) => e.usedCalculations < e.totalCalculations)
    .reduce((max, e) => Math.max(max, e.projectQuota), 0)

  const projectsActive = await db.project.count({
    where: { userId, deletedAt: null },
  })

  return {
    projectQuota,
    projectsActive,
    projectsRemaining: Math.max(0, projectQuota - projectsActive),
  }
}

/**
 * V2 entitlement summary — strict superset of V1.
 * V1 shape is preserved exactly (re-uses computeEntitlementSummary);
 * V2 adds projectQuota + projectsActive + projectsRemaining for the
 * desktop's per-tier project ceiling, and `entitlementsActive` so the
 * desktop can split EXHAUSTED (active=true, self-service buy-more) from
 * DEACTIVATED (active=false, contact-support). The two states are
 * otherwise indistinguishable in the V2 envelope.
 *
 * `entitlementsActive` is intentionally a separate filter from quota /
 * remaining-calcs: it's `count(deactivatedAt IS NULL) > 0` with no
 * exhaustion check, since an exhausted entitlement is still an active
 * subscription that just needs a credit top-up.
 */
export async function computeEntitlementSummaryV2(user: {
  id: string
  name: string | null
  email: string
}): Promise<EntitlementSummaryV2> {
  const v1 = await computeEntitlementSummary(user)
  const quota = await getProjectQuotaState(user.id)
  const activeCount = await db.entitlement.count({
    where: { userId: user.id, deactivatedAt: null },
  })
  return { ...v1, ...quota, entitlementsActive: activeCount > 0 }
}
