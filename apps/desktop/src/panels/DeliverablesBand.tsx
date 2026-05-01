/**
 * DeliverablesBand — three-format export action row.
 *
 * Lives in App.tsx's sticky parent immediately below SummaryPanel,
 * gated to the Layout tab + a populated layoutResult. Per E1 design
 * decisions:
 *   - Inline action band, no section-header chrome (semantically
 *     distinct from "Layout summary" stats; visually adjacent).
 *   - Three pill-buttons: KMZ / PDF / DXF (D2 — three buttons over
 *     dropdown).
 *   - Hidden entirely when no layoutResult (D3 — no row, no label).
 *   - Native Tauri save dialog → bytes from sidecar → write file.
 *   - User cancel of save dialog is silent (no toast / error).
 *   - Defaults match legacy: DXF include_la + include_cables both
 *     true; PDF energy_params null (energy yield ships in its own
 *     row); edition derived from active license tier.
 *   - Filename pattern (D5/C): `<projectName>-<sanitized runName>.<ext>`
 *     e.g. `complex-plant-layout-Layout-2026-05-01T17-42.kmz`.
 *
 * Status feedback (D7): in-flight spinner inline on the clicked
 * button; completion result on a single line below the row (last
 * success path with reveal-folder action, or last error message).
 * Success line auto-clears after 5s; error stays until next click.
 */
import { Download, Loader2 } from "lucide-react"
import { useEffect, useState } from "react"
import { save } from "@tauri-apps/plugin-dialog"
import { writeFile } from "@tauri-apps/plugin-fs"
import { open as openInShell } from "@tauri-apps/plugin-shell"
import { Button } from "@solarlayout/ui-desktop"
import type {
  LayoutParameters,
  LayoutResult,
  SidecarClient,
} from "@solarlayout/sidecar-client"
import { useLayoutResultStore } from "../state/layoutResult"
import { useLayoutParamsStore } from "../state/layoutParams"
import { useProjectStore } from "../state/project"

// Mirrors the auth/s3upload.ts / project/kmzLoader.ts local helper.
// No central inTauri export today — kept per-file to avoid
// hub-and-spoke coupling on this small predicate.
const inTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

type ExportFormat = "kmz" | "pdf" | "dxf"

interface FormatSpec {
  format: ExportFormat
  label: string
  ext: string
  mimeFilters: { name: string; extensions: string[] }[]
}

const FORMATS: FormatSpec[] = [
  {
    format: "kmz",
    label: "KMZ",
    ext: "kmz",
    mimeFilters: [{ name: "Google Earth", extensions: ["kmz"] }],
  },
  {
    format: "pdf",
    label: "PDF",
    ext: "pdf",
    mimeFilters: [{ name: "PDF", extensions: ["pdf"] }],
  },
  {
    format: "dxf",
    label: "DXF",
    ext: "dxf",
    mimeFilters: [{ name: "AutoCAD", extensions: ["dxf"] }],
  },
]

interface DeliverablesBandProps {
  /** Sidecar client — null while sidecar is booting. Band hides itself
   * when null OR when generating is true (parent run in flight). */
  sidecarClient: SidecarClient | null
  /** True while the parent generate-layout mutation is in flight. */
  generating: boolean
  /** Lower-case license-tier string for PDF render (basic/pro/pro_plus).
   * "Free" maps to basic (most restrictive PDF section set). */
  edition: string
}

/**
 * Renders nothing when there's no layoutResult — the band only exists
 * when there's something to deliver. Caller wraps in a sticky parent.
 */
