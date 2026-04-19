# packages/db — Prisma Database Package

Prisma v7 with `@prisma/adapter-pg`. Semantic ID extensions. Run via Bun. Testing via `bun:test`.

## Adding a New Model (all three steps required)

1. Add model to `prisma/schema.prisma` — set `id String @default("")` (intentional, see below)
2. Add prefix to `src/extensions/semantic-id/id-prefixes.ts` — e.g., `{ User: "usr", Project: "prj" }`
3. Run `bun run db:generate` then `bun run db:migrate`

Skipping step 2 produces `unk_`-prefixed IDs with console warnings — no build error.

## ID Extension System

- `@default("")` on id is intentional — the semantic ID extension overwrites it at create time with a `{prefix}_{base62}` ID (40 chars total)
- Extension chain order is critical: **`strictIdExtension` BEFORE `semanticIdExtension`** — strict strips any manually-provided IDs first, then semantic generates the real one
- Never manually set an `id` field in application code

## Client Exports (`src/index.ts`)

| Export | Use for | Extensions |
|---|---|---|
| `appPrisma` | All application code | strict + semantic |
| `adminPrisma` | Seed scripts and admin utilities | semantic only |
| `prisma` | Alias for `appPrisma` (default) | strict + semantic |

Import `prisma` or `appPrisma` from `@renewable-energy/db` in `apps/api/lib/db.ts` only.

## Build and Typecheck Dependencies

Turbo pipeline runs `db:generate` before building or typechecking this package — Prisma client must be generated before TypeScript can resolve its types. Do not remove this dependency from `turbo.json`.

## Testing

Tests use `bun:test`. Currently only covers pure logic (id-generator). DB tests always mock the Prisma client — never connect to a real database in unit tests.
