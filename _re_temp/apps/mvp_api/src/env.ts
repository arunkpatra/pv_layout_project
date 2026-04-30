import { z } from "zod"

const EnvSchema = z.object({
  MVP_DATABASE_URL: z.string().min(1, "MVP_DATABASE_URL is required"),
  PORT: z.string().default("3003"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  // Comma-separated list of allowed CORS origins
  MVP_CORS_ORIGINS: z.string().optional(),
  // S3 — optional for graceful degradation
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().optional(),
  MVP_S3_DOWNLOADS_BUCKET: z.string().optional(),
  MVP_S3_PROJECTS_BUCKET: z.string().optional(),
  // Clerk — used to verify dashboard JWT tokens
  CLERK_SECRET_KEY: z.string().optional(),
  // Stripe
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
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
