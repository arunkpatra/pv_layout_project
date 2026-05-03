/**
 * Native-file-picker for the C4 cloud-offload new-project flow.
 *
 * In Tauri:
 *   1. `plugin-dialog.open` → user picks a .kmz / .kml path (or cancels).
 *   2. `plugin-fs.readFile`  → bytes off disk into a Uint8Array.
 *
 * Outside Tauri (vite preview / headless screenshots) this is a no-op
 * that returns null — the design preview doesn't exercise KMZ loading.
 *
 * Pre-C4 this function ALSO POSTed the bytes to the local sidecar's
 * `/parse-kmz` endpoint and returned a `ParsedKMZ`. C4 moved the parse
 * step server-side: the bytes go to S3, mvp_api invokes the parse-kmz
 * Lambda, and the desktop receives the parsed payload from the
 * entitlements-client `parseKmzV2` call. This loader is now strictly a
 * file picker + reader.
 */
import { open as openDialog } from "@tauri-apps/plugin-dialog"
import { readFile } from "@tauri-apps/plugin-fs"

const inTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

export interface OpenKmzResult {
  path: string
  fileName: string
  /**
   * The raw bytes read off disk. Handed to `uploadKmzToS3` by the C4
   * three-stage create flow; the parse step happens server-side.
   */
  bytes: Uint8Array
}

/**
 * Show the native file dialog and read the selected file. Returns
 * `null` if the user cancels.
 */
export async function openKmz(): Promise<OpenKmzResult | null> {
  if (!inTauri()) return null

  const picked = await openDialog({
    multiple: false,
    filters: [{ name: "KMZ / KML", extensions: ["kmz", "kml"] }],
  })
  if (!picked || typeof picked !== "string") return null

  const fileBytes = await readFile(picked)
  const bytes = new Uint8Array(fileBytes)
  const fileName = basename(picked)
  return { path: picked, fileName, bytes }
}

function basename(path: string): string {
  const norm = path.replace(/\\/g, "/")
  const idx = norm.lastIndexOf("/")
  return idx === -1 ? norm : norm.slice(idx + 1)
}
