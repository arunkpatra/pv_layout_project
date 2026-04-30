# MVP Spike 2 — DB + API + Download Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold `packages/mvp_db` (Prisma + Postgres) and `apps/mvp_api` (Hono on Bun), implement the download registration endpoint, and wire the frontend DownloadModal to call the real API and trigger an exe file download from S3.

**Architecture:** `packages/mvp_db` is an independent Prisma package with its own Postgres database (`mvp_db`, port 5433 locally) and semantic ID extensions copied from `packages/db`. `apps/mvp_api` is a Hono v4 server on Bun (port 3003) that mirrors `apps/api` patterns but has no auth middleware. The frontend `apps/mvp_web` calls the API to register downloads and receives a presigned S3 URL.

**Tech Stack:** Prisma v7 + @prisma/adapter-pg, Hono v4, Bun runtime, Zod validation, AWS S3 presigned URLs, Next.js 16 App Router

---

## Task 1: Scaffold `packages/mvp_db`

**Files:**
- `packages/mvp_db/package.json`
- `packages/mvp_db/tsconfig.json`
- `packages/mvp_db/bunfig.toml`
- `packages/mvp_db/prisma.config.ts`
- `packages/mvp_db/prisma/schema.prisma`
- `packages/mvp_db/src/index.ts`
- `packages/mvp_db/src/extensions/index.ts`
- `packages/mvp_db/src/extensions/semantic-id/id-generator.ts`
- `packages/mvp_db/src/extensions/semantic-id/id-generator.test.ts`
- `packages/mvp_db/src/extensions/semantic-id/id-prefixes.ts`
- `packages/mvp_db/src/extensions/semantic-id/semantic-id.extension.ts`
- `packages/mvp_db/src/extensions/strict-id/strict-id.extension.ts`

### Steps

- [ ] **1.1** Create `packages/mvp_db/package.json`:

```json
{
  "name": "@renewable-energy/mvp-db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/src/index.js",
  "exports": {
    ".": "./dist/src/index.js"
  },
  "scripts": {
    "build": "tsc --build",
    "typecheck": "tsc --noEmit",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:studio": "prisma studio",
    "db:status": "prisma migrate status",
    "db:validate": "prisma validate",
    "test": "bun test"
  },
  "dependencies": {
    "@prisma/adapter-pg": "^7.7.0",
    "@prisma/client": "^7.7.0",
    "pg": "^8.0.0"
  },
  "devDependencies": {
    "@renewable-energy/typescript-config": "workspace:*",
    "@types/bun": "^1.3.12",
    "@types/node": "^22.0.0",
    "prisma": "^7.7.0",
    "typescript": "^5.9.3"
  }
}
```

- [ ] **1.2** Create `packages/mvp_db/tsconfig.json`:

```json
{
  "extends": "@renewable-energy/typescript-config/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": ".",
    "composite": true,
    "incremental": true
  },
  "include": ["src", "prisma.config.ts"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **1.3** Create `packages/mvp_db/bunfig.toml`:

```toml
[test]
preload = ["./src/tests/preload.ts"]
```

- [ ] **1.4** Create `packages/mvp_db/src/tests/preload.ts`:

```typescript
// Test preload: prevents PrismaClient from attempting a real DB connection.
process.env["MVP_DATABASE_URL"] =
  process.env["MVP_DATABASE_URL"] ??
  "postgresql://test:test@localhost/test_placeholder"
```

- [ ] **1.5** Create `packages/mvp_db/prisma.config.ts`:

```typescript
// prisma.config.ts — Prisma v7 configuration file.
//
// The datasource url is defined here rather than in schema.prisma, which is
// the Prisma v7 recommended approach for keeping secrets out of schema files.

import { defineConfig } from "prisma/config"

export default defineConfig({
  schema: "./prisma/",
  migrations: {
    path: "./prisma/migrations",
  },
  datasource: {
    url:
      process.env.MVP_DATABASE_URL ??
      "postgresql://mvp:mvp@localhost:5433/mvp_db",
  },
})
```

- [ ] **1.6** Create `packages/mvp_db/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

model DownloadRegistration {
  id        String   @id @default("")
  name      String
  email     String
  mobile    String?
  product   String
  ipAddress String
  createdAt DateTime @default(now())

  @@map("download_registrations")
}
```

- [ ] **1.7** Create `packages/mvp_db/src/extensions/semantic-id/id-generator.ts`:

```typescript
import { randomBytes } from "crypto"

function generateRandomAlphanumeric(length: number): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let result = ""
  const bytes = randomBytes(length)
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i]! % chars.length]
  }
  return result
}

/**
 * Generate a semantic ID with fixed total length of 40 characters.
 * Format: {prefix}_{random_alphanumeric}
 * Total length is always 40 characters regardless of prefix length.
 *
 * @example generateSemanticId("drg") -> "drg_aBc3dE9fG2hI5jK8lM1nO4pQ7rS0tUvWxYz"
 */
export function generateSemanticId(prefix: string): string {
  const TOTAL_LENGTH = 40
  const prefixWithUnderscore = `${prefix}_`
  const remainingLength = TOTAL_LENGTH - prefixWithUnderscore.length

  if (remainingLength <= 0) {
    throw new Error(
      `Prefix "${prefix}" is too long. Total ID length must be ${TOTAL_LENGTH} characters.`
    )
  }

  const randomSuffix = generateRandomAlphanumeric(remainingLength)
  const semanticId = `${prefixWithUnderscore}${randomSuffix}`

  if (semanticId.length !== TOTAL_LENGTH) {
    throw new Error(
      `Generated semantic ID length (${semanticId.length}) does not match required (${TOTAL_LENGTH})`
    )
  }

  return semanticId
}
```

- [ ] **1.8** Create `packages/mvp_db/src/extensions/semantic-id/id-prefixes.ts`:

```typescript
/**
 * MVP semantic ID prefix registry.
 * Maps Prisma model names to their entity prefix.
 *
 * Format: {prefix}_{base62_random} = 40 chars total
 * The prefix must be short enough to leave at least 8 chars for the suffix.
 */
export const ID_PREFIXES: Record<string, string> = {
  DownloadRegistration: "drg",
}
```

- [ ] **1.9** Create `packages/mvp_db/src/extensions/semantic-id/semantic-id.extension.ts`:

```typescript
import { generateSemanticId } from "./id-generator.js"
import { ID_PREFIXES } from "./id-prefixes.js"

