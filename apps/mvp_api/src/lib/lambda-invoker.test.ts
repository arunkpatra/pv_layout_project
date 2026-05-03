/**
 * lambda-invoker tests — focused on the cross-runtime boundary that
 * `parse-kmz.test.ts` (and future per-route tests) deliberately mock at
 * the function level. The function-level mocks are correct for unit-
 * testing route logic but they bypass everything below `invoke()` —
 * which means a regression in the cloud branch (e.g. `NotImplemented-
 * Error` left in place by mistake, malformed FunctionName, missing
 * decoder) cannot be caught by route tests alone.
 *
 * These tests inject a fake `LambdaClient` via the test hook
 * `__setLambdaClientForTests` so we exercise the real `invoke()` body:
 *   - LAMBDA_<PURPOSE>_FUNCTION_NAME validation
 *   - FunctionName forwarded to the SDK verbatim
 *   - Payload encoding (Uint8Array UTF-8 JSON bytes)
 *   - Response decoding (Uint8Array → JSON)
 *   - FunctionError detection (defensive — Lambda raised an unhandled
 *     exception outside the handler.py wrapper)
 *
 * They do NOT spin up real AWS — that's the prod-smoke surface.
 */
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from "bun:test"
import {
  LambdaClient,
  type InvokeCommandInput,
  type InvokeCommandOutput,
} from "@aws-sdk/client-lambda"
import { invoke, __setLambdaClientForTests } from "./lambda-invoker.js"

interface FakeSendCall {
  input: InvokeCommandInput
}

function makeFakeClient(
  responder: (input: InvokeCommandInput) => InvokeCommandOutput,
): { client: LambdaClient; calls: FakeSendCall[] } {
  const calls: FakeSendCall[] = []
  // LambdaClient.send is the only surface the invoker uses; minimal
  // fake satisfies the typecheck without instantiating the real SDK
  // credential chain.
  const client = {
    async send(command: { input: InvokeCommandInput }): Promise<InvokeCommandOutput> {
      calls.push({ input: command.input })
      return responder(command.input)
    },
  } as unknown as LambdaClient
  return { client, calls }
}

// AWS SDK types `InvokeCommandOutput.Payload` as `Uint8ArrayBlobAdapter`
// — a Uint8Array subtype with a `transformToString` marker method. The
// invoke() decoder only reads the bytes via `TextDecoder`, so a plain
// Uint8Array works at runtime; we cast through `unknown` here so the
// test fixtures don't need to construct the SDK's adapter wrapper.
type Payload = NonNullable<InvokeCommandOutput["Payload"]>
function encode(obj: unknown): Payload {
  return new TextEncoder().encode(JSON.stringify(obj)) as unknown as Payload
}

const FN_VAR = "LAMBDA_PARSE_KMZ_FUNCTION_NAME"
const TEST_FN_NAME = "solarlayout-parse-kmz-prod"
const ORIGINAL_USE_LOCAL = process.env.USE_LOCAL_ENVIRONMENT
const ORIGINAL_FN_NAME = process.env[FN_VAR]

