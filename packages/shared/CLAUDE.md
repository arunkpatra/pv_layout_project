# packages/shared — Shared TypeScript Types

Pure type definitions only. No runtime code, no tests, no dependencies.  
Used by `apps/mvp_api` (Hono backend) as a workspace dep. Type-only — consumers
import from `@solarlayout/shared` via Bun's workspace resolution; no compiled
dist required.

## Key Type Contracts

- `ApiResponse<T>`: discriminated union — `{ success: true; data: T }` | `{ success: false; error: { code: string; message: string; details?: unknown } }`
- `User.createdAt` and `User.updatedAt` are `string` (ISO 8601), **not** `Date` — the API service converts `Date` to `string` at the boundary before returning
- `UserStatus`: `"ACTIVE" | "INACTIVE"`

## Adding New Types

- Add to the relevant file in `src/types/`
- Re-export from `src/index.ts`
- Consumers pick up changes via workspace resolution; no rebuild required for type-only changes
- No migration or test needed for type-only changes