/**
 * Prisma extension that automatically generates semantic IDs on create/upsert.
 * Intercepts create, createMany, and upsert operations.
 * If no ID is provided (or @default("") yields empty string), generates
 * a semantic ID using the model's prefix from ID_PREFIXES.
 */
export const semanticIdExtension = {
  name: "mvp-semantic-ids",
  query: {
    $allModels: {
      async create({
        args,
        model,
        query,
      }: {
        args: any
        model: string
        query: any
      }) {
        if (!args.data?.id) {
          const prefix =
            ID_PREFIXES[model] ??
            (console.warn(
              `[SEMANTIC-ID] No prefix registered for model "${model}" — using "unk"`
            ),
            "unk")
          args.data.id = generateSemanticId(prefix)
        }
        return query(args)
      },

      async createMany({
        args,
        model,
        query,
      }: {
        args: any
        model: string
        query: any
      }) {
        if (args.data && Array.isArray(args.data)) {
          const prefix =
            ID_PREFIXES[model] ??
            (console.warn(
              `[SEMANTIC-ID] No prefix registered for model "${model}" — using "unk"`
            ),
            "unk")
          args.data = args.data.map((item: any) => {
            if (!item.id) {
              item.id = generateSemanticId(prefix)
            }
            return item
          })
        }
        return query(args)
      },

      async upsert({
        args,
        model,
        query,
      }: {
        args: any
        model: string
        query: any
      }) {
        if (args.create && !args.create.id) {
          const prefix =
            ID_PREFIXES[model] ??
            (console.warn(
              `[SEMANTIC-ID] No prefix registered for model "${model}" — using "unk"`
            ),
            "unk")
          args.create.id = generateSemanticId(prefix)
        }
        return query(args)
      },
    },
  },
} as const
```

- [ ] **1.10** Create `packages/mvp_db/src/extensions/strict-id/strict-id.extension.ts`:

```typescript
/**
 * Prisma extension that prevents manual ID injection.
 * Removes any manually-provided 'id' field from create/createMany/upsert
 * and logs a warning. All IDs must be generated by semanticIdExtension.
 *
 * Applied BEFORE semanticIdExtension in the $extends chain so that
 * manually-provided IDs are stripped before generation runs.
 */
export const strictIdExtension = {
  name: "mvp-id-enforcement",
  query: {
    $allModels: {
      async create({
        args,
        model,
        query,
      }: {
        args: any
        model: string
        query: any
      }) {
        if (args.data?.id) {
          console.warn(
            `[ID-ENFORCEMENT] Manual ID provided for ${model} create — using semantic ID instead`
          )
          delete args.data.id
        }
        return query(args)
      },

      async createMany({
        args,
        model,
        query,
      }: {
        args: any
        model: string
        query: any
      }) {
        if (args.data && Array.isArray(args.data)) {
          args.data = args.data.map((item: any) => {
            if (item.id) {
              console.warn(
                `[ID-ENFORCEMENT] Manual ID provided for ${model} createMany — using semantic ID instead`
              )
              const { id, ...rest } = item
              return rest
            }
            return item
          })
        }
        return query(args)
      },

      async upsert({
        args,
        model,
        query,
      }: {
        args: any
        model: string
        query: any
      }) {
        if (args.create?.id) {
          console.warn(
            `[ID-ENFORCEMENT] Manual ID provided for ${model} upsert.create — using semantic ID instead`
          )
          delete args.create.id
        }
        return query(args)
      },
    },
  },
} as const
```

- [ ] **1.11** Create `packages/mvp_db/src/extensions/index.ts`:

```typescript
export { semanticIdExtension } from "./semantic-id/semantic-id.extension.js"
export { strictIdExtension } from "./strict-id/strict-id.extension.js"
```

- [ ] **1.12** Create `packages/mvp_db/src/index.ts`:

```typescript
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { semanticIdExtension, strictIdExtension } from "./extensions/index.js"

const connectionString =
  process.env["MVP_DATABASE_URL"] ??
  "postgresql://mvp:mvp@localhost:5433/mvp_db"

const adapter = new PrismaPg({ connectionString })

const rawClient = new PrismaClient({ adapter, log: ["error", "warn"] })

// ─── Extension chain ──────────────────────────────────────────────────────────
//
// strictIdExtension   → removes manually-provided IDs (logs warning)
// semanticIdExtension → generates prefixed IDs (drg_abc..., etc.)
//
// appPrisma:   strict + semantic — all application code paths
// adminPrisma: semantic only    — seed scripts / admin utilities

/**
 * appPrisma — strict ID enforcement + semantic IDs.
 * Use in: all API services, middleware, application code.
 */
export const appPrisma = rawClient
  .$extends(strictIdExtension)
  .$extends(semanticIdExtension)

/**
 * adminPrisma — semantic IDs only (no strict ID enforcement).
 * Use in: seed scripts, migration utilities.
 */
export const adminPrisma = rawClient.$extends(semanticIdExtension)

/**
 * prisma — alias for appPrisma. Default export for convenience.
 */
export const prisma = appPrisma

export type { Prisma } from "@prisma/client"
```

- [ ] **1.13** Create `packages/mvp_db/src/extensions/semantic-id/id-generator.test.ts`:

```typescript
import { describe, expect, test } from "bun:test"
import { generateSemanticId } from "./id-generator.js"

