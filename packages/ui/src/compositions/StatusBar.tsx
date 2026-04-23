import { useEffect, useRef, useState, type ReactNode } from "react"
import { Moon, Sun, Monitor } from "lucide-react"
import { useTheme, type ThemeChoice } from "./ThemeProvider"
import { cn } from "../lib/cn"

export interface StatusBarProps {
  sidecarHealthy: boolean
  sidecarLabel?: string
  /** Extra info under status (e.g. CRS, port, "No project loaded"). */
  leftMeta?: ReactNode
  /** Zoom percentage for the map canvas, e.g. 145 for 145%. */
  zoomPercent?: number
  units?: "m" | "ft"
  onUnitsChange?: (u: "m" | "ft") => void
  /** Show FPS counter (dev builds only). */
  showFps?: boolean
}

export function StatusBar({
  sidecarHealthy,
  sidecarLabel,
  leftMeta,
  zoomPercent,
  units = "m",
  onUnitsChange,
  showFps = false,
}: StatusBarProps) {
  return (
    <div className="h-full flex items-center px-[16px] gap-[12px] text-[11px]">
      <div className="flex items-center gap-[6px]">
        <span
          aria-hidden
          className={cn(
            "w-[6px] h-[6px] rounded-full",
            sidecarHealthy ? "bg-[var(--success-default)]" : "bg-[var(--warning-default)]"
          )}
        />
        <span className="text-[var(--text-secondary)]">
          {sidecarLabel ?? (sidecarHealthy ? "Sidecar healthy" : "Sidecar starting…")}
        </span>
      </div>

      {leftMeta && <span className="text-[var(--text-muted)]">{leftMeta}</span>}

      <div className="flex-1" />

      {showFps && <FpsMeter />}

      {typeof zoomPercent === "number" && (
        <span className="text-[var(--text-muted)] tabular-nums">{zoomPercent}%</span>
      )}

      <UnitsToggle value={units} onChange={onUnitsChange} />

      <ThemeSwitcher />
    </div>
  )
}

function UnitsToggle({
  value,
  onChange,
}: {
  value: "m" | "ft"
  onChange?: (u: "m" | "ft") => void
}) {
  return (
    <div className="inline-flex items-center gap-[2px]">
      <span className="text-[var(--text-muted)] mr-[4px]">Units</span>
      {(["m", "ft"] as const).map((u) => (
        <button
          key={u}
          type="button"
          onClick={() => onChange?.(u)}
          aria-pressed={value === u}
          className={cn(
            "px-[6px] h-[18px] rounded-[var(--radius-sm)] transition-colors duration-[120ms]",
            value === u
              ? "bg-[var(--surface-muted)] text-[var(--text-primary)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          )}
        >
          {u}
        </button>
      ))}
    </div>
  )
}

function FpsMeter() {
  const [fps, setFps] = useState<number | null>(null)
  const frameCountRef = useRef(0)
  const lastTickRef = useRef<number>(performance.now())

  useEffect(() => {
    let rafId = 0
    const tick = () => {
      frameCountRef.current += 1
      const now = performance.now()
      const elapsed = now - lastTickRef.current
      if (elapsed >= 1000) {
        setFps(Math.round((frameCountRef.current * 1000) / elapsed))
        frameCountRef.current = 0
        lastTickRef.current = now
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  if (fps == null) return null
  return (
    <span className="text-[var(--text-muted)] tabular-nums font-mono" aria-label={`${fps} FPS`}>
      {fps} fps
    </span>
  )
}

function ThemeSwitcher() {
  const { choice, setChoice, resolved } = useTheme()

  const next = (): ThemeChoice =>
    choice === "system" ? "light" : choice === "light" ? "dark" : "system"

  const Icon = choice === "system" ? Monitor : resolved === "dark" ? Moon : Sun

  return (
    <div className="flex items-center gap-[4px]">
      {resolved === "dark" && (
        <span className="text-[var(--text-muted)] text-[10px] uppercase tracking-[0.06em]">
          Dark preview
        </span>
      )}
      <button
        type="button"
        aria-label={`Theme: ${choice}. Click to cycle.`}
        onClick={() => setChoice(next())}
        className="inline-flex items-center justify-center w-[20px] h-[20px] rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-muted)] transition-colors duration-[120ms]"
      >
        <Icon className="w-[13px] h-[13px]" />
      </button>
    </div>
  )
}
