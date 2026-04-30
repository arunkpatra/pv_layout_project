/**
 * Desktop integration test fixtures.
 *
 * Idempotently provisions 8 named test users in local mvp_db, each with a
 * stable license key and the entitlement / calc / project state required
 * for the desktop session's F2/F3/F5/F6/P1 verification block.
 *
 * Re-run any time to reset state — the script wipes existing fixtures
 * (clerkId LIKE `_desktop_test_%`) and recreates them fresh. Safe to run
 * against the local mvp_db only; never run against staging or prod.
 *
 * Run:
 *   bun run packages/mvp_db/prisma/seed-desktop-test-fixtures.ts
 *
 * Output: a markdown table of the 8 license keys + their seeded state,
 * suitable for pasting into the desktop session.
 */

import { adminPrisma } from "../src/index.js"

const FIXTURE_PREFIX = "_desktop_test_"

/**
 * Stable IDs for the PRO_PLUS user's B7 fixture (Project + Run). These
 * are 40-char alphanumeric IDs the desktop can hardcode in test
 * fixtures and trust to survive seed re-runs. The shape matches the
 * semantic-ID extension's contract (`<prefix>_<36-char-base62>`).
 */
export const FIXTURE_IDS = {
  PRO_PLUS_PROJECT: "prj_b7fixturePROPLUS00000000000000000000",
  PRO_PLUS_RUN: "run_b7fixturePROPLUS00000000000000000000",
} as const

interface FixtureSpec {
  scenario: string
  clerkId: string
  email: string
  name: string
  /** Stable license-key suffix — script reuses it on every re-run so
   *  the desktop can hardcode the resulting key in test fixtures. */
  keySuffix: string
  /** entitlement specs in creation order; quota math takes max across them */
  entitlements: Array<{
    productSlug: string
    usedCalculations: number
    deactivated?: boolean
  }>
  /** how many projects to create */
  projectCount: number
  /** when set, also seeds 1 UsageRecord + 1 Run with stable IDs so
   *  the desktop can exercise B7 against real (projectId, runId) */
  withB7Fixture?: boolean
  /** plain-English description for the markdown summary */
  description: string
}

