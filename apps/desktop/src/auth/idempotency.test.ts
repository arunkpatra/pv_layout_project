/**
 * Tests for the idempotency-key generator + the transient-error retry
 * policy. Each test pinpoints one knob in `idempotency.ts`:
 *
 *   - generateIdempotencyKey: produces RFC 4122 UUIDv4-shaped strings.
 *   - isTransientError: branches correctly across the V2 error matrix.
 *   - withIdempotentRetry: respects maxAttempts, exponential backoff,
 *     and the permanent-vs-transient cutoff. Uses an injected `sleep`
 *     to skip real timers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { EntitlementsError } from "@solarlayout/entitlements-client"
import {
  generateIdempotencyKey,
  isTransientError,
  withIdempotentRetry,
} from "./idempotency"

describe("generateIdempotencyKey", () => {
  it("produces a 36-character UUID v4 string", () => {
    const key = generateIdempotencyKey()
    expect(key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
    expect(key.length).toBe(36)
  })

  it("produces a fresh value on each call (collision-effectively-impossible)", () => {
    const a = generateIdempotencyKey()
    const b = generateIdempotencyKey()
    expect(a).not.toBe(b)
  })
})

describe("isTransientError", () => {
  it("treats network errors (status=0) as transient", () => {
    expect(isTransientError(new EntitlementsError(0, "Failed to fetch"))).toBe(
      true
    )
  })

  it("treats 409 CONFLICT as transient (concurrent decrement race)", () => {
    expect(
      isTransientError(
        new EntitlementsError(409, "race", null, "CONFLICT")
      )
    ).toBe(true)
  })

  it("treats 500/502/503 server errors as transient", () => {
    for (const status of [500, 502, 503, 504]) {
      expect(isTransientError(new EntitlementsError(status, "x"))).toBe(true)
    }
  })

  it("treats 401 UNAUTHORIZED as permanent (don't retry — re-prompt)", () => {
    expect(
      isTransientError(
        new EntitlementsError(401, "bad key", null, "UNAUTHORIZED")
      )
    ).toBe(false)
  })

  it("treats 402 PAYMENT_REQUIRED as permanent (show upsell, don't retry)", () => {
    expect(
      isTransientError(
        new EntitlementsError(402, "exhausted", null, "PAYMENT_REQUIRED")
      )
    ).toBe(false)
  })

  it("treats 400 VALIDATION_ERROR as permanent (bug in our request)", () => {
    expect(
      isTransientError(
        new EntitlementsError(400, "bad body", null, "VALIDATION_ERROR")
      )
    ).toBe(false)
  })

  it("treats 404 NOT_FOUND as permanent", () => {
    expect(
      isTransientError(
        new EntitlementsError(404, "missing", null, "NOT_FOUND")
      )
    ).toBe(false)
  })

  it("treats non-EntitlementsError throws as permanent", () => {
    expect(isTransientError(new Error("schema mismatch"))).toBe(false)
    expect(isTransientError("plain string")).toBe(false)
    expect(isTransientError(null)).toBe(false)
    expect(isTransientError(undefined)).toBe(false)
  })
})

describe("withIdempotentRetry", () => {
  // Fresh per-test no-op sleep so call counts don't bleed between tests.
  // Typed as the actual sleep signature so it's directly assignable to
  // the RetryOptions.sleep slot.
  let noSleep: ReturnType<typeof vi.fn<(ms: number) => Promise<void>>>
  beforeEach(() => {
    noSleep = vi.fn<(ms: number) => Promise<void>>(async () => undefined)
  })

  it("returns the result on first-attempt success without retrying", async () => {
    const attempt = vi.fn(async () => 42)
    const result = await withIdempotentRetry(attempt, { sleep: noSleep })
    expect(result).toBe(42)
    expect(attempt).toHaveBeenCalledTimes(1)
    expect(noSleep).not.toHaveBeenCalled()
  })

  it("retries on transient failure and returns the eventual success", async () => {
    let calls = 0
    const attempt = vi.fn(async () => {
      calls += 1
      if (calls < 3) throw new EntitlementsError(0, "blip")
      return "ok"
    })
    const result = await withIdempotentRetry(attempt, {
      maxAttempts: 3,
      sleep: noSleep,
    })
    expect(result).toBe("ok")
    expect(attempt).toHaveBeenCalledTimes(3)
    // Two retries happened → two sleeps.
    expect(noSleep).toHaveBeenCalledTimes(2)
  })

  it("throws on permanent error WITHOUT retrying", async () => {
    const err = new EntitlementsError(
      402,
      "exhausted",
      null,
      "PAYMENT_REQUIRED"
    )
    const attempt = vi.fn(async () => {
      throw err
    })
    await expect(
      withIdempotentRetry(attempt, { maxAttempts: 5, sleep: noSleep })
    ).rejects.toBe(err)
    expect(attempt).toHaveBeenCalledTimes(1)
    expect(noSleep).not.toHaveBeenCalled()
  })

  it("gives up after maxAttempts and throws the last transient error", async () => {
    const err = new EntitlementsError(0, "still failing")
    const attempt = vi.fn(async () => {
      throw err
    })
    await expect(
      withIdempotentRetry(attempt, { maxAttempts: 3, sleep: noSleep })
    ).rejects.toBe(err)
    expect(attempt).toHaveBeenCalledTimes(3)
    // 3 attempts → 2 sleeps between them.
    expect(noSleep).toHaveBeenCalledTimes(2)
  })

  it("uses exponential backoff capped by maxDelayMs", async () => {
    const sleeps: number[] = []
    const recordSleep = vi.fn(async (ms: number) => {
      sleeps.push(ms)
    })
    const err = new EntitlementsError(0, "blip")
    const attempt = vi.fn(async () => {
      throw err
    })
    await expect(
      withIdempotentRetry(attempt, {
        maxAttempts: 5,
        baseDelayMs: 100,
        maxDelayMs: 300,
        sleep: recordSleep,
      })
    ).rejects.toBe(err)
    // base * 2^i = 100, 200, 400 (cap 300), 800 (cap 300) → [100, 200, 300, 300]
    expect(sleeps).toEqual([100, 200, 300, 300])
  })

  it("permanent error mid-sequence aborts further retries", async () => {
    let calls = 0
    const attempt = vi.fn(async () => {
      calls += 1
      if (calls === 1) throw new EntitlementsError(0, "blip")
      throw new EntitlementsError(401, "bad key", null, "UNAUTHORIZED")
    })
    await expect(
      withIdempotentRetry(attempt, { maxAttempts: 5, sleep: noSleep })
    ).rejects.toThrow("bad key")
    // First attempt blip, retry, hit permanent → stop. Two attempts total.
    expect(attempt).toHaveBeenCalledTimes(2)
  })

  it("non-EntitlementsError throws are permanent (e.g. schema-mismatch)", async () => {
    const attempt = vi.fn(async () => {
      throw new Error("not retryable")
    })
    await expect(
      withIdempotentRetry(attempt, { maxAttempts: 5, sleep: noSleep })
    ).rejects.toThrow("not retryable")
    expect(attempt).toHaveBeenCalledTimes(1)
  })
})
