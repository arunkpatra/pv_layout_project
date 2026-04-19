# packages/api-client — HTTP API Client

Type-safe HTTP client for `apps/web` to communicate with `apps/api`. Native `fetch` only.  
Testing via `bun:test` (NOT Vitest). `NodeNext` module resolution — must be compiled before use.

## Resolution: Compiled dist Only

This package uses NodeNext `.js` extension imports in source. Consuming packages (e.g., `apps/web`) resolve it through the compiled `dist/` output via the workspace symlink — **never** via a `tsconfig.json` path alias pointing to source.

Turbo pipeline ensures `api-client#build` runs before any consumer's typecheck or build. Do not add a path alias for this package in any consuming app's `tsconfig.json`.

## Testing

- `bun:test` — use `mock.module()` to mock `global.fetch` (NOT `vi.mock`)
- `bunfig.toml` sets `root = "./src"` — prevents bun from picking up compiled test files in `dist/`
- Do not remove `bunfig.toml` or change `root` — duplicate test runs will result

## Adding a New API Domain

1. Create `src/{domain}.ts` with a function `create{Domain}Client(client: ApiClient)`
2. Export the function and its types from `src/index.ts`
3. Call `create{Domain}Client(client)` inside `createWebClient` in `src/identity.ts` pattern
4. Rebuild: `bun run build` (or let turbo handle it)

## Client Contracts

- `TokenGetter`: `() => Promise<string | null>` — returning `null` omits the `Authorization` header (unauthenticated request)
- All API responses must conform to `ApiResponse<T>` from `@renewable-energy/shared`; anything else throws `ApiError("PARSE_ERROR", ...)`
- `ApiError` codes: `NETWORK_ERROR` (fetch threw), `PARSE_ERROR` (non-JSON body), `HTTP_ERROR` (non-ok status without API error body), or a server-provided code from `error.code`