describe("lambda-invoker.invoke() — cloud branch", () => {
  beforeEach(() => {
    // Force the cloud branch: USE_LOCAL_ENVIRONMENT must NOT be "true".
    delete process.env.USE_LOCAL_ENVIRONMENT
    process.env[FN_VAR] = TEST_FN_NAME
  })

  afterEach(() => {
    if (ORIGINAL_USE_LOCAL === undefined) {
      delete process.env.USE_LOCAL_ENVIRONMENT
    } else {
      process.env.USE_LOCAL_ENVIRONMENT = ORIGINAL_USE_LOCAL
    }
    if (ORIGINAL_FN_NAME === undefined) {
      delete process.env[FN_VAR]
    } else {
      process.env[FN_VAR] = ORIGINAL_FN_NAME
    }
    __setLambdaClientForTests(null)
  })

  it("forwards LAMBDA_<PURPOSE>_FUNCTION_NAME to the SDK as FunctionName", async () => {
    const { client, calls } = makeFakeClient(() => ({
      $metadata: {},
      StatusCode: 200,
      Payload: encode({ ok: true, parsed: { boundaries: [] } }),
    }))
    __setLambdaClientForTests(client)

    const result = await invoke("parse-kmz", { bucket: "b", key: "k" })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.input.FunctionName).toBe(TEST_FN_NAME)
    expect(calls[0]!.input.InvocationType).toBe("RequestResponse")
    expect(result).toEqual({ ok: true, parsed: { boundaries: [] } })
  })

  it("throws a clear config error when LAMBDA_<PURPOSE>_FUNCTION_NAME is unset", async () => {
    delete process.env[FN_VAR]
    let threw = false
    try {
      await invoke("parse-kmz", { bucket: "b", key: "k" })
    } catch (err) {
      threw = true
      const msg = err instanceof Error ? err.message : String(err)
      expect(msg).toContain(FN_VAR)
      expect(msg).toContain("unset")
    }
    expect(threw).toBe(true)
  })

  it("encodes the request payload as Uint8Array UTF-8 JSON bytes", async () => {
    const { client, calls } = makeFakeClient(() => ({
      $metadata: {},
      StatusCode: 200,
      Payload: encode({ ok: true }),
    }))
    __setLambdaClientForTests(client)

    await invoke("parse-kmz", { bucket: "my-bucket", key: "path/to/file.kmz" })
    const sent = calls[0]!.input.Payload as Uint8Array
    expect(sent).toBeInstanceOf(Uint8Array)
    expect(JSON.parse(new TextDecoder().decode(sent))).toEqual({
      bucket: "my-bucket",
      key: "path/to/file.kmz",
    })
  })

  it("decodes the response Payload (Uint8Array UTF-8 JSON) into a JS value", async () => {
    const { client } = makeFakeClient(() => ({
      $metadata: {},
      StatusCode: 200,
      Payload: encode({
        ok: false,
        code: "INVALID_KMZ",
        message: "could not parse",
      }),
    }))
    __setLambdaClientForTests(client)

    const result = await invoke("parse-kmz", { bucket: "b", key: "k" })
    expect(result).toEqual({
      ok: false,
      code: "INVALID_KMZ",
      message: "could not parse",
    })
  })

  it("throws when the Lambda's FunctionError field is set", async () => {
    // Defensive — our handler.py wraps everything and returns its own
    // {ok:false, code, message} envelope, so a FunctionError set means
    // an unhandled crash outside that wrapper. Surface it loudly.
    const { client } = makeFakeClient(() => ({
      $metadata: {},
      StatusCode: 200,
      FunctionError: "Unhandled",
      Payload: encode({
        errorMessage: "Process exited before completing request",
        errorType: "Runtime.ExitError",
      }),
    }))
    __setLambdaClientForTests(client)

    let threw = false
    try {
      await invoke("parse-kmz", { bucket: "b", key: "k" })
    } catch (err) {
      threw = true
      const msg = err instanceof Error ? err.message : String(err)
      expect(msg).toContain("Lambda raised an unhandled exception")
      expect(msg).toContain("Unhandled")
    }
    expect(threw).toBe(true)
  })

  it("re-throws AWS SDK errors verbatim so the caller can log + cleanup", async () => {
    const { client } = makeFakeClient(() => {
      throw new Error("AccessDenied: not authorized to perform lambda:InvokeFunction")
    })
    __setLambdaClientForTests(client)

    let threw = false
    try {
      await invoke("parse-kmz", { bucket: "b", key: "k" })
    } catch (err) {
      threw = true
      const msg = err instanceof Error ? err.message : String(err)
      expect(msg).toContain("AccessDenied")
    }
    expect(threw).toBe(true)
  })
})
