/**
 * Screenshot the live app shell for design verification.
 *
 * Runs `bun run vite:dev` in apps/desktop, waits for the dev server to
 * respond, opens the page in headless Chromium at 1440x900 DPR 1, captures
 * a light screenshot and a dark screenshot, and writes both to
 * docs/design/rendered/app/.
 *
 * The app detects non-Tauri environment and renders the healthy shell
 * with mock values, so this script verifies the S6 visual parity without
 * needing a live sidecar.
 */
import { chromium } from "playwright"
import { spawn } from "node:child_process"
import { mkdir } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, "..", "..", "..")
const desktopDir = resolve(repoRoot, "apps/desktop")
const outDir = resolve(__dirname, "..", "rendered", "app")

const VIEWPORT = { width: 1440, height: 900 }
const DEVICE_SCALE_FACTOR = 1
const DEV_URL = "http://127.0.0.1:1420"

async function waitForServer(url, maxMs = 30_000) {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    try {
      const r = await fetch(url)
      if (r.ok) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`dev server at ${url} did not start within ${maxMs}ms`)
}

async function main() {
  await mkdir(outDir, { recursive: true })

  // Start vite in the desktop app.
  const vite = spawn("bun", ["run", "vite:dev"], {
    cwd: desktopDir,
    env: { ...process.env, BROWSER: "none" },
    stdio: ["ignore", "pipe", "pipe"],
  })
  vite.stdout?.on("data", (d) => process.stdout.write(`[vite] ${d}`))
  vite.stderr?.on("data", (d) => process.stderr.write(`[vite] ${d}`))

  try {
    await waitForServer(DEV_URL)

    const browser = await chromium.launch()
    try {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: DEVICE_SCALE_FACTOR,
      })
      const page = await context.newPage()

      // Light
      await page.goto(DEV_URL)
      await page.waitForSelector("[data-theme]", { timeout: 5000 })
      // Force light regardless of OS.
      await page.evaluate(() => {
        document.documentElement.setAttribute("data-theme", "light")
      })
      await page.waitForTimeout(250)
      await page.screenshot({ path: resolve(outDir, "shell-light.png") })
      console.log("  app/light  →  rendered/app/shell-light.png")

      // Dark
      await page.evaluate(() => {
        document.documentElement.setAttribute("data-theme", "dark")
      })
      await page.waitForTimeout(250)
      await page.screenshot({ path: resolve(outDir, "shell-dark.png") })
      console.log("  app/dark   →  rendered/app/shell-dark.png")

      // ⌘K open
      await page.evaluate(() => {
        document.documentElement.setAttribute("data-theme", "light")
      })
      await page.waitForTimeout(100)
      await page.keyboard.down("Meta")
      await page.keyboard.press("k")
      await page.keyboard.up("Meta")
      await page.waitForTimeout(400)
      await page.screenshot({ path: resolve(outDir, "shell-light-cmdk.png") })
      console.log("  app/light+cmdk  →  rendered/app/shell-light-cmdk.png")

      await context.close()
    } finally {
      await browser.close()
    }
  } finally {
    vite.kill("SIGTERM")
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