describe("generateSemanticId", () => {
  test("produces exactly 40 characters", () => {
    expect(generateSemanticId("drg").length).toBe(40)
  })

  test("starts with the given prefix and underscore", () => {
    const id = generateSemanticId("drg")
    expect(id.startsWith("drg_")).toBe(true)
  })

  test("suffix is alphanumeric only (base62)", () => {
    const id = generateSemanticId("drg")
    const suffix = id.slice("drg_".length)
    expect(/^[A-Za-z0-9]+$/.test(suffix)).toBe(true)
  })

  test("generates unique IDs", () => {
    const ids = new Set(
      Array.from({ length: 100 }, () => generateSemanticId("drg"))
    )
    expect(ids.size).toBe(100)
  })

  test("works for all registered prefixes", () => {
    const prefixes = ["drg"]
    for (const prefix of prefixes) {
      const id = generateSemanticId(prefix)
      expect(id.length).toBe(40)
      expect(id.startsWith(`${prefix}_`)).toBe(true)
    }
  })

  test("throws when prefix is too long", () => {
    const tooLong = "a".repeat(40)
    expect(() => generateSemanticId(tooLong)).toThrow()
  })
})
```

- [ ] **1.14** Run install and generate:

```bash
cd /Users/arunkpatra/codebase/renewable_energy && bun install
```

- [ ] **1.15** Run tests for the new package:

```bash
cd /Users/arunkpatra/codebase/renewable_energy/packages/mvp_db && bun test
```

- [ ] **1.16** Commit:

```bash
git add packages/mvp_db/ && git commit -m "feat(mvp_db): scaffold Prisma package with semantic ID extensions"
```

---

## Task 2: Update Infrastructure

**Files:**
- `docker-compose.yml`
- `turbo.json`
- `.env` (root)

### Steps

- [ ] **2.1** Update `docker-compose.yml` to add the `mvp_postgres` service. The full file should become:

```yaml
services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-renewable}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-renewable}
      POSTGRES_DB: ${POSTGRES_DB:-renewable_energy}
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-renewable}"]
      interval: 5s
      timeout: 5s
      retries: 5

  mvp_postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${MVP_POSTGRES_USER:-mvp}
      POSTGRES_PASSWORD: ${MVP_POSTGRES_PASSWORD:-mvp}
      POSTGRES_DB: ${MVP_POSTGRES_DB:-mvp_db}
    ports:
      - "${MVP_POSTGRES_PORT:-5433}:5432"
    volumes:
      - mvp_postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${MVP_POSTGRES_USER:-mvp}"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  mvp_postgres_data:
```

- [ ] **2.2** Update `turbo.json` to add `@renewable-energy/mvp-db` tasks and `@renewable-energy/mvp-api` tasks. Add the following entries to the `"tasks"` object:

```jsonc
// Add after the existing "db:studio" task:

"@renewable-energy/mvp-db#typecheck": {
  "dependsOn": ["mvp-db:generate"],
  "outputs": []
},
"@renewable-energy/mvp-db#build": {
  "dependsOn": ["mvp-db:generate"],
  "outputs": ["dist/**", "tsconfig.tsbuildinfo"],
  "env": [
    "MVP_DATABASE_URL",
    "MVP_S3_DOWNLOADS_BUCKET",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_REGION"
  ]
},
"mvp-db:generate": {
  "inputs": ["prisma/**/*.prisma", "prisma.config.ts"],
  "outputs": ["node_modules/.prisma/**"],
  "cache": false
},
"mvp-db:validate": {
  "inputs": ["prisma/**/*.prisma", "prisma.config.ts"],
  "outputs": []
},
"mvp-db:status": {
  "dependsOn": ["mvp-db:generate"],
  "cache": false
},
"mvp-db:migrate": {
  "dependsOn": ["mvp-db:generate"],
  "cache": false
},
"mvp-db:studio": {
  "dependsOn": ["mvp-db:generate"],
  "persistent": true,
  "cache": false
},
"@renewable-energy/mvp-api#build": {
  "dependsOn": ["^build"],
  "outputs": ["dist/**"],
  "env": [
    "MVP_DATABASE_URL",
    "CORS_ORIGINS",
    "NODE_ENV",
    "PORT",
    "NODEJS_HELPERS",
    "MVP_S3_DOWNLOADS_BUCKET",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_REGION"
  ]
},
"@renewable-energy/mvp-api#typecheck": {
  "dependsOn": ["^build"],
  "outputs": []
}
```

Also add `mvp-db:generate`, `mvp-db:migrate`, `mvp-db:studio`, `mvp-db:status`, and `mvp-db:validate` scripts to the root `package.json`:

```jsonc
// Add to root package.json scripts:
"mvp-db:generate": "turbo mvp-db:generate",
"mvp-db:migrate": "turbo mvp-db:migrate",
"mvp-db:studio": "turbo mvp-db:studio",
"mvp-db:status": "turbo mvp-db:status",
"mvp-db:validate": "turbo mvp-db:validate"
```

- [ ] **2.3** Update root `.env` to add MVP-specific variables. Append the following lines:

```bash
# MVP Database
MVP_POSTGRES_USER=mvp
MVP_POSTGRES_PASSWORD=mvp
MVP_POSTGRES_DB=mvp_db
MVP_DATABASE_URL="postgresql://mvp:mvp@localhost:5433/mvp_db"