const FIXTURES: FixtureSpec[] = [
  {
    scenario: "FREE",
    clerkId: `${FIXTURE_PREFIX}free`,
    email: "desktop-test-free@solarlayout.test",
    name: "FREE",
    keySuffix: "stable",
    entitlements: [{ productSlug: "pv-layout-free", usedCalculations: 0 }],
    projectCount: 0,
    description: "Free 5/5 remaining; 0 projects",
  },
  {
    scenario: "BASIC",
    clerkId: `${FIXTURE_PREFIX}basic`,
    email: "desktop-test-basic@solarlayout.test",
    name: "BASIC",
    keySuffix: "stable",
    entitlements: [
      { productSlug: "pv-layout-free", usedCalculations: 5 },
      { productSlug: "pv-layout-basic", usedCalculations: 0 },
    ],
    projectCount: 0,
    description: "Free 0/5 (consumed) + Basic 5/5 remaining; 0 projects",
  },
  {
    scenario: "PRO",
    clerkId: `${FIXTURE_PREFIX}pro`,
    email: "desktop-test-pro@solarlayout.test",
    name: "PRO",
    keySuffix: "stable",
    entitlements: [
      { productSlug: "pv-layout-free", usedCalculations: 5 },
      { productSlug: "pv-layout-pro", usedCalculations: 0 },
    ],
    projectCount: 0,
    description: "Free 0/5 + Pro 10/10 remaining; 0 projects",
  },
  {
    scenario: "PRO_PLUS",
    clerkId: `${FIXTURE_PREFIX}pro_plus`,
    email: "desktop-test-pro_plus@solarlayout.test",
    name: "PRO_PLUS",
    keySuffix: "stable",
    entitlements: [
      { productSlug: "pv-layout-free", usedCalculations: 5 },
      { productSlug: "pv-layout-pro-plus", usedCalculations: 0 },
    ],
    projectCount: 0,
    withB7Fixture: true,
    description:
      "Free 0/5 + Pro Plus 50/50 remaining; 1 Project + 1 Run with stable IDs (FIXTURE_IDS) for B7 verification across all 5 result types",
  },
  {
    scenario: "MULTI",
    clerkId: `${FIXTURE_PREFIX}multi`,
    email: "desktop-test-multi@solarlayout.test",
    name: "MULTI",
    keySuffix: "stable",
    entitlements: [
      { productSlug: "pv-layout-free", usedCalculations: 2 },
      { productSlug: "pv-layout-pro", usedCalculations: 2 },
    ],
    projectCount: 0,
    description:
      "Free 3/5 + Pro 8/10 remaining; 0 projects (cheapest-first wallet test)",
  },
  {
    scenario: "EXHAUSTED",
    clerkId: `${FIXTURE_PREFIX}exhausted`,
    email: "desktop-test-exhausted@solarlayout.test",
    name: "EXHAUSTED",
    keySuffix: "stable",
    entitlements: [
      { productSlug: "pv-layout-free", usedCalculations: 5 },
      { productSlug: "pv-layout-pro", usedCalculations: 10 },
    ],
    projectCount: 0,
    description:
      "Free 0/5 + Pro 0/10 (all maxed); 0 projects — POST /v2/usage/report → 402",
  },
  {
    scenario: "DEACTIVATED",
    clerkId: `${FIXTURE_PREFIX}deactivated`,
    email: "desktop-test-deactivated@solarlayout.test",
    name: "DEACTIVATED",
    keySuffix: "stable",
    entitlements: [
      {
        productSlug: "pv-layout-pro",
        usedCalculations: 0,
        deactivated: true,
      },
    ],
    projectCount: 0,
    description:
      "Pro entitlement with deactivatedAt set; B8 should return 0 quota + [] features (kill-switch path)",
  },
  {
    scenario: "QUOTA_EDGE",
    clerkId: `${FIXTURE_PREFIX}quota_edge`,
    email: "desktop-test-quota_edge@solarlayout.test",
    name: "QUOTA_EDGE",
    keySuffix: "stable",
    entitlements: [{ productSlug: "pv-layout-free", usedCalculations: 0 }],
    projectCount: 3,
    description:
      "Free 5/5 + 3 active projects (AT Free quota); POST /v2/projects → 402",
  },
]

async function wipeExisting() {
  const existing = await adminPrisma.user.findMany({
    where: { clerkId: { startsWith: FIXTURE_PREFIX } },
    select: { id: true },
  })
  if (existing.length === 0) return
  const userIds = existing.map((u) => u.id)
  // Order matters: child rows before parents (FKs are RESTRICT).
  await adminPrisma.run.deleteMany({
    where: { project: { userId: { in: userIds } } },
  })
  await adminPrisma.project.deleteMany({ where: { userId: { in: userIds } } })
  await adminPrisma.usageRecord.deleteMany({
    where: { userId: { in: userIds } },
  })
  await adminPrisma.entitlement.deleteMany({
    where: { userId: { in: userIds } },
  })
  await adminPrisma.transaction.deleteMany({
    where: { userId: { in: userIds } },
  })
  await adminPrisma.licenseKey.deleteMany({
    where: { userId: { in: userIds } },
  })
  await adminPrisma.user.deleteMany({ where: { id: { in: userIds } } })
  console.log(`  · wiped ${existing.length} pre-existing fixture(s)`)
}

