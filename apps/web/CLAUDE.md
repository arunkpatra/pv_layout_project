# apps/web — Next.js Web Application

Next.js 16 App Router, React 19, Tailwind CSS v4, Clerk v7, TanStack Query v5.
Dev server: Turbopack (`bun run dev`). Testing: Vitest + React Testing Library + jsdom.

## Non-obvious Gotchas

- **`proxy.ts` is the Clerk middleware** (not a proxy config) — protects `/dashboard(.*)`, redirects signed-in users away from sign-in/sign-up
- **Icons: `lucide-react` only** — ignore `iconLibrary: "phosphor"` in `components.json` (stale field, not used)
- **`postcss.config.mjs` is a passthrough** to `packages/ui` — do not configure PostCSS here
- **Do NOT import `@renewable-energy/db`** — all data goes through `@renewable-energy/api-client`
- **Do NOT install shadcn components here** — install to `packages/ui` instead

## Route Groups

- `app/(marketing)/` — public pages, no auth required
- `app/(main)/` — authenticated app shell (sidebar layout, `SidebarProvider`)

## Testing

- Framework: Vitest with jsdom environment
- `vitest.setup.ts` stubs `window.matchMedia` — jsdom omits it, shadcn's `useMobile` hook needs it
- Components using `SidebarProvider` also need `TooltipProvider` in the test wrapper
- Mock `@clerk/nextjs` with `vi.mock`; mock `./use-api` to avoid real HTTP in tests

## Hooks & Data Fetching Conventions

- All query keys live in `lib/query-keys.ts` — no string literals elsewhere
- `useQuery` must have `enabled: isLoaded && !!isSignedIn` guard — prevents 401 on cold load before Clerk resolves
- API client: created via `useApi()` hook; base URL from `NEXT_PUBLIC_API_URL` or `http://localhost:3001`
- New data domains: add query key factory to `lib/query-keys.ts`, add hook to `hooks/`, add method to `packages/api-client`

## Provider Stack (app/layout.tsx)

`ClerkProvider → ThemeProvider → QueryProvider → TooltipProvider`

All providers are already in root layout — do not add duplicate providers in nested layouts.

## Theme

- `next-themes` dark/light mode — `d` key toggles (skips when an input/textarea is focused)
- Nova theme (shadcn radix-nova) — see `docs/ux-design.md` for colour/typography conventions
