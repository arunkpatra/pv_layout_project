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
 *   else  → cloud invoke wired here in C4 via @aws-sdk/client-lambda;
 *           enqueue still throws NotImplementedError (filled at C7).
 *
 * Cloud function-name resolution: one Vercel env var per Lambda,
 * `LAMBDA_<PURPOSE_UPPERCASE>_FUNCTION_NAME` (hyphens in purpose →
 * underscores). Example: `LAMBDA_PARSE_KMZ_FUNCTION_NAME=solarlayout-
 * parse-kmz-prod`. Missing → invoke() throws a clear config error
 * naming the missing var rather than constructing a malformed name.
 *
 * See:
 *   - docs/superpowers/specs/2026-05-03-cloud-offload-architecture.md (D24)
 *   - docs/superpowers/specs/2026-05-03-c3.5-local-dev-transport.md
 *   - python/lambdas/README.md → Local-dev section
 */
import {
  LambdaClient,
  InvokeCommand,
  type InvokeCommandOutput,
} from "@aws-sdk/client-lambda"
import { env } from "../env.js"

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
 * Lazy-singleton LambdaClient. Vercel keeps the function warm across
 * requests within the same instance, so reusing the client avoids
 * re-bootstrapping the credential chain on every invocation. Region
 * sourced from AWS_REGION; absent → SDK default chain.
 *
 * Exported as a settable hook (`__setLambdaClientForTests`) so tests
 * can inject a fake without monkey-patching the module's import graph.
 */
let lambdaClientSingleton: LambdaClient | null = null
function getLambdaClient(): LambdaClient {
  if (!lambdaClientSingleton) {
    lambdaClientSingleton = new LambdaClient({
      ...(env.AWS_REGION ? { region: env.AWS_REGION } : {}),
    })
  }
  return lambdaClientSingleton
}

export function __setLambdaClientForTests(client: LambdaClient | null): void {
  lambdaClientSingleton = client
}

function cloudFunctionName(purpose: LambdaPurpose): string {
  // One env var per Lambda — `LAMBDA_<PURPOSE_UPPERCASE>_FUNCTION_NAME`
  // (hyphens in purpose become underscores). Examples:
  //   LAMBDA_PARSE_KMZ_FUNCTION_NAME=solarlayout-parse-kmz-prod
  //   LAMBDA_COMPUTE_LAYOUT_FUNCTION_NAME=...  (added at C6/C7)
  // Explicit per-Lambda binding mirrors how MVP_S3_PROJECTS_BUCKET works
  // and avoids encoding the function-naming convention in code (renames
  // become a Vercel env-var update, not a code change).
  //
  // Read at call time (not via env.ts's module-load snapshot) so tests
  // can override the value without preloading env. The env.ts Zod
  // schema accepts any string for these vars so reading process.env
  // directly skips no validation.
  const varName = `LAMBDA_${purpose.replace(/-/g, "_").toUpperCase()}_FUNCTION_NAME`
  const fn = process.env[varName]
  if (!fn || fn.length === 0) {
    throw new Error(
      `lambda-invoker: ${varName} is unset. Cloud Lambda invocation ` +
        `requires the function name (e.g. solarlayout-${purpose}-prod) ` +
        `to be set on the deploy environment.`,
    )
  }
  return fn
}

/**
 * Decode the Lambda response Payload (Uint8Array UTF-8 JSON bytes per
 * AWS SDK v3 contract) into a parsed JSON value. Empty payload → null.
 *
 * `FunctionError` set means the Lambda's handler raised an unhandled
 * exception (Lambda's own error envelope, NOT our parse-kmz envelope).
 * Our handler.py wraps everything in try/except and returns its own
 * `{ok: false, code, message, trace}` shape, so this branch is purely
 * defensive against future Lambdas or runtime crashes outside the
 * handler.py wrapping.
 */
function decodeLambdaResponse(
  output: InvokeCommandOutput,
  purpose: LambdaPurpose,
): unknown {
  if (output.FunctionError) {
    const decoded = output.Payload
      ? new TextDecoder("utf-8").decode(output.Payload)
      : ""
    throw new Error(
      `lambda-invoker.invoke(${purpose}): Lambda raised an unhandled ` +
        `exception (${output.FunctionError}): ${decoded.slice(0, 500)}`,
    )
  }
  if (!output.Payload || output.Payload.byteLength === 0) {
    return null
  }
  const text = new TextDecoder("utf-8").decode(output.Payload)
  try {
    return JSON.parse(text)
  } catch (err) {
    throw new Error(
      `lambda-invoker.invoke(${purpose}): response payload was not valid ` +
        `JSON (${err instanceof Error ? err.message : String(err)}): ` +
        `${text.slice(0, 200)}`,
    )
  }
}

/**
 * Synchronously invoke a Lambda and await its return value.
 *
 * Use when the caller NEEDS the result back before continuing
 * (e.g., parse-kmz returning parsed boundaries for project creation).
 *
 * Cloud: @aws-sdk/client-lambda LambdaClient.Invoke with
 * InvocationType "RequestResponse" against function
 * `solarlayout-<purpose>-<LAMBDA_ENV_KEY>`. Response Payload is
 * UTF-8 JSON bytes; decoded into the same shape the local server.py
 * returns so callers (e.g. parse-kmz.service.ts) need no branching.
 *
 * Caller-visible errors:
 *   - LAMBDA_ENV_KEY unset → misconfiguration error
 *   - AWS SDK throws (network, timeout, IAM denied, ResourceNotFound)
 *     → re-thrown verbatim so the caller's catch can log + cleanup
 *   - Lambda raised an unhandled exception (FunctionError set) →
 *     Error("Lambda raised an unhandled exception ...") — purely
 *     defensive; our handler.py wraps everything and returns its own
 *     {ok: false} envelope which goes through the success path
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

  const client = getLambdaClient()
  const functionName = cloudFunctionName(purpose)
  const command = new InvokeCommand({
    FunctionName: functionName,
    InvocationType: "RequestResponse",
    Payload: new TextEncoder().encode(JSON.stringify(payload)),
  })
  const output = await client.send(command)
  return decodeLambdaResponse(output, purpose)
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