# MVP S3
MVP_S3_DOWNLOADS_BUCKET=solarlayout-downloads
```

- [ ] **2.4** Start docker services and verify:

```bash
cd /Users/arunkpatra/codebase/renewable_energy && docker compose up -d
```

Wait for the `mvp_postgres` service to be healthy, then run the migration:

```bash
cd /Users/arunkpatra/codebase/renewable_energy/packages/mvp_db && bun run db:generate && bun run db:migrate
```

- [ ] **2.5** Commit:

```bash
git add docker-compose.yml turbo.json package.json .env && git commit -m "infra: add mvp_postgres service and turbo tasks for mvp_db/mvp_api"
```

---

## Task 3: Scaffold `apps/mvp_api`

**Files:**
- `apps/mvp_api/package.json`
- `apps/mvp_api/tsconfig.json`
- `apps/mvp_api/bunfig.toml`
- `apps/mvp_api/vercel.json`
- `apps/mvp_api/api/index.js`
- `apps/mvp_api/src/index.ts`
- `apps/mvp_api/src/app.ts`
- `apps/mvp_api/src/env.ts`
- `apps/mvp_api/src/lib/db.ts`
- `apps/mvp_api/src/lib/response.ts`
- `apps/mvp_api/src/lib/errors.ts`
- `apps/mvp_api/src/lib/s3.ts`
- `apps/mvp_api/src/middleware/error-handler.ts`
- `apps/mvp_api/src/middleware/logger.ts`
- `apps/mvp_api/src/tests/preload.ts`

### Steps

- [ ] **3.1** Create `apps/mvp_api/package.json`:

```json
{
  "name": "@renewable-energy/mvp-api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun run --env-file ../../.env --hot src/index.ts",
    "build": "bun build ./src/index.ts --outdir ./dist --target bun",
    "vercel-build": "cd ../.. && bun turbo build --filter=@renewable-energy/mvp-api",
    "start": "bun run dist/index.js",
    "test": "bun test",
    "typecheck": "tsc --noEmit",
    "lint": "eslint"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.1032.0",
    "@aws-sdk/s3-request-presigner": "^3.1032.0",
    "@hono/node-server": "^1.19.14",
    "@renewable-energy/mvp-db": "workspace:*",
    "hono": "^4.12.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@renewable-energy/eslint-config": "workspace:*",
    "@renewable-energy/typescript-config": "workspace:*",
    "@types/bun": "latest",
    "@types/node": "^25.6.0",
    "eslint": "^9.39.2",
    "typescript": "^5.9.3"
  }
}
```

- [ ] **3.2** Create `apps/mvp_api/tsconfig.json`:

```json
{
  "extends": "@renewable-energy/typescript-config/base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"]
  },
  "include": ["src"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **3.3** Create `apps/mvp_api/bunfig.toml`:

```toml
[test]
preload = ["./src/tests/preload.ts"]
```

- [ ] **3.4** Create `apps/mvp_api/vercel.json`:

```json
{
  "outputDirectory": ".",
  "rewrites": [{ "source": "/(.*)", "destination": "/api/index" }]
}
```

- [ ] **3.5** Create `apps/mvp_api/api/index.js`:

```javascript
import { getRequestListener } from "@hono/node-server"
import { app } from "../src/app.js"

// IMPORTANT: Vercel environment variable NODEJS_HELPERS=0 must be set on the
// Vercel project. Without it, Vercel pre-consumes the request body stream
// before this handler runs, causing all POST/PUT/PATCH requests to hang for
// 300 seconds (the function timeout). NODEJS_HELPERS=0 disables Vercel's
// body pre-processing and leaves the raw Node.js stream intact so that
// getRequestListener can read it correctly.
export default getRequestListener(app.fetch)
```

- [ ] **3.6** Create `apps/mvp_api/src/env.ts`:

```typescript
import { z } from "zod"

const EnvSchema = z.object({
  MVP_DATABASE_URL: z.string().min(1, "MVP_DATABASE_URL is required"),
  PORT: z.string().default("3003"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  // Comma-separated list of allowed CORS origins
  CORS_ORIGINS: z.string().optional(),
  // S3 — optional for graceful degradation
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().optional(),
  MVP_S3_DOWNLOADS_BUCKET: z.string().optional(),
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
```

- [ ] **3.7** Create `apps/mvp_api/src/lib/db.ts`:

```typescript
import { prisma } from "@renewable-energy/mvp-db"

export const db = prisma
```

- [ ] **3.8** Create `apps/mvp_api/src/lib/response.ts`:

```typescript
export type ApiResponse<T> =
  | {
      success: true
      data: T
    }
  | {
      success: false
      error: {
        code: string
        message: string
        details?: unknown
      }
    }

export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data }
}

export function err(
  code: string,
  message: string,
  details?: unknown,
): ApiResponse<never> {
  return { success: false, error: { code, message, details } }
}
```

- [ ] **3.9** Create `apps/mvp_api/src/lib/errors.ts`:

```typescript
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly message: string,
    public readonly statusCode: number,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = "AppError"
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super("NOT_FOUND", `${resource} ${id} not found`, 404)
  }
}

export class ValidationError extends AppError {
  constructor(details: unknown) {
    super("VALIDATION_ERROR", "Validation failed", 400, details)
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("CONFLICT", message, 409)
  }
}
```

- [ ] **3.10** Create `apps/mvp_api/src/lib/s3.ts`:

```typescript
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { env } from "../env.js"

let s3: S3Client | null = null

function getS3(): S3Client | null {
  if (
    !env.AWS_ACCESS_KEY_ID ||
    !env.AWS_SECRET_ACCESS_KEY ||
    !env.AWS_REGION
  ) {
    return null
  }
  if (!s3) {
    s3 = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    })
  }
  return s3
}

export async function getPresignedDownloadUrl(
  key: string,
  filename: string,
  expiresIn = 3600,
): Promise<string | null> {
  const client = getS3()
  if (!client || !env.MVP_S3_DOWNLOADS_BUCKET) return null

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: env.MVP_S3_DOWNLOADS_BUCKET,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${filename}"`,
    }),
    { expiresIn },
  )
}
```

- [ ] **3.11** Create `apps/mvp_api/src/middleware/error-handler.ts`:

```typescript
import type { ErrorHandler } from "hono"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import { AppError } from "../lib/errors.js"
import { err } from "../lib/response.js"

export type MvpHonoEnv = { Variables: Record<string, never> }

export const errorHandler: ErrorHandler<MvpHonoEnv> = (error, c) => {
  if (error instanceof AppError) {
    return c.json(
      err(error.code, error.message, error.details),
      error.statusCode as ContentfulStatusCode,
    )
  }

  console.error(
    JSON.stringify({
      level: "error",
      message: error.message,
      stack: error.stack,
    }),
  )
  return c.json(err("INTERNAL_ERROR", "An unexpected error occurred"), 500)
}
```

- [ ] **3.12** Create `apps/mvp_api/src/middleware/logger.ts`:

```typescript
import type { MiddlewareHandler } from "hono"
import type { MvpHonoEnv } from "./error-handler.js"

export const requestLogger: MiddlewareHandler<MvpHonoEnv> = async (
  c,
  next,
) => {
  const start = Date.now()
  const requestId = crypto.randomUUID()

  await next()

  c.res.headers.set("X-Request-Id", requestId)
  const duration = Date.now() - start

  console.log(
    JSON.stringify({
      level: "info",
      requestId,
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: duration,
      timestamp: new Date().toISOString(),
    }),
  )
}
```

- [ ] **3.13** Create `apps/mvp_api/src/app.ts`:

```typescript
import { Hono } from "hono"
import { cors } from "hono/cors"
import { env } from "./env.js"
import { requestLogger } from "./middleware/logger.js"
import { errorHandler } from "./middleware/error-handler.js"
import type { MvpHonoEnv } from "./middleware/error-handler.js"
import { downloadsRoutes } from "./modules/downloads/downloads.routes.js"

export const app = new Hono<MvpHonoEnv>()

// ─── Middleware ────────────────────────────────────────────────────────────────

// CORS — must be first so OPTIONS preflight requests are handled before logging
const corsOrigins = env.CORS_ORIGINS
  ? env.CORS_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:3002"] // mvp_web dev default

app.use("*", cors({ origin: corsOrigins }))
app.use("*", requestLogger)
app.onError(errorHandler)

// ─── Routes ────────────────────────────────────────────────────────────────────

app.route("/", downloadsRoutes)

// ─── Health Checks ─────────────────────────────────────────────────────────────

app.get("/health/live", (c) =>
  c.json({
    success: true,
    data: {
      status: "live",
      service: "mvp-api",
      timestamp: new Date().toISOString(),
    },
  }),
)
```

- [ ] **3.14** Create `apps/mvp_api/src/index.ts`:

```typescript
import { env } from "./env.js"
import { app } from "./app.js"