export function DeliverablesBand({
  sidecarClient,
  generating,
  edition,
}: DeliverablesBandProps) {
  const layoutResult = useLayoutResultStore((s) => s.result)
  const params = useLayoutParamsStore((s) => s.params)
  const currentProject = useProjectStore((s) => s.currentProject)
  const runs = useProjectStore((s) => s.runs)
  const selectedRunId = useProjectStore((s) => s.selectedRunId)

  const [inFlight, setInFlight] = useState<ExportFormat | null>(null)
  const [status, setStatus] = useState<
    | { kind: "saved"; format: ExportFormat; path: string }
    | { kind: "error"; format: ExportFormat; message: string }
    | null
  >(null)

  // Auto-clear success status after 5s. Errors persist until the user
  // clicks something — they're more important to keep visible.
  useEffect(() => {
    if (status?.kind !== "saved") return
    const t = window.setTimeout(() => setStatus(null), 5000)
    return () => window.clearTimeout(t)
  }, [status])

  if (!layoutResult || layoutResult.length === 0) return null

  const selectedRun = runs.find((r) => r.id === selectedRunId)
  const projectName = currentProject?.name ?? "layout"
  const runName = selectedRun?.name ?? null
  const baseFilename = composeFilename(projectName, runName)

  async function handleExport(spec: FormatSpec): Promise<void> {
    if (!sidecarClient) return
    if (inFlight !== null) return

    // Step 1 — native save dialog. User-cancel is silent (returns null).
    let path: string | null
    try {
      path = await save({
        defaultPath: `${baseFilename}.${spec.ext}`,
        filters: spec.mimeFilters,
      })
    } catch (err) {
      // Dialog itself failing is rare (e.g. backend plugin disabled);
      // surface as an error so the user knows their click did something.
      setStatus({
        kind: "error",
        format: spec.format,
        message: extractMessage(err),
      })
      return
    }
    if (!path) return // user cancelled — silent

    setStatus(null)
    setInFlight(spec.format)
    try {
      const bytes = await invokeExport(
        sidecarClient,
        spec.format,
        layoutResult as LayoutResult[],
        params as LayoutParameters,
        edition
      )
      await writeFile(path, bytes)
      setStatus({ kind: "saved", format: spec.format, path })
    } catch (err) {
      setStatus({
        kind: "error",
        format: spec.format,
        message: extractMessage(err),
      })
    } finally {
      setInFlight(null)
    }
  }

  async function handleReveal(path: string): Promise<void> {
    // Open the file's parent directory. Tauri's plugin-shell `open`
    // routes through the OS default handler — Finder on macOS, Explorer
    // on Windows, the user's default file manager on Linux.
    const parent = parentDir(path)
    if (!parent) return
    try {
      await openInShell(parent)
    } catch {
      // Best-effort; if the shell open fails the saved file still exists.
    }
  }

  // Hide entirely when not in a Tauri shell (vite dev w/o Tauri):
  // save / writeFile / openInShell are Tauri-only and would throw on
  // the first click. The component renders elsewhere is fine; the band
  // just doesn't render in browser-only preview mode.
  if (!inTauri()) return null

  const exportsDisabled = generating || sidecarClient === null

  return (
    <div
      className="px-[20px] py-[10px] flex flex-col gap-[6px]
        bg-[var(--surface-ground)] border-b border-[var(--border-subtle)]"
    >
      <div className="flex items-center gap-[8px]">
        <span className="text-[11px] font-semibold tracking-[0.04em] uppercase text-[var(--text-muted)] mr-[4px]">
          Export
        </span>
        {FORMATS.map((spec) => (
          <Button
            key={spec.format}
            type="button"
            variant="subtle"
            size="sm"
            disabled={exportsDisabled || inFlight !== null}
            onClick={() => void handleExport(spec)}
            className="min-w-[64px]"
            aria-label={`Export ${spec.label}`}
          >
            {inFlight === spec.format ? (
              <Loader2
                className="size-[12px] animate-spin"
                aria-hidden
              />
            ) : (
              <Download className="size-[12px]" aria-hidden />
            )}
            <span>{spec.label}</span>
          </Button>
        ))}
      </div>
      {status && (
        <p className="text-[11px] leading-normal flex items-center gap-[6px]">
          {status.kind === "saved" ? (
            <>
              <span className="text-[var(--text-secondary)]">
                Saved {status.format.toUpperCase()} —{" "}
                <span
                  className="text-[var(--text-muted)] truncate inline-block max-w-[280px] align-bottom"
                  title={status.path}
                >
                  {basename(status.path)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => void handleReveal(status.path)}
                className="text-[var(--accent-default)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-default)] rounded-[2px]"
              >
                Reveal
              </button>
            </>
          ) : (
            <span className="text-[var(--error-default)]" title={status.message}>
              {status.format.toUpperCase()} export failed: {status.message}
            </span>
          )}
        </p>
      )}
    </div>
  )
}