async function provision(spec: FixtureSpec): Promise<{ key: string }> {
  return await adminPrisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { clerkId: spec.clerkId, email: spec.email, name: spec.name },
    })

    for (const ent of spec.entitlements) {
      const product = await tx.product.findFirstOrThrow({
        where: { slug: ent.productSlug },
      })
      const txn = await tx.transaction.create({
        data: {
          userId: user.id,
          productId: product.id,
          source: ent.deactivated
            ? "MANUAL"
            : ent.productSlug === "pv-layout-free"
              ? "FREE_AUTO"
              : "MANUAL",
          status: "COMPLETED",
          amount: product.priceAmount,
          currency: "usd",
          notes: `desktop-test fixture: ${spec.scenario}`,
        },
      })
      await tx.entitlement.create({
        data: {
          userId: user.id,
          productId: product.id,
          transactionId: txn.id,
          totalCalculations: product.calculations,
          usedCalculations: ent.usedCalculations,
          projectQuota: product.projectQuota,
          deactivatedAt: ent.deactivated ? new Date() : null,
        },
      })
    }

    const key = `sl_live_desktop_test_${spec.scenario}_${spec.keySuffix}`
    const licenseKey = await tx.licenseKey.create({
      data: { userId: user.id, key },
    })

    for (let i = 0; i < spec.projectCount; i++) {
      await tx.project.create({
        data: {
          userId: user.id,
          name: `${spec.scenario} Project ${i + 1}`,
          kmzBlobUrl: `s3://solarlayout-local-projects/projects/${user.id}/kmz/${"0".repeat(63)}${i}.kmz`,
          kmzSha256: `${"0".repeat(63)}${i}`,
        },
      })
    }

    if (spec.withB7Fixture) {
      // Find an active+non-exhausted entitlement to bill the seeded Run against.
      // For PRO_PLUS this is the Pro Plus entitlement.
      const activeEnt = await tx.entitlement.findFirstOrThrow({
        where: { userId: user.id, deactivatedAt: null },
        include: { product: true },
      })

      await tx.project.create({
        data: {
          id: FIXTURE_IDS.PRO_PLUS_PROJECT,
          userId: user.id,
          name: "B7 fixture",
          kmzBlobUrl: `s3://solarlayout-local-projects/projects/${user.id}/kmz/${"f".repeat(64)}.kmz`,
          kmzSha256: "f".repeat(64),
        },
      })

      const usageRecord = await tx.usageRecord.create({
        data: {
          userId: user.id,
          licenseKeyId: licenseKey.id,
          productId: activeEnt.productId,
          featureKey: "plant_layout",
        },
      })

      await tx.run.create({
        data: {
          id: FIXTURE_IDS.PRO_PLUS_RUN,
          projectId: FIXTURE_IDS.PRO_PLUS_PROJECT,
          name: "B7 fixture run",
          params: { rows: 4, cols: 4 },
          inputsSnapshot: {
            kmzSha256: "f".repeat(64),
            note: "B7 verification fixture — desktop hardcodes runId in tests",
          },
          billedFeatureKey: "plant_layout",
          usageRecordId: usageRecord.id,
        },
      })
    }

    return { key }
  })
}

async function main() {
  console.log("Seeding desktop integration test fixtures…")
  await wipeExisting()

  const results: Array<{ spec: FixtureSpec; key: string }> = []
  for (const spec of FIXTURES) {
    const { key } = await provision(spec)
    results.push({ spec, key })
    console.log(`  ✓ ${spec.scenario.padEnd(12)} ${key}`)
  }

  // Markdown summary suitable for pasting into the desktop session.
  console.log("\n" + "=".repeat(78))
  console.log("Copy below this line into the desktop session\n")
  console.log("| Scenario | License key | Seeded state |")
  console.log("|---|---|---|")
  for (const { spec, key } of results) {
    console.log(`| ${spec.scenario} | \`${key}\` | ${spec.description} |`)
  }
  console.log("\nB7 fixture stable IDs (PRO_PLUS user):")
  console.log(`  projectId = ${FIXTURE_IDS.PRO_PLUS_PROJECT}`)
  console.log(`  runId     = ${FIXTURE_IDS.PRO_PLUS_RUN}`)
  console.log("=".repeat(78))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => adminPrisma.$disconnect())