// ─── Start Server ──────────────────────────────────────────────────────────────

const port = Number(env.PORT)

console.log(
  JSON.stringify({
    level: "info",
    message: `MVP API starting on port ${port}`,
    env: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  }),
)

export default { port, fetch: app.fetch }
```

- [ ] **3.15** Create `apps/mvp_api/src/tests/preload.ts`:

```typescript
// Test preload: runs before every test file.
// Prevents env.ts from calling process.exit(1) on missing MVP_DATABASE_URL,
// and prevents PrismaClient from attempting a real DB connection.
import { mock } from "bun:test"

process.env["MVP_DATABASE_URL"] =
  process.env["MVP_DATABASE_URL"] ??
  "postgresql://test:test@localhost/test_placeholder"
process.env["NODE_ENV"] = "test"

const noopPrismaClient = {
  downloadRegistration: {
    findUnique: () => Promise.resolve(null),
    findMany: () => Promise.resolve([]),
    create: () => Promise.resolve(null),
    count: () => Promise.resolve(0),
  },
  $connect: () => Promise.resolve(),
  $disconnect: () => Promise.resolve(),
  $queryRaw: () => Promise.resolve([{ "?column?": 1 }]),
}

mock.module("@renewable-energy/mvp-db", () => ({
  prisma: noopPrismaClient,
  appPrisma: noopPrismaClient,
  adminPrisma: noopPrismaClient,
  Prisma: {},
}))
```

- [ ] **3.16** Run install:

```bash
cd /Users/arunkpatra/codebase/renewable_energy && bun install
```

Note: The build will not pass yet because `downloads.routes.ts` is imported in `app.ts` but does not exist. That is created in Task 4. However, typecheck of individual files can be verified after Task 4 is complete.

- [ ] **3.17** Commit:

```bash
git add apps/mvp_api/ && git commit -m "feat(mvp_api): scaffold Hono API server with middleware, env, S3, and error handling"
```

---

## Task 4: Download Registration Endpoint

**Files:**
- `apps/mvp_api/src/modules/downloads/downloads.service.ts`
- `apps/mvp_api/src/modules/downloads/downloads.routes.ts`
- `apps/mvp_api/src/modules/downloads/downloads.test.ts`

### Steps

- [ ] **4.1** Create `apps/mvp_api/src/modules/downloads/downloads.service.ts`:

```typescript
import { z } from "zod"
import { db } from "../../lib/db.js"
import { getPresignedDownloadUrl } from "../../lib/s3.js"
import { ValidationError } from "../../lib/errors.js"

// ─── Validation ───────────────────────────────────────────────────────────────

const ProductEnum = z.enum([
  "PV Layout Basic",
  "PV Layout Pro",
  "PV Layout Pro Plus",
])

export const DownloadRegisterSchema = z.object({
  name: z.string().min(1, "name is required"),
  email: z.string().email("invalid email format"),
  mobile: z.string().optional(),
  product: ProductEnum,
})

export type DownloadRegisterInput = z.infer<typeof DownloadRegisterSchema>

// ─── Product to S3 key mapping ────────────────────────────────────────────────

const PRODUCT_S3_KEYS: Record<string, string> = {
  "PV Layout Basic": "downloads/pv-layout-basic.exe",
  "PV Layout Pro": "downloads/pv-layout-pro.exe",
  "PV Layout Pro Plus": "downloads/pv-layout-pro-plus.exe",
}

const PRODUCT_FILENAMES: Record<string, string> = {
  "PV Layout Basic": "pv-layout-basic.exe",
  "PV Layout Pro": "pv-layout-pro.exe",
  "PV Layout Pro Plus": "pv-layout-pro-plus.exe",
}

// ─── Service ──────────────────────────────────────────────────────────────────

export async function registerDownload(
  input: DownloadRegisterInput,
  ipAddress: string,
): Promise<{ downloadUrl: string }> {
  // Insert registration row
  await db.downloadRegistration.create({
    data: {
      name: input.name,
      email: input.email,
      mobile: input.mobile ?? null,
      product: input.product,
      ipAddress,
    },
  })

  // Generate presigned download URL
  const s3Key = PRODUCT_S3_KEYS[input.product]!
  const filename = PRODUCT_FILENAMES[input.product]!
  const downloadUrl = await getPresignedDownloadUrl(s3Key, filename, 3600)

  if (!downloadUrl) {
    throw new Error(
      "S3 download URL generation failed — check S3 configuration",
    )
  }

  return { downloadUrl }
}
```

- [ ] **4.2** Create `apps/mvp_api/src/modules/downloads/downloads.routes.ts`:

```typescript
import { Hono } from "hono"
import { ok } from "../../lib/response.js"
import { ValidationError } from "../../lib/errors.js"
import {
  DownloadRegisterSchema,
  registerDownload,
} from "./downloads.service.js"
import type { MvpHonoEnv } from "../../middleware/error-handler.js"

export const downloadsRoutes = new Hono<MvpHonoEnv>()

// POST /download-register — register a download and return presigned S3 URL
downloadsRoutes.post("/download-register", async (c) => {
  const body = await c.req.json()

  const parsed = DownloadRegisterSchema.safeParse(body)
  if (!parsed.success) {
    throw new ValidationError(parsed.error.flatten().fieldErrors)
  }

  const ipAddress =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"

  const result = await registerDownload(parsed.data, ipAddress)
  return c.json(ok(result))
})
```

- [ ] **4.3** Create `apps/mvp_api/src/modules/downloads/downloads.test.ts`:

```typescript
import { describe, test, expect, mock, beforeEach } from "bun:test"

// ─── Mock db ──────────────────────────────────────────────────────────────────

const now = new Date("2026-04-22T00:00:00.000Z")

const mockDbRegistration = {
  id: "drg_testRegistration0000000000000000000",
  name: "Test User",
  email: "test@example.com",
  mobile: null,
  product: "PV Layout Basic",
  ipAddress: "1.2.3.4",
  createdAt: now,
}

const mockDownloadRegistrationCreate = mock(() =>
  Promise.resolve(mockDbRegistration),
)

mock.module("../../lib/db.js", () => ({
  db: {
    downloadRegistration: {
      create: mockDownloadRegistrationCreate,
    },
  },
}))

// ─── Mock S3 ──────────────────────────────────────────────────────────────────

