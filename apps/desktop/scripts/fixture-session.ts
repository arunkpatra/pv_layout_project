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
import { downloadKmzFromS3, uploadKmzToS3 } from "../src/auth/s3upload"

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
): Promise<string | null> {
  // FREE starts with 0 projects + quota 3 → upload a real KMZ via B6 + S3 PUT
  // and create a Project via B11. End-to-end smoke for the whole P1 chain.
  // Returns the new projectId on success (chained into the P2 check below)
  // or null on failure / unexpected shape.
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
      return null
    }
    record(
      "P1 chain (B6 + S3 + B11) on FREE",
      "pass",
      `created ${project.id}; sha=${upload.kmzSha256.slice(0, 8)}…; size=${upload.size}B`
    )
    return project.id
  } catch (err) {
    record("P1 chain (B6 + S3 + B11) on FREE", "fail", fmtErr(err))
    return null
  }
}

async function checkB12ProPlusFixture(
  client: EntitlementsClient
): Promise<void> {
  // PRO_PLUS owns the B7 fixture project → B12 must return ProjectDetail
  // with embedded runs[] + a presigned kmzDownloadUrl. The desktop's P2
  // open-existing-project flow drives exactly this path.
  try {
    const detail = await client.getProjectV2(
      FIXTURE_KEYS.PRO_PLUS,
      B7_FIXTURE.projectId
    )
    if (detail.id !== B7_FIXTURE.projectId) {
      record(
        "B12 PRO_PLUS fixture",
        "fail",
        `id mismatch: got ${detail.id}, expected ${B7_FIXTURE.projectId}`
      )
      return
    }
    if (detail.kmzDownloadUrl === null) {
      record(
        "B12 PRO_PLUS fixture",
        "warn",
        "kmzDownloadUrl=null (S3 bucket env unset on backend?)"
      )
      return
    }
    if (!detail.kmzDownloadUrl.startsWith("https://")) {
      record(
        "B12 PRO_PLUS fixture",
        "warn",
        `kmzDownloadUrl unexpected: ${detail.kmzDownloadUrl}`
      )
      return
    }
    record(
      "B12 PRO_PLUS fixture",
      "pass",
      `id=${detail.id} runs=${detail.runs.length} kmzDownloadUrl=presigned`
    )
  } catch (err) {
    record("B12 PRO_PLUS fixture", "fail", fmtErr(err))
  }
}

async function checkB12NotFound(client: EntitlementsClient): Promise<void> {
  // Cross-user existence is never leaked — FREE asking for PRO_PLUS's
  // fixture project must 404, not 403.
  try {
    await client.getProjectV2(FIXTURE_KEYS.FREE, B7_FIXTURE.projectId)
    record(
      "B12 FREE → 404 (cross-user)",
      "fail",
      "expected 404 NOT_FOUND, got success"
    )
  } catch (err) {
    if (
      err instanceof EntitlementsError &&
      err.status === 404 &&
      err.code === "NOT_FOUND"
    ) {
      record(
        "B12 FREE → 404 (cross-user)",
        "pass",
        `status=404 code=NOT_FOUND`
      )
    } else {
      record("B12 FREE → 404 (cross-user)", "fail", fmtErr(err))
    }
  }
}

async function checkP2EndToEnd(
  client: EntitlementsClient,
  projectId: string
): Promise<void> {
  // Full P2 chain: B12 mint → S3 GET → bytes returned. Mirrors what
  // useOpenProjectMutation does in the desktop. We don't run the sidecar
  // /parse-kmz here (would require booting the sidecar); the byte-level
  // round-trip is the contract under test.
  //
  // Driven against the project we *just* created in checkB11 — that
  // project has a real KMZ in S3 (the upload happened). The B7 fixture's
  // project has a DB row but no S3 blob (B7's purpose is run-result
  // uploads, not project KMZs), so it can't anchor this end-to-end check.
  try {
    const detail = await client.getProjectV2(FIXTURE_KEYS.FREE, projectId)
    if (detail.kmzDownloadUrl === null) {
      record(
        "P2 chain (B12 + S3 GET) on FREE",
        "warn",
        "kmzDownloadUrl=null (S3 bucket env unset on backend?)"
      )
      return
    }
    const bytes = await downloadKmzFromS3({
      url: detail.kmzDownloadUrl,
      fetchImpl: globalThis.fetch as never,
    })
    if (bytes.byteLength === 0) {
      record(
        "P2 chain (B12 + S3 GET) on FREE",
        "warn",
        `downloaded 0 bytes`
      )
      return
    }
    record(
      "P2 chain (B12 + S3 GET) on FREE",
      "pass",
      `${bytes.byteLength}B downloaded; project="${detail.name}"; runs=${detail.runs.length}`
    )
  } catch (err) {
    record("P2 chain (B12 + S3 GET) on FREE", "fail", fmtErr(err))
  }
}

