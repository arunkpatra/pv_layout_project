/**
 * Native-file-picker + KMZ-parse flow.
 *
 * In Tauri:
 *   1. `plugin-dialog.open` → user picks a .kmz / .kml path (or cancels).
 *   2. `plugin-fs.readFile`  → bytes off disk into a Uint8Array.
 *   3. Build a Blob and POST to `/parse-kmz` on the sidecar.
 *
 * Outside Tauri (vite preview / headless screenshots) these functions
 * are no-ops that return null — the design preview doesn't exercise KMZ
 * parsing.
 */
import { open as openDialog } from "@tauri-apps/plugin-dialog"
import { readFile } from "@tauri-apps/plugin-fs"
import type {
  ParsedKMZ,
  SidecarClient,
} from "@solarlayout/sidecar-client"

const inTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

export interface OpenKmzResult {
  parsed: ParsedKMZ
  path: string
  fileName: string
  /**
   * The raw bytes read off disk. Returned alongside `parsed` so the
   * post-parity new-project flow (P1) can hand the same bytes to
   * `uploadKmzToS3` without re-reading the file. Always a KMZ payload —
   * .kml inputs aren't supported by B6 (the backend caps and signs the
   * KMZ Content-Type only).
   */
  bytes: Uint8Array
}

/**
 * End-to-end: show the native file dialog, read the selected file, and
 * call the sidecar's /parse-kmz. Returns `null` if the user cancels.
 */
export async function openAndParseKmz(
  sidecar: SidecarClient
): Promise<OpenKmzResult | null> {
  if (!inTauri()) return null

  const picked = await openDialog({
    multiple: false,
    filters: [{ name: "KMZ / KML", extensions: ["kmz", "kml"] }],
  })
  if (!picked || typeof picked !== "string") return null

  const fileBytes = await readFile(picked)
  const bytes = new Uint8Array(fileBytes)
  const fileName = basename(picked)
  const mime =
    fileName.toLowerCase().endsWith(".kml")
      ? "application/vnd.google-earth.kml+xml"
      : "application/vnd.google-earth.kmz"
  const blob = new Blob([bytes], { type: mime })

  const parsed = await sidecar.parseKmz(blob, fileName)
  return { parsed, path: picked, fileName, bytes }
}

function basename(path: string): string {
  const norm = path.replace(/\\/g, "/")
  const idx = norm.lastIndexOf("/")
  return idx === -1 ? norm : norm.slice(idx + 1)
}
