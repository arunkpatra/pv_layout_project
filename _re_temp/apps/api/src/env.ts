import { z } from "zod"

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PORT: z.string().default("3001"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  // Comma-separated list of allowed CORS origins
  CORS_ORIGINS: z.string().optional(),
  // Future: Clerk auth — optional for now
  CLERK_SECRET_KEY: z.string().optional(),
  // S3 — optional for graceful degradation (upload/download silently no-ops when absent)
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().optional(),
  S3_ARTIFACTS_BUCKET: z.string().optional(),
  // Layout engine dispatch
  USE_LOCAL_ENV: z.string().optional(),
  LAYOUT_ENGINE_URL: z.string().default("http://localhost:8000"),
  SQS_LAYOUT_QUEUE_URL: z.string().optional(),
})

const parsed = EnvSchema.safeParse(process.env)

if (!parsed.success) {
  console.error(
    "Invalid environment variables:",
    JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
  )
  process.exit(1)
}

export type Env = z.infer<typeof EnvSchema>
export const env: Env = parsed.data