async function checkB16HappyFree(
  client: EntitlementsClient,
  projectId: string
): Promise<void> {
  // B16 atomic: debit + UsageRecord + Run + presigned uploadUrl. We don't
  // run the actual sidecar /layout here (that needs the pvlayout_engine
  // process) — the contract under test is the *API* surface: response
  // shape + atomic debit semantics.
  try {
    const idem = crypto.randomUUID()
    const result = await client.createRunV2(FIXTURE_KEYS.FREE, projectId, {
      name: "fixture-session run",
      params: { rows: 8 },
      inputsSnapshot: { rows: 8 },
      billedFeatureKey: "plant_layout",
      idempotencyKey: idem,
    })
    if (!result.run.id.startsWith("run_")) {
      record(
        "B16 FREE happy",
        "warn",
        `run id without run_ prefix: ${result.run.id}`
      )
      return
    }
    if (result.upload.type !== "layout") {
      record(
        "B16 FREE happy",
        "warn",
        `upload.type=${result.upload.type} expected layout`
      )
      return
    }
    if (!result.upload.uploadUrl.startsWith("https://")) {
      record(
        "B16 FREE happy",
        "warn",
        `upload.uploadUrl not https: ${result.upload.uploadUrl}`
      )
      return
    }
    record(
      "B16 FREE happy",
      "pass",
      `run=${result.run.id} type=${result.upload.type} usageRecordId=${result.run.usageRecordId}`
    )
  } catch (err) {
    record("B16 FREE happy", "fail", fmtErr(err))
  }
}

async function checkB16Idempotency(
  client: EntitlementsClient,
  projectId: string
): Promise<void> {
  // Same idempotency key → same Run, fresh upload URL. Backend's locked
  // contract; the desktop relies on this for retry safety.
  try {
    const idem = crypto.randomUUID()
    const a = await client.createRunV2(FIXTURE_KEYS.FREE, projectId, {
      name: "idempotency-test",
      params: { x: 1 },
      inputsSnapshot: { x: 1 },
      billedFeatureKey: "plant_layout",
      idempotencyKey: idem,
    })
    const b = await client.createRunV2(FIXTURE_KEYS.FREE, projectId, {
      name: "idempotency-test",
      params: { x: 1 },
      inputsSnapshot: { x: 1 },
      billedFeatureKey: "plant_layout",
      idempotencyKey: idem,
    })
    if (a.run.id !== b.run.id) {
      record(
        "B16 idempotency replay",
        "fail",
        `same key returned different runs: ${a.run.id} vs ${b.run.id}`
      )
      return
    }
    if (a.upload.uploadUrl === b.upload.uploadUrl) {
      record(
        "B16 idempotency replay",
        "warn",
        `replay returned the same uploadUrl (expected fresh URL each call)`
      )
      return
    }
    record(
      "B16 idempotency replay",
      "pass",
      `same run=${a.run.id}; fresh uploadUrl on replay`
    )
  } catch (err) {
    record("B16 idempotency replay", "fail", fmtErr(err))
  }
}

