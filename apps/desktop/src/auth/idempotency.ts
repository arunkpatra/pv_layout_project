/**
 * Idempotency-key generation + transient-retry policy for V2 mutations.
 *
 * Backend's V2 usage-report contract (per the 2026-04-30 handoff):
 *   - Caller generates a fresh UUID v4 per "Generate Layout" intent.
 *   - Caller REUSES the same key on retries — the server's
 *     `@@unique([userId, idempotencyKey])` index dedupes; retries with the
 *     same key return the original response without re-debiting.
 *
 * Transient errors that justify retry (per the backend's V2 error matrix):
 *   - status 0   — network error / DNS / refused / timeout
 *   - status 409 — CONFLICT, "concurrent decrement race"; retry shortly
 *   - status 5xx — server bug; one retry buys back transient blips
 *
 * Permanent errors that must NOT retry (UX impact):
 *   - status 400 (VALIDATION_ERROR)   — bug in our request body
 *   - status 401 (UNAUTHORIZED)       — bad license key; user re-enters
 *   - status 402 (PAYMENT_REQUIRED)   — exhausted; show upsell modal
 *   - status 404 (NOT_FOUND)          — bad route or missing fixture
 *   - any non-EntitlementsError throw — schema mismatch, etc.
 */
import { EntitlementsError } from "@solarlayout/entitlements-client"

/**
 * RFC 4122 UUID v4 — `crypto.randomUUID()` is available in all V2 runtime
 * targets (Bun, Tauri WebView, modern browsers, Vitest's happy-dom).
 * Wrapped here so tests can mock if needed and so the call site reads as
 * "this is the idempotency key" rather than a generic UUID.
 */
export function generateIdempotencyKey(): string {
  return crypto.randomUUID()
}

/**
 * True if an error is worth retrying with the same idempotency key.
 * Anything else fails fast.
 */
export function isTransientError(err: unknown): boolean {
  if (!(err instanceof EntitlementsError)) return false
  if (err.status === 0) return true // network / timeout / DNS
  if (err.status === 409) return true // concurrent decrement race
  if (err.status >= 500 && err.status < 600) return true // server-side blip
  return false
}

export interface RetryOptions {
  /** Max attempts (incl. the first). Default 3. */
  maxAttempts?: number
  /** Base delay before the first retry. Default 200ms. */
  baseDelayMs?: number
  /** Max single-step delay (cap on exponential backoff). Default 2000ms. */
  maxDelayMs?: number
  /** Override sleep impl — tests pass a no-op. */
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Run `attempt` repeatedly until it succeeds or the retry budget is spent.
 * Permanent errors throw immediately without burning further attempts.
 *
 * The same idempotency key MUST be used across all retries — that's the
 * caller's contract. This helper does not generate or carry the key; it
 * just retries the closure verbatim.
 */
export async function withIdempotentRetry<T>(
  attempt: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3
  const baseDelayMs = opts.baseDelayMs ?? 200
  const maxDelayMs = opts.maxDelayMs ?? 2_000
  const sleep = opts.sleep ?? defaultSleep

  let lastErr: unknown
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await attempt()
    } catch (err) {
      lastErr = err
      if (!isTransientError(err)) throw err
      if (i === maxAttempts - 1) break
      const delay = Math.min(baseDelayMs * 2 ** i, maxDelayMs)
      await sleep(delay)
    }
  }
  throw lastErr
}
