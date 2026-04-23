#!/usr/bin/env node
/**
 * bundle-sidecar.mjs
 *
 * Copies the freshly built pvlayout-engine binary out of
 *   python/pvlayout_engine/dist/pvlayout-engine[.exe]
 * into
 *   apps/desktop/src-tauri/binaries/pvlayout-engine-<target-triple>[.exe]
 *
 * Tauri's bundler expects sidecar binaries to be named with the Rust
 * target triple suffix so a matrix build can ship the correct one per OS.
 *
 * Invoked by `bun run bundle:sidecar`, which tauri.conf.json chains in
 * front of `vite:build` via the `beforeBuildCommand` hook.
 *
 * For dev (`bun run tauri dev`) this script is a no-op — the Rust code
 * spawns `uv run python -m pvlayout_engine.main` directly and no bundled
 * binary is needed.
 */

import { execFileSync } from "node:child_process"
import { copyFileSync, mkdirSync, existsSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const desktopDir = resolve(here, "..")
const repoRoot = resolve(desktopDir, "..", "..")

const isWindows = process.platform === "win32"
const binName = isWindows ? "pvlayout-engine.exe" : "pvlayout-engine"
const srcPath = join(repoRoot, "python", "pvlayout_engine", "dist", binName)

// Resolve the target triple once, from rustc. We deliberately avoid
// hard-coding — a contributor on a different arch should not have to
// edit this script. execFileSync runs rustc directly, no shell.
//
// rustup installs rustc at ~/.cargo/bin/rustc but doesn't modify PATH
// unless the user explicitly sources ~/.cargo/env. We look in PATH first
// and fall back to the default rustup location.
function resolveRustc() {
  for (const candidate of ["rustc", join(homedir(), ".cargo", "bin", "rustc")]) {
    try {
      return execFileSync(candidate, ["-vV"], { encoding: "utf8" })
    } catch {
      // try the next one
    }
  }
  throw new Error(
    "rustc not found on PATH or at ~/.cargo/bin/rustc. " +
      "Install via https://rustup.rs/ or `source $HOME/.cargo/env` before running."
  )
}

let targetTriple
try {
  const out = resolveRustc()
  const match = out.match(/^host:\s*(\S+)\s*$/m)
  if (!match) throw new Error("`rustc -vV` did not contain a host line")
  targetTriple = match[1]
} catch (err) {
  console.error("bundle-sidecar: failed to detect Rust target triple:", err.message)
  process.exit(1)
}

if (!existsSync(srcPath)) {
  console.error(
    `bundle-sidecar: source binary not found at ${srcPath}\n` +
      `  build it first:  cd python/pvlayout_engine && uv run pyinstaller pvlayout-engine.spec --noconfirm --clean`
  )
  process.exit(1)
}

const destDir = join(desktopDir, "src-tauri", "binaries")
mkdirSync(destDir, { recursive: true })

const destName = isWindows
  ? `pvlayout-engine-${targetTriple}.exe`
  : `pvlayout-engine-${targetTriple}`
const destPath = join(destDir, destName)

copyFileSync(srcPath, destPath)

// Preserve exec bit (copyFileSync does on macOS/Linux; no-op on Windows).
console.log(`bundle-sidecar: copied ${srcPath} -> ${destPath}`)
