import { env } from "./env.js"
import { app } from "./app.js"

// ─── Start Server ──────────────────────────────────────────────────────────────

const port = Number(env.PORT)

console.log(
  JSON.stringify({
    level: "info",
    message: `Renewable Energy API starting on port ${port}`,
    env: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  }),
)

export default { port, fetch: app.fetch }