async function checkB16Exhausted(
  client: EntitlementsClient,
  exhaustedProjectId: string
): Promise<void> {
  // EXHAUSTED has 0 calcs remaining. B16 must refuse with 402.
  try {
    const idem = crypto.randomUUID()
    await client.createRunV2(FIXTURE_KEYS.EXHAUSTED, exhaustedProjectId, {
      name: "should-not-create",
      params: {},
      inputsSnapshot: {},
      billedFeatureKey: "plant_layout",
      idempotencyKey: idem,
    })
    record(
      "B16 EXHAUSTED → 402",
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
        "B16 EXHAUSTED → 402",
        "pass",
        `status=402 code=PAYMENT_REQUIRED`
      )
    } else {
      record("B16 EXHAUSTED → 402", "fail", fmtErr(err))
    }
  }
}

async function createProjectForKey(
  client: EntitlementsClient,
  key: string,
  bytes: Uint8Array
): Promise<string | null> {
  // Helper for non-FREE keys (e.g. EXHAUSTED) — creates a project under
  // their account so we can drive B16 against a project they own.
  // Quota-edge keys may legitimately fail here; 402 → null + record warn.
  try {
    const upload = await uploadKmzToS3({
      client,
      licenseKey: key,
      bytes,
      fetchImpl: globalThis.fetch as never,
    })
    const project = await client.createProjectV2(key, {
      name: `fixture-session-${Date.now()}`,
      kmzBlobUrl: upload.blobUrl,
      kmzSha256: upload.kmzSha256,
    })
    return project.id
  } catch {
    // Caller will record the failure if it cares.
    return null
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
  const createdProjectId = await checkB11HappyFreeWithUpload(client)

  // ── 6. B12 ProjectDetail + cross-user 404 ───────────────────────────────
  console.log("\n--- B12 ProjectDetail ---")
  await checkB12ProPlusFixture(client)
  await checkB12NotFound(client)

  // ── 7. End-to-end P2 chain (B12 + S3 GET) ───────────────────────────────
  // Chained from P1 above so the project has a real S3 KMZ to download.
  console.log("\n--- P2 end-to-end (B12 + S3 GET) ---")
  if (createdProjectId !== null) {
    await checkP2EndToEnd(client, createdProjectId)
  } else {
    record(
      "P2 chain (B12 + S3 GET) on FREE",
      "warn",
      "skipped — P1 didn't return a projectId to chain from"
    )
  }

  // ── 8. B16 atomic-debit + Run + uploadUrl (P6 backbone) ─────────────────
  // Driven against the just-created FREE project from step 5. Each B16
  // call debits one calc; FREE starts with 5 and we'll consume some
  // through the idempotency replay (1) + the happy-path test (1) + step
  // 9's B9 idempotency (1). Plenty of headroom.
  console.log("\n--- B16 atomic Run create ---")
  if (createdProjectId !== null) {
    await checkB16HappyFree(client, createdProjectId)
    await checkB16Idempotency(client, createdProjectId)
  } else {
    record(
      "B16 FREE happy",
      "warn",
      "skipped — P1 didn't return a projectId"
    )
    record(
      "B16 idempotency replay",
      "warn",
      "skipped — P1 didn't return a projectId"
    )
  }

  // EXHAUSTED → 402: needs a project under the EXHAUSTED user. Spin one
  // up via P1-equivalent flow (uploadKmzToS3 + createProjectV2). Skip if
  // the EXHAUSTED account itself can't even create a project (depends
  // on backend's EXHAUSTED fixture state).
  const kmzBytes = new Uint8Array(await readFile(KMZ_PATH))
  const exhaustedProjectId = await createProjectForKey(
    client,
    FIXTURE_KEYS.EXHAUSTED,
    kmzBytes
  )
  if (exhaustedProjectId !== null) {
    await checkB16Exhausted(client, exhaustedProjectId)
  } else {
    // Possible if EXHAUSTED can't create a project either (backend may
    // refuse via 402 even on B11 if quota=0). Either way, the contract
    // we want to verify is "B16 refuses on no calcs" — note as a warn
    // and move on.
    record(
      "B16 EXHAUSTED → 402",
      "warn",
      "skipped — couldn't pre-create a project under EXHAUSTED user"
    )
  }

  // ── 9. B9 idempotency ───────────────────────────────────────────────────
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
