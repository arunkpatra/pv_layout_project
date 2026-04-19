# packages/shared — Shared TypeScript Types

Pure type definitions only. No runtime code, no tests, no dependencies.  
Used by `apps/api` (compiled dist) and `packages/api-client` (compiled dist).  
`apps/web` resolves it via a `tsconfig.json` path alias pointing to source (Bundler resolution).

## Key Type Contracts

- `ApiResponse<T>`: discriminated union — `{ success: true; data: T }` | `{ success: false; error: { code: string; message: string; details?: unknown } }`
- `User.createdAt` and `User.updatedAt` are `string` (ISO 8601), **not** `Date` — the API service converts `Date` to `string` at the boundary before returning
- `UserStatus`: `"ACTIVE" | "INACTIVE"`

## Adding New Types

- Add to the relevant file in `src/types/`
- Re-export from `src/index.ts`
- Run `bun run build` (or `tsc --build`) — consumers that use compiled dist need a fresh build before they can resolve the new types
- No migration or test needed for type-only changes
