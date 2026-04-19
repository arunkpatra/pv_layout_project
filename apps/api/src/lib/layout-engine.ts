import { env } from "../env.js"

export function dispatchLayoutJobHttp(versionId: string): void {
  const url = `${env.LAYOUT_ENGINE_URL}/layout`
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version_id: versionId }),
    signal: AbortSignal.timeout(10_000),
  }).catch((err) => {
    console.error("layout engine HTTP dispatch failed", err)
  })
  // intentionally not awaited — fire-and-forget
}
