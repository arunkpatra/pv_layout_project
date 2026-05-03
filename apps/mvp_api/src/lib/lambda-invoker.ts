/**
 * Lambda invoker — the cross-runtime transport shim.
 *
 * Two methods:
 *   invoke(purpose, payload)  — sync; blocks for the Lambda's return value.
 *   enqueue(purpose, payload) — async; resolves once the work has been
 *                                accepted (cloud: SQS message published;
 *                                local: 202 from server.py, daemon thread
 *                                running the handler).
 *
 * Branches on USE_LOCAL_ENVIRONMENT:
 *   true  → fetch http://localhost:<port>/invoke (per LOCAL_<PURPOSE>_LAMBDA_URL
 *           or the default port from DEFAULT_LOCAL_PORT below).
 *   else  → cloud paths throw NotImplementedError; wired at C4 (invoke ←
 *           AWS SDK Lambda invoke) and C7 (enqueue ← AWS SDK SQS publish).
 *
 * See:
 *   - docs/superpowers/specs/2026-05-03-cloud-offload-architecture.md (D24)
 *   - docs/superpowers/specs/2026-05-03-c3.5-local-dev-transport.md
 *   - python/lambdas/README.md → Local-dev section
 */

export type LambdaPurpose =
  | "smoketest"
  | "parse-kmz"
  | "compute-layout"
  | "detect-water"
  | "compute-energy"

const DEFAULT_LOCAL_PORT: Record<LambdaPurpose, number> = {
  smoketest: 4100,
  "parse-kmz": 4101,
  "compute-layout": 4102,
  "detect-water": 4103,
  "compute-energy": 4104,
}

function isLocal(): boolean {
  return process.env.USE_LOCAL_ENVIRONMENT === "true"
}

function localUrl(purpose: LambdaPurpose): string {
  // Per-Lambda override env var: LOCAL_<PURPOSE>_LAMBDA_URL
  // (with hyphens converted to underscores and uppercased).
  const envKey = `LOCAL_${purpose.replace(/-/g, "_").toUpperCase()}_LAMBDA_URL`
  const override = process.env[envKey]
  if (override && override.length > 0) return override
  return `http://localhost:${DEFAULT_LOCAL_PORT[purpose]}`
}

/**
 * Synchronously invoke a Lambda and await its return value.
 *
 * Use when the caller NEEDS the result back before continuing
 * (e.g., parse-kmz returning parsed boundaries for project creation).
 *
 * Cloud (USE_LOCAL_ENVIRONMENT unset/false): wired in C4 via
 * @aws-sdk/client-lambda using LambdaClient.Invoke({InvocationType:
 * "RequestResponse", FunctionName: `solarlayout-${purpose}-${env}`}).
 */
export async function invoke(
  purpose: LambdaPurpose,
  payload: object,
): Promise<unknown> {
  if (isLocal()) {
    const url = `${localUrl(purpose)}/invoke`
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(
        `lambda-invoker.invoke(${purpose}) failed (${res.status}): ${text}`,
      )
    }
    return res.json()
  }
  throw new Error(
    `lambda-invoker.invoke(${purpose}): AWS SDK Lambda invoke wired in C4`,
  )
}

/**
 * Enqueue async work for a Lambda; resolves once the work is accepted.
 *
 * Use for fire-and-forget where the result is observed via Run.status
 * polling or similar (e.g., compute-layout writing to RDS directly).
 *
 * Cloud (USE_LOCAL_ENVIRONMENT unset/false): wired in C7 via
 * @aws-sdk/client-sqs using SQSClient.SendMessage({QueueUrl: <queue
 * for purpose>, MessageBody: JSON.stringify(payload)}).
 *
 * Local: POSTs to the same /invoke endpoint as invoke(); the Lambda's
 * server.py is hand-coded to its cloud trigger type — sync-mode returns
 * 200 + result (we discard the body); async-mode returns 202 + spawns
 * a daemon thread that runs the handler.
 */
export async function enqueue(
  purpose: LambdaPurpose,
  payload: object,
): Promise<void> {
  if (isLocal()) {
    const url = `${localUrl(purpose)}/invoke`
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    // Accept either 200 (sync-mode server) or 202 (async-mode server).
    if (res.status !== 200 && res.status !== 202) {
      const text = await res.text()
      throw new Error(
        `lambda-invoker.enqueue(${purpose}) failed (${res.status}): ${text}`,
      )
    }
    // Discard body; for async-mode the handler continues in a daemon
    // thread on the server.py side. For sync-mode (smoketest) we paid
    // the latency to wait for the handler — fine for a smoke demo.
    return
  }
  throw new Error(
    `lambda-invoker.enqueue(${purpose}): AWS SDK SQS publish wired in C7`,
  )
}