const mockGetPresignedDownloadUrl = mock(() =>
  Promise.resolve("https://s3.amazonaws.com/test-bucket/downloads/pv-layout-basic.exe?signed"),
)

mock.module("../../lib/s3.js", () => ({
  getPresignedDownloadUrl: mockGetPresignedDownloadUrl,
}))

// ─── Import after mocks ──────────────────────────────────────────────────────

import { registerDownload, DownloadRegisterSchema } from "./downloads.service.js"
import { app } from "../../app.js"

// ─── Schema validation tests ─────────────────────────────────────────────────

describe("DownloadRegisterSchema", () => {
  test("accepts valid input with all fields", () => {
    const result = DownloadRegisterSchema.safeParse({
      name: "Test User",
      email: "test@example.com",
      mobile: "+91 98765 43210",
      product: "PV Layout Basic",
    })
    expect(result.success).toBe(true)
  })

  test("accepts valid input without optional mobile", () => {
    const result = DownloadRegisterSchema.safeParse({
      name: "Test User",
      email: "test@example.com",
      product: "PV Layout Pro",
    })
    expect(result.success).toBe(true)
  })

  test("rejects missing name", () => {
    const result = DownloadRegisterSchema.safeParse({
      email: "test@example.com",
      product: "PV Layout Basic",
    })
    expect(result.success).toBe(false)
  })

  test("rejects empty name", () => {
    const result = DownloadRegisterSchema.safeParse({
      name: "",
      email: "test@example.com",
      product: "PV Layout Basic",
    })
    expect(result.success).toBe(false)
  })

  test("rejects invalid email", () => {
    const result = DownloadRegisterSchema.safeParse({
      name: "Test User",
      email: "not-an-email",
      product: "PV Layout Basic",
    })
    expect(result.success).toBe(false)
  })

  test("rejects invalid product name", () => {
    const result = DownloadRegisterSchema.safeParse({
      name: "Test User",
      email: "test@example.com",
      product: "Invalid Product",
    })
    expect(result.success).toBe(false)
  })

  test("accepts all three valid product names", () => {
    const products = [
      "PV Layout Basic",
      "PV Layout Pro",
      "PV Layout Pro Plus",
    ]
    for (const product of products) {
      const result = DownloadRegisterSchema.safeParse({
        name: "Test User",
        email: "test@example.com",
        product,
      })
      expect(result.success).toBe(true)
    }
  })
})

// ─── Service tests ───────────────────────────────────────────────────────────

describe("registerDownload", () => {
  beforeEach(() => {
    mockDownloadRegistrationCreate.mockClear()
    mockGetPresignedDownloadUrl.mockClear()
  })

  test("creates registration row and returns presigned URL", async () => {
    const result = await registerDownload(
      {
        name: "Test User",
        email: "test@example.com",
        product: "PV Layout Basic",
      },
      "1.2.3.4",
    )

    expect(mockDownloadRegistrationCreate).toHaveBeenCalledWith({
      data: {
        name: "Test User",
        email: "test@example.com",
        mobile: null,
        product: "PV Layout Basic",
        ipAddress: "1.2.3.4",
      },
    })
    expect(result.downloadUrl).toContain("s3.amazonaws.com")
  })

  test("passes correct S3 key for PV Layout Pro", async () => {
    await registerDownload(
      {
        name: "Test User",
        email: "test@example.com",
        product: "PV Layout Pro",
      },
      "5.6.7.8",
    )

    expect(mockGetPresignedDownloadUrl).toHaveBeenCalledWith(
      "downloads/pv-layout-pro.exe",
      "pv-layout-pro.exe",
      3600,
    )
  })

  test("passes correct S3 key for PV Layout Pro Plus", async () => {
    await registerDownload(
      {
        name: "Test User",
        email: "test@example.com",
        product: "PV Layout Pro Plus",
      },
      "9.10.11.12",
    )

    expect(mockGetPresignedDownloadUrl).toHaveBeenCalledWith(
      "downloads/pv-layout-pro-plus.exe",
      "pv-layout-pro-plus.exe",
      3600,
    )
  })

  test("stores optional mobile when provided", async () => {
    await registerDownload(
      {
        name: "Test User",
        email: "test@example.com",
        mobile: "+91 98765 43210",
        product: "PV Layout Basic",
      },
      "1.2.3.4",
    )

    expect(mockDownloadRegistrationCreate).toHaveBeenCalledWith({
      data: {
        name: "Test User",
        email: "test@example.com",
        mobile: "+91 98765 43210",
        product: "PV Layout Basic",
        ipAddress: "1.2.3.4",
      },
    })
  })

  test("throws when S3 returns null URL", async () => {
    mockGetPresignedDownloadUrl.mockResolvedValueOnce(null)

    await expect(
      registerDownload(
        {
          name: "Test User",
          email: "test@example.com",
          product: "PV Layout Basic",
        },
        "1.2.3.4",
      ),
    ).rejects.toThrow("S3 download URL generation failed")
  })
})

// ─── Route integration tests ─────────────────────────────────────────────────

