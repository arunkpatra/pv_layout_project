import { getRequestListener } from "@hono/node-server"
import { app } from "../src/app.js"

// IMPORTANT: Vercel environment variable NODEJS_HELPERS=0 must be set on the
// Vercel project. Without it, Vercel pre-consumes the request body stream
// before this handler runs, causing all POST/PUT/PATCH requests to hang for
// 300 seconds (the function timeout). NODEJS_HELPERS=0 disables Vercel's
// body pre-processing and leaves the raw Node.js stream intact so that
// getRequestListener can read it correctly.
export default getRequestListener(app.fetch)
