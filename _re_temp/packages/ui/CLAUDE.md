# packages/ui — Shared UI Component Library

shadcn/ui components, shared hooks, and global Tailwind CSS for all apps.  
`moduleResolution: Bundler` in tsconfig — source alias works, no `.js` extensions needed.  
Testing: Vitest with **node** environment (NOT jsdom).

## Installing shadcn Components

```bash
bunx --bun shadcn@latest add <component> --cwd packages/ui
# Bulk install:
bunx --bun shadcn@latest add --all --overwrite --cwd packages/ui
```

Always install here, never directly into `apps/web` or other apps.

## Combobox — DO NOT USE the nova default

The nova style ships a combobox built on `@base-ui/react` which causes a Turbopack SSR crash (`createContext` failure at build time). Use a `Command`-based combobox instead.

## Icons

Use **Lucide React** (`lucide-react`): `import { ChevronDown } from "lucide-react"`

## Exports

Named path exports only — no barrel index:
- `@renewable-energy/ui/components/button`
- `@renewable-energy/ui/lib/utils` (exports `cn()`)
- `@renewable-energy/ui/hooks/use-mobile`

## Tailwind

- Global styles in `src/styles/globals.css` — imported by consuming apps in their root layout
- The `@source` directive in globals.css scans `apps/` directories for Tailwind class usage — when adding a new app, add an `@source` entry here

## Adding a New App to the Monorepo

When a new app consumes this package:
1. Add `@renewable-energy/ui` to the app's `package.json` dependencies
2. Add `@renewable-energy/ui/*` path alias in the app's `tsconfig.json`
3. Add `"@renewable-energy/ui"` to the app's `transpilePackages` in `next.config.*`
4. Add an `@source "../../../apps/<new-app>/**/*.{ts,tsx}"` line to `src/styles/globals.css`
5. Import `@renewable-energy/ui/globals.css` in the app's root layout