describe("POST /download-register", () => {
  beforeEach(() => {
    mockDownloadRegistrationCreate.mockClear()
    mockGetPresignedDownloadUrl.mockClear()
    mockDownloadRegistrationCreate.mockImplementation(() =>
      Promise.resolve(mockDbRegistration),
    )
    mockGetPresignedDownloadUrl.mockImplementation(() =>
      Promise.resolve(
        "https://s3.amazonaws.com/test-bucket/downloads/pv-layout-basic.exe?signed",
      ),
    )
  })

  test("returns 200 with downloadUrl on valid request", async () => {
    const res = await app.request("/download-register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "1.2.3.4",
      },
      body: JSON.stringify({
        name: "Test User",
        email: "test@example.com",
        product: "PV Layout Basic",
      }),
    })

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.data.downloadUrl).toContain("s3.amazonaws.com")
  })

  test("returns 400 on missing required fields", async () => {
    const res = await app.request("/download-register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    })

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error.code).toBe("VALIDATION_ERROR")
  })

  test("returns 400 on invalid product name", async () => {
    const res = await app.request("/download-register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test User",
        email: "test@example.com",
        product: "Nonexistent Product",
      }),
    })

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.success).toBe(false)
    expect(json.error.code).toBe("VALIDATION_ERROR")
  })

  test("extracts IP from x-forwarded-for header", async () => {
    await app.request("/download-register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "203.0.113.50, 70.41.3.18",
      },
      body: JSON.stringify({
        name: "Test User",
        email: "test@example.com",
        product: "PV Layout Basic",
      }),
    })

    expect(mockDownloadRegistrationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ipAddress: "203.0.113.50",
        }),
      }),
    )
  })

  test("uses 'unknown' when x-forwarded-for is absent", async () => {
    await app.request("/download-register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test User",
        email: "test@example.com",
        product: "PV Layout Basic",
      }),
    })

    expect(mockDownloadRegistrationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ipAddress: "unknown",
        }),
      }),
    )
  })
})
```

- [ ] **4.4** Run tests for the new API:

```bash
cd /Users/arunkpatra/codebase/renewable_energy/apps/mvp_api && bun test
```

- [ ] **4.5** Verify build:

```bash
cd /Users/arunkpatra/codebase/renewable_energy && bunx turbo build --filter=@renewable-energy/mvp-api
```

- [ ] **4.6** Commit:

```bash
git add apps/mvp_api/src/modules/ && git commit -m "feat(mvp_api): add POST /download-register endpoint with Zod validation and S3 presigned URL"
```

---

## Task 5: Wire Frontend DownloadModal to Real API

**Files:**
- `apps/mvp_web/components/download-modal.tsx`
- `apps/mvp_web/components/download-modal.test.tsx`
- `apps/mvp_web/next.config.mjs`

### Steps

- [ ] **5.1** Update `apps/mvp_web/next.config.mjs` to expose the env variable. The `NEXT_PUBLIC_MVP_API_URL` is automatically available in client code because of the `NEXT_PUBLIC_` prefix, so no config change is needed for runtime. However, add a comment for clarity:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@renewable-energy/ui"],
  // NEXT_PUBLIC_MVP_API_URL is read at runtime from process.env
  // Local: http://localhost:3003
  // Prod: set in Vercel environment variables
}

export default nextConfig
```

- [ ] **5.2** Replace `apps/mvp_web/components/download-modal.tsx` with the real API-calling version:

