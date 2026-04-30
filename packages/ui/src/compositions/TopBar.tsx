import { Search, PanelLeft, PanelRight } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { SunMark } from "../components/Icon"
import { Kbd } from "../components/Kbd"
import { IconButton } from "../components/IconButton"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "../components/DropdownMenu"
import { cn } from "../lib/cn"

export interface TopBarProps {
  projectName?: ReactNode
  chip?: ReactNode
  onCommandPaletteClick?: () => void
  userInitials?: string
  userName?: string
  userEmail?: string
  /**
   * Masked license key for the account dropdown (e.g. "sl_live_…XYZ4").
   * Rendered under the user name/email block. Hidden when undefined.
   */
  maskedLicenseKey?: string
  /**
   * Compact quota readout for the account dropdown — "{N} calcs · {M} projects
   * remaining" style. The app provides the node so we don't import
   * entitlements types into the UI package. Hidden when undefined.
   */
  quotaSummary?: ReactNode
  onToggleToolRail?: () => void
  onToggleInspector?: () => void
  onViewLicense?: () => void
  onClearLicense?: () => void
  onSettings?: () => void
  /**
   * Opens the upgrade / Buy more flow (typically the marketing site
   * pricing page in an external browser). Menu item only renders when
   * provided.
   */
  onBuyMore?: () => void
}

/**
 * Window-drag behavior:
 *
 *   - Root container and text spans (wordmark, breadcrumb, chip) carry
 *     `data-tauri-drag-region` — Tauri 2's documented opt-in. Tauri's
 *     injected webview handler listens for mousedown on any element with
 *     the attribute and calls `startDragging()` natively; interactive
 *     descendants (button / a / input / [role=button]) are excluded by
 *     the same handler.
 *   - Requires `core:window:allow-start-dragging` in the Tauri capability
 *     (see apps/desktop/src-tauri/capabilities/default.json).
 *
 * macOS: 80px left inset clears the traffic lights. Other OS: 16px.
 */

function useIsMac(): boolean {
  const [isMac, setIsMac] = useState(false)
  useEffect(() => {
    if (typeof navigator === "undefined") return
    setIsMac(/mac/i.test(navigator.userAgent))
  }, [])
  return isMac
}

export function TopBar({
  projectName,
  chip,
  onCommandPaletteClick,
  userInitials = "AP",
  userName,
  userEmail,
  maskedLicenseKey,
  quotaSummary,
  onToggleToolRail,
  onToggleInspector,
  onViewLicense,
  onClearLicense,
  onSettings,
  onBuyMore,
}: TopBarProps) {
  const isMac = useIsMac()
  return (
    <div
      data-tauri-drag-region
      className="h-full flex items-center gap-[12px] pr-[16px] text-[14px]"
      style={{ paddingLeft: isMac ? 80 : 16 }}
    >
      {onToggleToolRail && (
        <IconButton
          aria-label="Toggle tool rail"
          onClick={onToggleToolRail}
          size="md"
          variant="ghost"
        >
          <PanelLeft className="w-[14px] h-[14px]" />
        </IconButton>
      )}

      <div
        data-tauri-drag-region
        className="flex items-center gap-[8px] font-semibold tracking-[-0.02em] text-[var(--text-primary)]"
      >
        <span
          data-tauri-drag-region
          className="w-[16px] h-[16px] flex items-center justify-center text-[var(--accent-default)]"
        >
          <SunMark />
        </span>
        <span data-tauri-drag-region>SolarLayout</span>
      </div>

      <span data-tauri-drag-region className="text-[var(--text-muted)]">
        /
      </span>
      <span
        data-tauri-drag-region
        className={cn(
          "truncate",
          projectName ? "text-[var(--text-primary)]" : "text-[var(--text-muted)] font-normal"
        )}
      >
        {projectName ?? "No project open"}
      </span>
      {chip && (
        <span data-tauri-drag-region className="ml-[2px]">
          {chip}
        </span>
      )}

      <div data-tauri-drag-region className="flex-1" />

      <button
        type="button"
        onClick={onCommandPaletteClick}
        aria-label="Open command palette"
        className="inline-flex items-center gap-[6px] px-[8px] h-[24px] rounded-[var(--radius-sm)] text-[12px] text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-secondary)] transition-colors duration-[120ms]"
      >
        <Search className="w-[14px] h-[14px]" />
        <Kbd>⌘K</Kbd>
      </button>

      {onToggleInspector && (
        <IconButton
          aria-label="Toggle inspector"
          onClick={onToggleInspector}
          size="md"
          variant="ghost"
        >
          <PanelRight className="w-[14px] h-[14px]" />
        </IconButton>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Account menu"
            className="w-[26px] h-[26px] rounded-full bg-[var(--surface-muted)] text-[var(--text-secondary)] text-[11px] font-semibold flex items-center justify-center hover:bg-[var(--border-default)] transition-colors duration-[120ms]"
          >
            {userInitials}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {(userName || userEmail || maskedLicenseKey || quotaSummary) && (
            <>
              <div className="px-[10px] py-[6px] flex flex-col gap-[2px]">
                {userName && (
                  <div className="text-[13px] font-medium text-[var(--text-primary)]">
                    {userName}
                  </div>
                )}
                {userEmail && (
                  <div className="text-[11px] text-[var(--text-muted)]">{userEmail}</div>
                )}
                {maskedLicenseKey && (
                  <div className="text-[11px] text-[var(--text-muted)] font-mono tabular-nums">
                    {maskedLicenseKey}
                  </div>
                )}
                {quotaSummary && <div className="mt-[2px]">{quotaSummary}</div>}
              </div>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuLabel>Account</DropdownMenuLabel>
          <DropdownMenuItem onSelect={onSettings}>
            Settings
            <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onViewLicense}>View license</DropdownMenuItem>
          <DropdownMenuItem onSelect={onClearLicense}>Clear license</DropdownMenuItem>
          {onBuyMore && (
            <DropdownMenuItem onSelect={onBuyMore}>Buy more</DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem>About SolarLayout</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
