/**
 * Structured debug probes for the S11 interaction layer.
 *
 * Pattern established in the S10.5 demo (see docs/gates/s10_5.md).
 * Every state transition, event, commit, and sidecar round-trip emits a
 * namespaced probe. Cheap when disabled, rich when enabled, consistent
 * prefix for DevTools filtering (`[s11:`).
 *
 * Usage:
 *   import { makeProbe } from "./debug"
 *   const log = makeProbe("rect")
 *   log("state", "anchor set", { lng: 77.614, lat: 12.934 })
 *   log.error("min-size guard failed", { area: 0.4 })
 *
 * Gate (two layers):
 *   1. Build-time kill-switch via `import.meta.env.PROD`. Production
 *      bundles tree-shake the console calls via the statically-evaluable
 *      `if (import.meta.env.PROD) return false` check.
 *   2. Dev runtime toggle via `VITE_INTERACTION_DEBUG=1` (baked at
 *      dev-server start) OR `window.__S11_DEBUG__ === true` (flip in
 *      DevTools). Production ignores both.
 */

export type ProbeKind = "state" | "event" | "mode" | "sidecar" | "lifecycle"

export interface Probe {
  (
    kind: ProbeKind,
    message: string,
    payload?: Record<string, unknown>
  ): void
  error: (message: string, payload?: Record<string, unknown>) => void
}

declare global {
  interface Window {
    __S11_DEBUG__?: boolean
  }
}

const debugEnabled = (): boolean => {
  if (import.meta.env.PROD) return false
  if (import.meta.env.VITE_INTERACTION_DEBUG === "1") return true
  if (typeof window !== "undefined" && window.__S11_DEBUG__ === true) {
    return true
  }
  return false
}

export function makeProbe(namespace: string): Probe {
  const prefix = `[s11:${namespace}]`

  const probe = (
    kind: ProbeKind,
    message: string,
    payload?: Record<string, unknown>
  ) => {
    if (!debugEnabled()) return
    if (payload === undefined) {
      console.debug(prefix, `(${kind})`, message)
    } else {
      console.debug(prefix, `(${kind})`, message, payload)
    }
  }

  const error = (message: string, payload?: Record<string, unknown>) => {
    if (import.meta.env.PROD) return
    if (payload === undefined) {
      console.error(prefix, message)
    } else {
      console.error(prefix, message, payload)
    }
  }

  return Object.assign(probe, { error })
}