```tsx
"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@renewable-energy/ui/components/button"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@renewable-energy/ui/components/dialog"
import { Input } from "@renewable-energy/ui/components/input"
import { Label } from "@renewable-energy/ui/components/label"
import { Checkbox } from "@renewable-energy/ui/components/checkbox"
import Link from "next/link"

interface DownloadModalProps {
  productName: string
  children: React.ReactNode
}

const MVP_API_URL =
  process.env.NEXT_PUBLIC_MVP_API_URL ?? "http://localhost:3003"

export function DownloadModal({
  productName,
  children,
}: DownloadModalProps) {
  const [open, setOpen] = useState(false)
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [mobile, setMobile] = useState("")
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!fullName.trim() || !email.trim()) {
      toast.error("Please fill in all required fields.")
      return
    }

    if (!agreed) {
      toast.error(
        "Please agree to the Terms & Conditions and Privacy Policy."
      )
      return
    }

    setSubmitting(true)

    try {
      const res = await fetch(`${MVP_API_URL}/download-register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fullName.trim(),
          email: email.trim(),
          mobile: mobile.trim() || undefined,
          product: productName,
        }),
      })

      const json = await res.json()

      if (!res.ok || !json.success) {
        const message =
          json.error?.message ?? "Download registration failed."
        toast.error(message)
        return
      }

      // Trigger browser download via navigation
      window.location.href = json.data.downloadUrl
      toast.success("Download started")

      setOpen(false)
      setFullName("")
      setEmail("")
      setMobile("")
      setAgreed(false)
    } catch {
      toast.error(
        "Unable to connect to the server. Please try again later."
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enter your details to download</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`name-${productName}`}>
              Full Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`name-${productName}`}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your full name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`email-${productName}`}>
              Email Address <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`email-${productName}`}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`mobile-${productName}`}>
              Mobile Number{" "}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id={`mobile-${productName}`}
              type="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="+91 98765 43210"
            />
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id={`agree-${productName}`}
              checked={agreed}
              onCheckedChange={(checked) =>
                setAgreed(checked === true)
              }
            />
            <Label
              htmlFor={`agree-${productName}`}
              className="text-sm leading-snug"
            >
              I agree to the{" "}
              <Link
                href="/terms"
                className="text-primary underline"
                target="_blank"
              >
                Terms &amp; Conditions
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                className="text-primary underline"
                target="_blank"
              >
                Privacy Policy
              </Link>
            </Label>
          </div>

          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {submitting ? "Submitting..." : "Submit & Download"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **5.3** Replace `apps/mvp_web/components/download-modal.test.tsx` with tests that mock `fetch`:

```tsx
import { test, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode
    href: string
    [key: string]: unknown
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

import { DownloadModal } from "./download-modal"
import { toast } from "sonner"

const mockFetch = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  global.fetch = mockFetch
})

test("renders trigger button", () => {
  render(
    <DownloadModal productName="PV Layout Basic">
      <button>Download</button>
    </DownloadModal>
  )
  const buttons = screen.getAllByRole("button", { name: "Download" })
  expect(buttons.length).toBeGreaterThanOrEqual(1)
})

test("opens dialog on trigger click", async () => {
  const user = userEvent.setup()
  render(
    <DownloadModal productName="PV Layout Basic">
      <button>Download</button>
    </DownloadModal>
  )

  const buttons = screen.getAllByRole("button", { name: "Download" })
  await user.click(buttons[0]!)
  expect(
    screen.getByText("Enter your details to download")
  ).toBeInTheDocument()
})

test("calls API and triggers download on valid submit", async () => {
  const mockDownloadUrl = "https://s3.amazonaws.com/test-bucket/downloads/pv-layout-basic.exe?signed"
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        data: { downloadUrl: mockDownloadUrl },
      }),
  })

  // Mock window.location.href assignment
  const locationHrefSpy = vi.spyOn(window, "location", "get").mockReturnValue({
    ...window.location,
    href: "",
  } as Location)

  const user = userEvent.setup({ pointerEventsCheck: 0 })
  render(
    <DownloadModal productName="PV Layout Basic">
      <button>Download</button>
    </DownloadModal>
  )

  const buttons = screen.getAllByRole("button", { name: "Download" })
  await user.click(buttons[0]!)

  await user.type(
    screen.getByPlaceholderText("Enter your full name"),
    "Test User"
  )
  await user.type(
    screen.getByPlaceholderText("you@company.com"),
    "test@example.com"
  )

  const checkbox = screen.getByRole("checkbox")
  await user.click(checkbox)

  await user.click(
    screen.getByRole("button", { name: /Submit & Download/i })
  )

  await waitFor(() => {
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/download-register"),
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test User",
          email: "test@example.com",
          product: "PV Layout Basic",
        }),
      })
    )
  })

  await waitFor(() => {
    expect(toast.success).toHaveBeenCalledWith("Download started")
  })

  locationHrefSpy.mockRestore()
})

test("shows error toast on API failure", async () => {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    json: () =>
      Promise.resolve({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
        },
      }),
  })

  const user = userEvent.setup({ pointerEventsCheck: 0 })
  render(
    <DownloadModal productName="PV Layout Basic">
      <button>Download</button>
    </DownloadModal>
  )

  const buttons = screen.getAllByRole("button", { name: "Download" })
  await user.click(buttons[0]!)

  await user.type(
    screen.getByPlaceholderText("Enter your full name"),
    "Test User"
  )
  await user.type(
    screen.getByPlaceholderText("you@company.com"),
    "test@example.com"
  )

  const checkbox = screen.getByRole("checkbox")
  await user.click(checkbox)

  await user.click(
    screen.getByRole("button", { name: /Submit & Download/i })
  )

  await waitFor(() => {
    expect(toast.error).toHaveBeenCalledWith("Validation failed")
  })
})

test("shows error toast on network failure", async () => {
  mockFetch.mockRejectedValueOnce(new Error("Network error"))

  const user = userEvent.setup({ pointerEventsCheck: 0 })
  render(
    <DownloadModal productName="PV Layout Basic">
      <button>Download</button>
    </DownloadModal>
  )

  const buttons = screen.getAllByRole("button", { name: "Download" })
  await user.click(buttons[0]!)

  await user.type(
    screen.getByPlaceholderText("Enter your full name"),
    "Test User"
  )
  await user.type(
    screen.getByPlaceholderText("you@company.com"),
    "test@example.com"
  )

  const checkbox = screen.getByRole("checkbox")
  await user.click(checkbox)

  await user.click(
    screen.getByRole("button", { name: /Submit & Download/i })
  )

  await waitFor(() => {
    expect(toast.error).toHaveBeenCalledWith(
      "Unable to connect to the server. Please try again later."
    )
  })
})

test("shows validation error when fields are empty", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 })
  render(
    <DownloadModal productName="PV Layout Basic">
      <button>Download</button>
    </DownloadModal>
  )

  const buttons = screen.getAllByRole("button", { name: "Download" })
  await user.click(buttons[0]!)

  // Click checkbox but leave fields empty
  const checkbox = screen.getByRole("checkbox")
  await user.click(checkbox)

  // The form has required fields, so the browser will prevent submission.
  // However, our code also has a manual check. Clear the required attribute
  // by typing and clearing:
  const nameInput = screen.getByPlaceholderText("Enter your full name")
  await user.type(nameInput, " ")
  await user.clear(nameInput)

  await user.click(
    screen.getByRole("button", { name: /Submit & Download/i })
  )

  // The form's required attribute should prevent submission, but our
  // handleSubmit also checks. In either case, fetch should NOT be called.
  expect(mockFetch).not.toHaveBeenCalled()
})

test("shows error when T&C checkbox is not checked", async () => {
  const user = userEvent.setup({ pointerEventsCheck: 0 })
  render(
    <DownloadModal productName="PV Layout Basic">
      <button>Download</button>
    </DownloadModal>
  )

  const buttons = screen.getAllByRole("button", { name: "Download" })
  await user.click(buttons[0]!)

  await user.type(
    screen.getByPlaceholderText("Enter your full name"),
    "Test User"
  )
  await user.type(
    screen.getByPlaceholderText("you@company.com"),
    "test@example.com"
  )

  // Do NOT click checkbox

  await user.click(
    screen.getByRole("button", { name: /Submit & Download/i })
  )

  expect(toast.error).toHaveBeenCalledWith(
    "Please agree to the Terms & Conditions and Privacy Policy."
  )
  expect(mockFetch).not.toHaveBeenCalled()
})
```

- [ ] **5.4** Run frontend tests:

```bash
cd /Users/arunkpatra/codebase/renewable_energy && bunx turbo test --filter=@renewable-energy/mvp-web
```

- [ ] **5.5** Commit:

```bash
git add apps/mvp_web/components/download-modal.tsx apps/mvp_web/components/download-modal.test.tsx apps/mvp_web/next.config.mjs && git commit -m "feat(mvp_web): wire DownloadModal to real API with fetch, loading state, and error handling"
```

---

## Task 6: Full Gate

### Steps

- [ ] **6.1** Run all gates from repo root:

```bash
cd /Users/arunkpatra/codebase/renewable_energy && bun run lint && bun run typecheck && bun run test && bun run build
```

- [ ] **6.2** Fix any lint, type, or test errors found in step 6.1. Re-run until all four gates pass.

- [ ] **6.3** Final commit (if any fixes were needed):

```bash
git add -A && git commit -m "fix: resolve gate issues from full lint+typecheck+test+build pass"
```

---

## Summary of Environment Variables

| Variable | Where set | Value (local) |
|---|---|---|
| `MVP_DATABASE_URL` | Root `.env` | `postgresql://mvp:mvp@localhost:5433/mvp_db` |
| `MVP_S3_DOWNLOADS_BUCKET` | Root `.env` | `solarlayout-downloads` |
| `AWS_ACCESS_KEY_ID` | Root `.env` (existing) | Already set |
| `AWS_SECRET_ACCESS_KEY` | Root `.env` (existing) | Already set |
| `AWS_REGION` | Root `.env` (existing) | Already set |
| `CORS_ORIGINS` | Root `.env` (existing) | `http://localhost:3000` (add `,http://localhost:3002`) |
| `NEXT_PUBLIC_MVP_API_URL` | `apps/mvp_web/.env.local` or Vercel | `http://localhost:3003` |

## Verification Checklist

After all tasks are complete, the human should verify:

1. `docker compose up -d` starts both `postgres` and `mvp_postgres` services
2. `cd packages/mvp_db && bun run db:migrate` creates the `download_registrations` table
3. `cd apps/mvp_api && bun run dev` starts the API on port 3003
4. `curl http://localhost:3003/health/live` returns `{"success":true,...}`
5. `POST http://localhost:3003/download-register` with valid body returns a presigned URL
6. `cd apps/mvp_web && bun run dev` opens the site on port 3002
7. Clicking Download on the Products page, filling the form, and submitting triggers an actual file download
