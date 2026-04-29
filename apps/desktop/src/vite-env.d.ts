/// <reference types="vite/client" />

/**
 * Project-specific environment variables read at build time by Vite.
 * Vite-injected `VITE_*` and Tauri-injected `TAURI_ENV_*` are picked up
 * via `envPrefix` in `vite.config.ts`. Add new entries here so the call
 * site is type-checked.
 */
interface ImportMetaEnv {
  /**
   * Override the SolarLayout API base URL (used by the entitlements client
   * and, when V2 lands, the V2 backend client). Default if unset:
   * `https://api.solarlayout.in` — the live production API.
   *
   * Local dev workflow:
   *   1. Run the backend in `renewable_energy/`:
   *      `bunx turbo dev --filter=@renewable-energy/api` (port 3003).
   *   2. Create `apps/desktop/.env.local` with:
   *      `VITE_SOLARLAYOUT_API_URL=http://localhost:3003`
   *   3. Launch the desktop in dev: `bun run tauri dev`.
   *
   * `.env.local` is gitignored. `.env.example` documents the variable.
   */
  readonly VITE_SOLARLAYOUT_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