/**
 * Build the default-filename prefix per E1 D5(C): project name +
 * sanitized run name. Filesystem-illegal characters (`:` / `/` / `\` /
 * `*` / `?` / `"` / `<` / `>` / `|`) replaced with `-`. Whitespace
 * trimmed + `@` dropped. Run names are auto-generated as
 * `Layout @ 2026-05-01T17:42:00.000Z`; sanitization yields
 * `Layout-2026-05-01T17-42` (also drops the seconds + ms suffix —
 * minute precision is enough to disambiguate same-hour runs).
 */
export function composeFilename(
  projectName: string,
  runName: string | null
): string {
  const project = sanitize(projectName)
  if (!runName) return project || "layout"
  // Strip the seconds + milliseconds suffix from auto-generated run
  // names: `Layout @ 2026-05-01T17:42:00.000Z` → `Layout @ 2026-05-01T17:42`
  const trimmed = runName.replace(
    /([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}):[0-9]{2}\.[0-9]{3}Z?/,
    "$1"
  )
  const run = sanitize(trimmed)
  return `${project}-${run}`
}

function sanitize(s: string): string {
  return s
    .replace(/[/\\:*?"<>|]/g, "-")
    .replace(/@/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function basename(path: string): string {
  const norm = path.replace(/\\/g, "/")
  const i = norm.lastIndexOf("/")
  return i >= 0 ? norm.slice(i + 1) : norm
}

function parentDir(path: string): string | null {
  const norm = path.replace(/\\/g, "/")
  const i = norm.lastIndexOf("/")
  if (i <= 0) return null
  return path.slice(0, path.length - (norm.length - i))
}

function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  return String(err)
}

/**
 * Map an entitlement plan's display name to the sidecar's lowercase
 * Edition string. Sidecar accepts "basic" / "pro" / "pro_plus" only;
 * Free tier maps to "basic" (most restrictive PDF section set —
 * legacy parity).
 *
 * Plan-name source of truth is `apps/mvp_api/src/modules/entitlements/
 * entitlements.service.ts` (sets `planName: e.product.name`); current
 * product names per the seed fixtures are "Free" / "Basic" / "Pro" /
 * "Pro Plus". Anything else also falls back to "basic" defensively.
 */
export function planNameToEdition(planName: string | undefined): string {
  if (!planName) return "basic"
  const normalised = planName.toLowerCase().replace(/\s+/g, "_")
  if (normalised === "pro_plus") return "pro_plus"
  if (normalised === "pro") return "pro"
  if (normalised === "basic") return "basic"
  return "basic"
}

async function invokeExport(
  sidecar: SidecarClient,
  format: ExportFormat,
  results: LayoutResult[],
  params: LayoutParameters,
  edition: string
): Promise<Uint8Array> {
  switch (format) {
    case "kmz":
      return sidecar.exportKmz(results, params)
    case "pdf":
      // E1: energyParams null — energy yield + 25-yr forecast pages
      // wire in PLAN row R3/E2 once energy yield itself ships.
      return sidecar.exportPdf(results, params, edition, null)
    case "dxf":
      // E1 defaults: include both LA + cable layers (legacy parity).
      return sidecar.exportDxf(results, params)
  }
}
