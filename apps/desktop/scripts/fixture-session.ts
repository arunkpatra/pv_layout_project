/**
 * fixture-session.ts — manual runtime fixture sweep against a live mvp_api.
 *
 * NOT a vitest integration test — depends on a running backend + real S3.
 * Run locally with:
 *
 *     bun run apps/desktop/scripts/fixture-session.ts
 *
 * Drives the same `@solarlayout/entitlements-client` the desktop uses, so
 * any drift between the desktop's V2 wire mirrors and the backend's real
 * responses surfaces here. Output is a structured "Findings" report —
 * relayed back to the backend session for joint debugging.
 *
 * Pre-req: backend's `bun run packages/mvp_db/prisma/seed-desktop-test-fixtures.ts`
 * has been run so the 8 stable license keys + B7 fixture project/run exist.
 *
 * Mutations introduced by this script:
 *   - One Project row created on the FREE fixture (kmzSha256 of
 *     phaseboundary2.kmz, content-addressed). Re-running is a no-op for
 *     S3 (idempotent overwrite); the Project row count grows by one
 *     unless the seed is re-run.
 *
 * The seed script is idempotent — re-run after this fixture session if
 * you want a clean slate.
 */
import { readFile } from "node:fs/promises"
import {
  createEntitlementsClient,
  EntitlementsError,
  type EntitlementsClient,
} from "@solarlayout/entitlements-client"
import { uploadKmzToS3 } from "../src/auth/s3upload"

const API_BASE = process.env.SOLARLAYOUT_API_URL ?? "http://localhost:3003"

const FIXTURE_KEYS = {
  FREE: "sl_live_desktop_test_FREE_stable",
  BASIC: "sl_live_desktop_test_BASIC_stable",
  PRO: "sl_live_desktop_test_PRO_stable",
  PRO_PLUS: "sl_live_desktop_test_PRO_PLUS_stable",
  MULTI: "sl_live_desktop_test_MULTI_stable",
  EXHAUSTED: "sl_live_desktop_test_EXHAUSTED_stable",
  DEACTIVATED: "sl_live_desktop_test_DEACTIVATED_stable",
  QUOTA_EDGE: "sl_live_desktop_test_QUOTA_EDGE_stable",
} as const

const B7_FIXTURE = {
  projectId: "prj_b7fixturePROPLUS00000000000000000000",
  runId: "run_b7fixturePROPLUS00000000000000000000",
}

const KMZ_PATH =
  "/Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/tests/golden/kmz/phaseboundary2.kmz"

type Status = "pass" | "fail" | "warn"
interface Finding {
  scenario: string
  status: Status
  detail: string
}
const findings: Finding[] = []

function record(scenario: string, status: Status, detail: string): void {
  findings.push({ scenario, status, detail })
  const tag =
    status === "pass" ? "✓ PASS" : status === "warn" ? "△ WARN" : "✗ FAIL"
  console.log(`${tag.padEnd(8)} ${scenario.padEnd(48)} ${detail}`)
}

function fmtErr(err: unknown): string {
  if (err instanceof EntitlementsError) {
    return `EntitlementsError(status=${err.status}, code=${err.code ?? "—"}): ${err.message}`
  }
  if (err instanceof Error) return `${err.name}: ${err.message}`
  return String(err)
}

// ---------------------------------------------------------------------------
// Each scenario is one async fn — first failure inside doesn't stop others.
// ---------------------------------------------------------------------------

