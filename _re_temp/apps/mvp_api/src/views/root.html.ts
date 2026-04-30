type CheckStatus = "ok" | "error"

interface HealthStatus {
  database: CheckStatus
  timestamp: string
  environment: string
}

function badge(status: CheckStatus) {
  const styles: Record<CheckStatus, string> = {
    ok: "background:#d1fae5;color:#065f46",
    error: "background:#fee2e2;color:#991b1b",
  }
  const labels: Record<CheckStatus, string> = {
    ok: "ok",
    error: "error",
  }
  return `<span style="display:inline-block;padding:2px 10px;border-radius:999px;font-size:0.8rem;font-weight:600;${styles[status]}">${labels[status]}</span>`
}

export function renderRoot(status: HealthStatus): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MVP API</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #faf8f5; color: #2d2d2d; margin: 0; padding: 48px 24px; }
    .card { max-width: 480px; margin: 0 auto; background: #fff; border: 1px solid #e8e0d6; border-radius: 12px; padding: 32px; }
    h1 { font-size: 1.25rem; font-weight: 700; margin: 0 0 4px; color: #1c1c1c; }
    .subtitle { color: #888; font-size: 0.875rem; margin: 0 0 28px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    th { text-align: left; color: #999; font-weight: 500; padding: 0 0 8px; border-bottom: 1px solid #f0ebe4; }
    td { padding: 10px 0; border-bottom: 1px solid #f7f4f0; vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    td:first-child { color: #555; }
    td:last-child { text-align: right; }
    .env { display: inline-block; background: #fef3c7; color: #92400e; padding: 2px 10px; border-radius: 999px; font-size: 0.8rem; font-weight: 600; }
    .footer { margin-top: 20px; font-size: 0.75rem; color: #bbb; text-align: right; }
  </style>
</head>
<body>
  <div class="card">
    <h1>MVP API</h1>
    <p class="subtitle">SolarLayout MVP &mdash; backend service</p>
    <table>
      <thead>
        <tr><th>Component</th><th>Status</th></tr>
      </thead>
      <tbody>
        <tr><td>API</td><td>${badge("ok")}</td></tr>
        <tr><td>Database</td><td>${badge(status.database)}</td></tr>
        <tr><td>Environment</td><td><span class="env">${status.environment}</span></td></tr>
      </tbody>
    </table>
    <p class="footer">checked at ${status.timestamp}</p>
  </div>
</body>
</html>`
}
