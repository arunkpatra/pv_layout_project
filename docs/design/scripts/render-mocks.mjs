#!/usr/bin/env node
/**
 * Render design mocks to PNG screenshots using headless Chromium.
 *
 * Source-of-truth HTML lives in docs/design/light/. The renderer produces
 * TWO PNGs per file — a light one under rendered/light/, and a dark one
 * under rendered/dark/ by injecting `data-theme="dark"` on the <html>
 * element before the screenshot. Because every color in every mock is
 * driven by a semantic token in tokens.css, the theme flip covers the
 * entire surface without any per-mock edits.
 *
 * Usage:
 *     bun run render                   # render everything
 *     bun run render splash populated  # render specific stem(s)
 */

import { chromium } from "playwright"
import { readdirSync, mkdirSync } from "node:fs"
import { join, resolve, dirname, basename, extname } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const designRoot = resolve(__dirname, "..")
const lightDir = join(designRoot, "light")
const filter = new Set(process.argv.slice(2))

const VIEWPORT = { width: 1440, height: 900 }
// DPR 1 keeps PNGs at 1440×900 — native to the mock design, and safely
// under the 2000px/side limit imposed by Anthropic's many-image requests.
// Earlier setting of 2 produced 2880×1800 PNGs that were rejected in
// conversation context; see docs/gates/SESSION_HANDOFF.md §5.
const DEVICE_SCALE_FACTOR = 1
const THEMES = /** @type {const} */ (["light", "dark"])

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  })

  const htmls = readdirSync(lightDir).filter((f) => f.endsWith(".html"))

  for (const theme of THEMES) {
    const outDir = join(designRoot, "rendered", theme)
    mkdirSync(outDir, { recursive: true })
  }

  for (const file of htmls) {
    const stem = basename(file, extname(file))
    if (filter.size && !filter.has(stem)) continue

    const srcPath = join(lightDir, file)
    const srcUrl = pathToFileURL(srcPath).href

    for (const theme of THEMES) {
      const outPath = join(designRoot, "rendered", theme, `${stem}.png`)
      const page = await context.newPage()
      await page.goto(srcUrl, { waitUntil: "networkidle" })
      // Flip theme AFTER load so the browser has finished parsing the
      // HTML — addInitScript races with the HTML parser in Chromium.
      await page.evaluate((t) => {
        document.documentElement.setAttribute("data-theme", t)
      }, theme)
      await page.waitForTimeout(200)  // repaint + font settle
      await page.screenshot({ path: outPath, fullPage: false })
      await page.close()
      console.log(`  ${theme}/${stem}  →  rendered/${theme}/${stem}.png`)
    }
  }

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