async function checkEntitlements(
  client: EntitlementsClient,
  scenario: string,
  key: string,
  expect: {
    plans?: number
    totalCalcs?: number
    remainingCalcs?: number
    quota?: number
    projectsActive?: number
    licensed?: boolean
    entitlementsActive?: boolean
  }
): Promise<void> {
  try {
    const ent = await client.getEntitlementsV2(key)
    const mismatches: string[] = []
    if (expect.plans !== undefined && ent.plans.length !== expect.plans) {
      mismatches.push(`plans=${ent.plans.length} expected=${expect.plans}`)
    }
    if (
      expect.totalCalcs !== undefined &&
      ent.totalCalculations !== expect.totalCalcs
    ) {
      mismatches.push(
        `totalCalcs=${ent.totalCalculations} expected=${expect.totalCalcs}`
      )
    }
    if (
      expect.remainingCalcs !== undefined &&
      ent.remainingCalculations !== expect.remainingCalcs
    ) {
      mismatches.push(
        `remainingCalcs=${ent.remainingCalculations} expected=${expect.remainingCalcs}`
      )
    }
    if (expect.quota !== undefined && ent.projectQuota !== expect.quota) {
      mismatches.push(`quota=${ent.projectQuota} expected=${expect.quota}`)
    }
    if (
      expect.projectsActive !== undefined &&
      ent.projectsActive !== expect.projectsActive
    ) {
      mismatches.push(
        `projectsActive=${ent.projectsActive} expected=${expect.projectsActive}`
      )
    }
    if (expect.licensed !== undefined && ent.licensed !== expect.licensed) {
      mismatches.push(`licensed=${ent.licensed} expected=${expect.licensed}`)
    }
    if (
      expect.entitlementsActive !== undefined &&
      ent.entitlementsActive !== expect.entitlementsActive
    ) {
      mismatches.push(
        `entitlementsActive=${ent.entitlementsActive} expected=${expect.entitlementsActive}`
      )
    }
    if (mismatches.length > 0) {
      record(scenario, "warn", mismatches.join("; "))
    } else {
      record(
        scenario,
        "pass",
        `licensed=${ent.licensed} entActive=${ent.entitlementsActive} calcs=${ent.usedCalculations}/${ent.totalCalculations} quota=${ent.projectsActive}/${ent.projectQuota}`
      )
    }
  } catch (err) {
    record(scenario, "fail", fmtErr(err))
  }
}

async function checkBadKey401(client: EntitlementsClient): Promise<void> {
  try {
    await client.getEntitlementsV2("sl_live_definitely_not_a_real_key")
    record("AUTH bad key → 401", "fail", "expected throw, got success")
  } catch (err) {
    if (err instanceof EntitlementsError && err.status === 401) {
      record(
        "AUTH bad key → 401",
        "pass",
        `status=${err.status} code=${err.code ?? "—"}`
      )
    } else {
      record("AUTH bad key → 401", "fail", fmtErr(err))
    }
  }
}

async function checkQuotaEdge402(client: EntitlementsClient): Promise<void> {
  // QUOTA_EDGE has 3 active projects at Free quota=3 → POST /v2/projects must 402.
  try {
    await client.createProjectV2(FIXTURE_KEYS.QUOTA_EDGE, {
      name: "Should-not-create",
      kmzBlobUrl: "s3://fake/k",
      kmzSha256: "a".repeat(64),
    })
    record(
      "B11 QUOTA_EDGE → 402",
      "fail",
      "expected 402 PAYMENT_REQUIRED, got 201"
    )
  } catch (err) {
    if (
      err instanceof EntitlementsError &&
      err.status === 402 &&
      err.code === "PAYMENT_REQUIRED"
    ) {
      record(
        "B11 QUOTA_EDGE → 402",
        "pass",
        `status=402 code=PAYMENT_REQUIRED message="${err.message}"`
      )
    } else {
      record("B11 QUOTA_EDGE → 402", "fail", fmtErr(err))
    }
  }
}

async function checkExhausted402(client: EntitlementsClient): Promise<void> {
  // EXHAUSTED has 0 calcs remaining → POST /v2/usage/report must 402.
  try {
    const idempKey = crypto.randomUUID()
    await client.reportUsageV2(
      FIXTURE_KEYS.EXHAUSTED,
      "plant_layout",
      idempKey
    )
    record(
      "B9 EXHAUSTED → 402",
      "fail",
      "expected 402 PAYMENT_REQUIRED, got success"
    )
  } catch (err) {
    if (
      err instanceof EntitlementsError &&
      err.status === 402 &&
      err.code === "PAYMENT_REQUIRED"
    ) {
      record(
        "B9 EXHAUSTED → 402",
        "pass",
        `status=402 code=PAYMENT_REQUIRED`
      )
    } else {
      record("B9 EXHAUSTED → 402", "fail", fmtErr(err))
    }
  }
}

