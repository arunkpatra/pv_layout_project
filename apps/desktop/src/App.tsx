import { useEffect, useState, type JSX } from "react"
import { invoke } from "@tauri-apps/api/core"
import { fetch as tauriFetch } from "@tauri-apps/plugin-http"
import { createSidecarClient } from "@solarlayout/sidecar-client"

/**
 * S5 shell — not the real UI.
 *
 * Flow:
 *   1. invoke("get_sidecar_config") → waits until the Rust side has spawned
 *      pvlayout-engine and parsed its READY line. Returns { port, token, version }.
 *   2. Create a sidecar client and ping /health.
 *   3. Render one of three states: booting, healthy, error.
 *
 * The "booting" state doubles as the S5 splash — a slightly dressed-up
 * placeholder that owns the ~5–10s cold start. Real design system and a
 * separate splash window arrive in S5.5/S6.
 */

type Phase =
  | { kind: "booting"; note?: string }
  | { kind: "healthy"; version: string; port: number }
  | { kind: "error"; detail: string }

interface SidecarConfig {
  host: string
  port: number
  token: string
  version: string
}

export function App(): JSX.Element {
  const [phase, setPhase] = useState<Phase>({ kind: "booting" })

  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        setPhase({ kind: "booting", note: "waiting for sidecar…" })
        const cfg = await invoke<SidecarConfig>("get_sidecar_config")
        if (cancelled) return

        const client = createSidecarClient({
          host: cfg.host,
          port: cfg.port,
          token: cfg.token,
          // Route through Tauri's HTTP plugin (Rust-backed) rather than
          // WKWebView's native fetch. Avoids the cross-origin / ATS
          // restrictions that block `tauri://` → `http://127.0.0.1` in
          // release builds.
          fetchImpl: tauriFetch as typeof fetch,
        })
        const health = await client.health()
        if (cancelled) return

        setPhase({
          kind: "healthy",
          version: health.version,
          port: cfg.port,
        })
      } catch (err) {
        if (cancelled) return
        // Surface both message and stringified error for diagnostic clarity
        // — browser-thrown fetch failures often have empty `.message`.
        const parts: string[] = []
        if (err instanceof Error) {
          parts.push(err.name, err.message, err.stack ?? "")
        } else {
          parts.push(String(err))
        }
        const message = parts.filter(Boolean).join(" | ")
        console.error("Sidecar boot failed:", err)
        setPhase({ kind: "error", detail: message })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main
      style={{
        height: "100%",
        display: "grid",
        placeItems: "center",
        gap: 16,
        padding: 32,
        textAlign: "center",
      }}
    >
      <div>
        <h1 style={{ fontWeight: 500, fontSize: 28, letterSpacing: "-0.02em", margin: 0 }}>
          SolarLayout
        </h1>
        <p style={{ opacity: 0.6, marginTop: 4, fontSize: 13 }}>
          Desktop shell • S5
        </p>
      </div>
      <StatusRow phase={phase} />
    </main>
  )
}

function StatusRow({ phase }: { phase: Phase }): JSX.Element {
  const text = (() => {
    switch (phase.kind) {
      case "booting":
        return phase.note ?? "Starting sidecar…"
      case "healthy":
        return `Sidecar: healthy — pvlayout-engine ${phase.version} (port ${phase.port})`
      case "error":
        return `Sidecar error: ${phase.detail}`
    }
  })()

  const color = (() => {
    switch (phase.kind) {
      case "booting":
        return "#9a9a98"
      case "healthy":
        return "#22863a"
      case "error":
        return "#b42c2c"
    }
  })()

  return (
    <div
      role="status"
      style={{
        fontSize: 14,
        color,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {text}
    </div>
  )
}