async function checkB7ProPlus(client: EntitlementsClient): Promise<void> {
  // PRO_PLUS owns the B7 fixture project + run → mint should succeed.
  try {
    const result = await client.getRunResultUploadUrl(FIXTURE_KEYS.PRO_PLUS, {
      type: "dxf",
      projectId: B7_FIXTURE.projectId,
      runId: B7_FIXTURE.runId,
      size: 1024,
    })
    if (
      typeof result.uploadUrl !== "string" ||
      !result.uploadUrl.startsWith("https://")
    ) {
      record("B7 PRO_PLUS → 200", "warn", `uploadUrl unexpected: ${result.uploadUrl}`)
      return
    }
    if (typeof result.blobUrl !== "string" || !result.blobUrl.includes("s3://")) {
      record("B7 PRO_PLUS → 200", "warn", `blobUrl unexpected: ${result.blobUrl}`)
      return
    }
    record(
      "B7 PRO_PLUS → 200",
      "pass",
      `presigned uploadUrl + blobUrl=${result.blobUrl}`
    )
  } catch (err) {
    record("B7 PRO_PLUS → 200", "fail", fmtErr(err))
  }
}

async function checkB7Wrongowner(client: EntitlementsClient): Promise<void> {
  // FREE doesn't own the B7 fixture → mint must 404.
  try {
    await client.getRunResultUploadUrl(FIXTURE_KEYS.FREE, {
      type: "dxf",
      projectId: B7_FIXTURE.projectId,
      runId: B7_FIXTURE.runId,
      size: 1024,
    })
    record(
      "B7 wrong-owner → 404",
      "fail",
      "expected 404 NOT_FOUND, got success"
    )
  } catch (err) {
    if (
      err instanceof EntitlementsError &&
      err.status === 404 &&
      err.code === "NOT_FOUND"
    ) {
      record("B7 wrong-owner → 404", "pass", `status=404 code=NOT_FOUND`)
    } else {
      record("B7 wrong-owner → 404", "fail", fmtErr(err))
    }
  }
}

async function checkB11HappyFreeWithUpload(
  client: EntitlementsClient
): Promise<void> {
  // FREE starts with 0 projects + quota 3 → upload a real KMZ via B6 + S3 PUT
  // and create a Project via B11. End-to-end smoke for the whole P1 chain.
  try {
    const bytes = new Uint8Array(await readFile(KMZ_PATH))

    const upload = await uploadKmzToS3({
      client,
      licenseKey: FIXTURE_KEYS.FREE,
      bytes,
      // Bun's globalThis.fetch is fine for the S3 PUT.
      fetchImpl: globalThis.fetch as never,
    })

    const project = await client.createProjectV2(FIXTURE_KEYS.FREE, {
      name: `fixture-session-${Date.now()}`,
      kmzBlobUrl: upload.blobUrl,
      kmzSha256: upload.kmzSha256,
    })

    if (!project.id.startsWith("prj_")) {
      record(
        "P1 chain (B6 + S3 + B11) on FREE",
        "warn",
        `project id without prj_ prefix: ${project.id}`
      )
      return
    }
    record(
      "P1 chain (B6 + S3 + B11) on FREE",
      "pass",
      `created ${project.id}; sha=${upload.kmzSha256.slice(0, 8)}…; size=${upload.size}B`
    )
  } catch (err) {
    record("P1 chain (B6 + S3 + B11) on FREE", "fail", fmtErr(err))
  }
}

async function checkB9HappyFree(client: EntitlementsClient): Promise<void> {
  // FREE starts with 5/5 calcs. One usage/report should succeed; running it
  // again with the SAME idempotency key should NOT double-debit. We
  // exercise both legs.
  const idempKey = crypto.randomUUID()
  try {
    const r1 = await client.reportUsageV2(
      FIXTURE_KEYS.FREE,
      "plant_layout",
      idempKey
    )
    const r2 = await client.reportUsageV2(
      FIXTURE_KEYS.FREE,
      "plant_layout",
      idempKey
    )
    if (r1.remainingCalculations !== r2.remainingCalculations) {
      record(
        "B9 FREE idempotency",
        "fail",
        `double-debit: r1.remaining=${r1.remainingCalculations} r2.remaining=${r2.remainingCalculations}`
      )
      return
    }
    record(
      "B9 FREE idempotency",
      "pass",
      `same remaining=${r2.remainingCalculations} after 2 reports with same key`
    )
  } catch (err) {
    record("B9 FREE idempotency", "fail", fmtErr(err))
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(
    `\n=== Fixture session against ${API_BASE} ===\n` +
      `(${new Date().toISOString()})\n`
  )

  const client = createEntitlementsClient({
    baseUrl: API_BASE,
    fetchImpl: globalThis.fetch as never,
  })

  // ── 1. Entitlements for all 8 fixtures ──────────────────────────────────
  console.log("--- B8 — GET /v2/entitlements (all 8 fixtures) ---")
  // licensed/entitlementsActive semantics (locked with backend 2026-04-30):
  //   licensed=true                              → normal compute
  //   licensed=false && entitlementsActive=true  → exhausted (Buy more)
  //   licensed=false && entitlementsActive=false → deactivated (Contact support)
  await checkEntitlements(client, "B8 FREE", FIXTURE_KEYS.FREE, {
    plans: 1,
    totalCalcs: 5,
    remainingCalcs: 5,
    quota: 3,
    projectsActive: 0,
    licensed: true,
    entitlementsActive: true,
  })
  await checkEntitlements(client, "B8 BASIC", FIXTURE_KEYS.BASIC, {
    quota: 5,
    projectsActive: 0,
    licensed: true,
    entitlementsActive: true,
  })
  await checkEntitlements(client, "B8 PRO", FIXTURE_KEYS.PRO, {
    quota: 10,
    projectsActive: 0,
    licensed: true,
    entitlementsActive: true,
  })
  await checkEntitlements(client, "B8 PRO_PLUS", FIXTURE_KEYS.PRO_PLUS, {
    quota: 15,
    projectsActive: 1, // B7 fixture project
    licensed: true,
    entitlementsActive: true,
  })
  await checkEntitlements(client, "B8 MULTI", FIXTURE_KEYS.MULTI, {
    licensed: true,
    entitlementsActive: true,
  })
  await checkEntitlements(client, "B8 EXHAUSTED", FIXTURE_KEYS.EXHAUSTED, {
    remainingCalcs: 0,
    licensed: false, // out of credits
    entitlementsActive: true, // entitlement still active, just exhausted
  })
  await checkEntitlements(client, "B8 DEACTIVATED", FIXTURE_KEYS.DEACTIVATED, {
    quota: 0,
    licensed: false,
    entitlementsActive: false, // entitlement deactivated → "Contact support"
  })
  await checkEntitlements(client, "B8 QUOTA_EDGE", FIXTURE_KEYS.QUOTA_EDGE, {
    quota: 3,
    projectsActive: 3, // at the ceiling
    licensed: true,
    entitlementsActive: true,
  })

  // ── 2. Auth ─────────────────────────────────────────────────────────────
  console.log("\n--- AUTH ---")
  await checkBadKey401(client)

  // ── 3. Quota / payment-required paths ───────────────────────────────────
  console.log("\n--- 402 PAYMENT_REQUIRED paths ---")
  await checkQuotaEdge402(client)
  await checkExhausted402(client)

  // ── 4. B7 ownership rule ────────────────────────────────────────────────
  console.log("\n--- B7 ownership ---")
  await checkB7ProPlus(client)
  await checkB7Wrongowner(client)

  // ── 5. End-to-end P1 chain (B6 + S3 + B11) ──────────────────────────────
  console.log("\n--- P1 end-to-end (B6 + S3 PUT + B11) ---")
  await checkB11HappyFreeWithUpload(client)

  // ── 6. B9 idempotency ───────────────────────────────────────────────────
  console.log("\n--- B9 idempotency ---")
  await checkB9HappyFree(client)

  // ── Summary ─────────────────────────────────────────────────────────────
  const pass = findings.filter((f) => f.status === "pass").length
  const warn = findings.filter((f) => f.status === "warn").length
  const fail = findings.filter((f) => f.status === "fail").length
  console.log(`\n=== Summary: ${pass} pass / ${warn} warn / ${fail} fail ===`)

  if (warn + fail > 0) {
    console.log("\nFriction points:")
    for (const f of findings) {
      if (f.status !== "pass") {
        console.log(`  [${f.status.toUpperCase()}] ${f.scenario}: ${f.detail}`)
      }
    }
  }

  process.exit(fail === 0 ? 0 : 1)
}

void main()
