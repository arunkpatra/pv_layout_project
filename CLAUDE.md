# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## MANDATORY: Read at Session Start

Before doing any work, read this file in full:

- **[Architecture and Decisions](./docs/architecture.md)** — Stack choices, ownership boundaries, build order, and rationale. Update when new decisions are made.
- **[Development Principles](./docs/claude-dev-principles.md)** — Spike-first methodology, what Claude can and cannot verify, prompt patterns, session structure, anti-patterns, and the mandatory self-review protocol.
- **[Collaborative Testing Protocol](./docs/collaborative-testing-protocol.md)** — How to conduct browser/runtime testing with the human. Ask one question at a time, never dump a full test list.
- **[UX Design Principles](./docs/ux-design.md)** — Industrial theme, no rounded corners, shadcn primitives for all UI elements, icon/colour/typography conventions.

**Self-review rule**: After any significant/wide-blast work (5+ files, new infrastructure, renames, new patterns), run `superpowers:code-reviewer` before declaring complete. "Tests pass" is not sufficient — the reviewer catches what static gates cannot.

**Pre-commit gate (mandatory — run from repo root before every commit):**
```bash
bun run lint && bun run typecheck && bun run test && bun run build
```
All four must pass across all workspaces. Never commit if any step fails.

## Commands

```bash
# Local infrastructure (Docker)
docker compose up -d          # Start Postgres + pgAdmin in background
docker compose down           # Stop containers (keeps volumes)
docker compose down -v        # Stop and delete volumes (destructive — wipes DB)
docker compose ps             # Check container status
# Postgres: localhost:5432  (renewable / renewable / renewable_energy)

# Database (Prisma — run from repo root)
bun run db:generate   # Regenerate Prisma client after schema changes
bun run db:migrate    # Create and apply a new migration (prompts for name)
bun run db:studio     # Open Prisma Studio at http://localhost:5555
bun run db:status     # Show migration status
bun run db:validate   # Validate schema files

# Development (all workspaces)
bun run dev          # Start all dev servers (Turbopack)
bun run build        # Production build (all workspaces)
bun run lint         # Lint all workspaces
bun run format       # Format with Prettier
bun run typecheck    # TypeScript check all workspaces
bun run test         # Test all workspaces

# Single workspace (cd first)
cd apps/web && bun run dev       # Run only the web app
cd apps/web && bun run build     # Build only the web app
cd apps/web && bun run typecheck # Typecheck only the web app
cd apps/web && bun run test      # Test only the web app
cd packages/ui && bun run test   # Test only the UI package

# Selective via turbo --filter (run from repo root, no cd needed)
bunx turbo test --filter=web            # Test apps/web only
bunx turbo test --filter=@renewable-energy/ui  # Test packages/ui only
bunx turbo test --filter=web...         # Test web + its dependencies
bunx turbo build --filter=web          # Any task works with --filter
```

## Architecture

**Monorepo** managed by Turbo with Bun as the package manager.

```
apps/web/              → Next.js 16 App Router application (React 19)
packages/ui/           → Shared component library (@renewable-energy/ui)
packages/eslint-config/    → Shared ESLint configs
packages/typescript-config/ → Shared TypeScript configs
```

### Web App (`apps/web/`)
- **App Router** with server components by default; use `"use client"` for interactive components
- `app/` — routes, layouts, pages
- `components/` — app-specific components (e.g., theme-provider)
- `hooks/`, `lib/` — app-specific hooks and utilities

### UI Package (`packages/ui/`)
- **shadcn/ui** components in `src/components/`
- Shared hooks in `src/hooks/`, utilities in `src/lib/` (includes `cn()`)
- Global Tailwind CSS in `src/styles/globals.css`
- Import as `@renewable-energy/ui/components/button`, `@renewable-energy/ui/lib/utils`, etc.

## Testing

- **Framework**: Vitest + React Testing Library (`bun run test` runs all workspaces via Turbo)
- **TDD is mandatory**: Write failing test first, watch it fail, then write minimal code to pass. No production code without a prior failing test.
- **Test location**: co-locate tests with source — `utils.test.ts` beside `utils.ts`, `nav-main.test.tsx` beside `nav-main.tsx`
- **Component test wrapper**: React components using `SidebarProvider` also need `TooltipProvider` and a `matchMedia` stub (see `apps/web/vitest.setup.ts`)
- **vitest.setup.ts** in `apps/web` stubs `window.matchMedia` (jsdom omits it; shadcn's `useMobile` hook requires it)

## Key Conventions

- **Tailwind CSS v4** with PostCSS — not v3
- **Turbopack** for dev server — not Webpack
- **Phosphor Icons** (`@phosphor-icons/react`) — not Lucide
- **Phosphor Icons TS types** use `Icon` suffix: `CaretDownIcon`, `CheckIcon`, `XIcon` (not `CaretDown`, `Check`, `X`)
- **Prettier**: no semicolons, double quotes, trailing commas (es5), 80 char width
- **Path aliases**: `@/*` for web app imports, `@renewable-energy/ui/*` for shared UI
- **Theme**: `next-themes` with dark/light mode; press `d` key to toggle
- **Zod** for schema validation
- Add new UI components to `packages/ui/`, not `apps/web/components/`
- **shadcn install**: `bunx --bun shadcn@latest add <component> --cwd packages/ui` (use `--all --overwrite` for bulk)
- **UI package moduleResolution**: `packages/ui/tsconfig.json` uses `"Bundler"` (not `"NodeNext"`) — required for `@phosphor-icons/react` type resolution

<!-- NEXT-AGENTS-MD-START -->[Next.js Docs Index]|root: ./.next-docs|STOP. What you remember about Next.js is WRONG for this project. Always search docs and read before any task.|If docs missing, run this command first: npx @next/codemod agents-md --output CLAUDE.md|01-app:{04-glossary.mdx}|01-app/01-getting-started:{01-installation.mdx,02-project-structure.mdx,03-layouts-and-pages.mdx,04-linking-and-navigating.mdx,05-server-and-client-components.mdx,06-fetching-data.mdx,07-mutating-data.mdx,08-caching.mdx,09-revalidating.mdx,10-error-handling.mdx,11-css.mdx,12-images.mdx,13-fonts.mdx,14-metadata-and-og-images.mdx,15-route-handlers.mdx,16-proxy.mdx,17-deploying.mdx,18-upgrading.mdx}|01-app/02-guides:{ai-agents.mdx,analytics.mdx,authentication.mdx,backend-for-frontend.mdx,caching-without-cache-components.mdx,cdn-caching.mdx,ci-build-caching.mdx,content-security-policy.mdx,css-in-js.mdx,custom-server.mdx,data-security.mdx,debugging.mdx,deploying-to-platforms.mdx,draft-mode.mdx,environment-variables.mdx,forms.mdx,how-revalidation-works.mdx,incremental-static-regeneration.mdx,instant-navigation.mdx,instrumentation.mdx,internationalization.mdx,json-ld.mdx,lazy-loading.mdx,local-development.mdx,mcp.mdx,mdx.mdx,memory-usage.mdx,migrating-to-cache-components.mdx,multi-tenant.mdx,multi-zones.mdx,open-telemetry.mdx,package-bundling.mdx,ppr-platform-guide.mdx,prefetching.mdx,preserving-ui-state.mdx,production-checklist.mdx,progressive-web-apps.mdx,public-static-pages.mdx,redirecting.mdx,rendering-philosophy.mdx,sass.mdx,scripts.mdx,self-hosting.mdx,single-page-applications.mdx,static-exports.mdx,streaming.mdx,tailwind-v3-css.mdx,third-party-libraries.mdx,videos.mdx,view-transitions.mdx}|01-app/02-guides/migrating:{app-router-migration.mdx,from-create-react-app.mdx,from-vite.mdx}|01-app/02-guides/testing:{cypress.mdx,jest.mdx,playwright.mdx,vitest.mdx}|01-app/02-guides/upgrading:{codemods.mdx,version-14.mdx,version-15.mdx,version-16.mdx}|01-app/03-api-reference:{07-edge.mdx,08-turbopack.mdx}|01-app/03-api-reference/01-directives:{use-cache-private.mdx,use-cache-remote.mdx,use-cache.mdx,use-client.mdx,use-server.mdx}|01-app/03-api-reference/02-components:{font.mdx,form.mdx,image.mdx,link.mdx,script.mdx}|01-app/03-api-reference/03-file-conventions/01-metadata:{app-icons.mdx,manifest.mdx,opengraph-image.mdx,robots.mdx,sitemap.mdx}|01-app/03-api-reference/03-file-conventions/02-route-segment-config:{dynamicParams.mdx,instant.mdx,maxDuration.mdx,preferredRegion.mdx,runtime.mdx}|01-app/03-api-reference/03-file-conventions:{default.mdx,dynamic-routes.mdx,error.mdx,forbidden.mdx,instrumentation-client.mdx,instrumentation.mdx,intercepting-routes.mdx,layout.mdx,loading.mdx,mdx-components.mdx,not-found.mdx,page.mdx,parallel-routes.mdx,proxy.mdx,public-folder.mdx,route-groups.mdx,route.mdx,src-folder.mdx,template.mdx,unauthorized.mdx}|01-app/03-api-reference/04-functions:{after.mdx,cacheLife.mdx,cacheTag.mdx,catchError.mdx,connection.mdx,cookies.mdx,draft-mode.mdx,fetch.mdx,forbidden.mdx,generate-image-metadata.mdx,generate-metadata.mdx,generate-sitemaps.mdx,generate-static-params.mdx,generate-viewport.mdx,headers.mdx,image-response.mdx,next-request.mdx,next-response.mdx,not-found.mdx,permanentRedirect.mdx,redirect.mdx,refresh.mdx,revalidatePath.mdx,revalidateTag.mdx,unauthorized.mdx,unstable_cache.mdx,unstable_noStore.mdx,unstable_rethrow.mdx,updateTag.mdx,use-link-status.mdx,use-params.mdx,use-pathname.mdx,use-report-web-vitals.mdx,use-router.mdx,use-search-params.mdx,use-selected-layout-segment.mdx,use-selected-layout-segments.mdx,userAgent.mdx}|01-app/03-api-reference/05-config/01-next-config-js:{adapterPath.mdx,allowedDevOrigins.mdx,appDir.mdx,assetPrefix.mdx,authInterrupts.mdx,basePath.mdx,cacheComponents.mdx,cacheHandlers.mdx,cacheLife.mdx,compress.mdx,crossOrigin.mdx,cssChunking.mdx,deploymentId.mdx,devIndicators.mdx,distDir.mdx,env.mdx,expireTime.mdx,exportPathMap.mdx,generateBuildId.mdx,generateEtags.mdx,headers.mdx,htmlLimitedBots.mdx,httpAgentOptions.mdx,images.mdx,incrementalCacheHandlerPath.mdx,inlineCss.mdx,logging.mdx,mdxRs.mdx,onDemandEntries.mdx,optimizePackageImports.mdx,output.mdx,pageExtensions.mdx,poweredByHeader.mdx,productionBrowserSourceMaps.mdx,proxyClientMaxBodySize.mdx,reactCompiler.mdx,reactMaxHeadersLength.mdx,reactStrictMode.mdx,redirects.mdx,rewrites.mdx,sassOptions.mdx,serverActions.mdx,serverComponentsHmrCache.mdx,serverExternalPackages.mdx,staleTimes.mdx,staticGeneration.mdx,taint.mdx,trailingSlash.mdx,transpilePackages.mdx,turbopack.mdx,turbopackFileSystemCache.mdx,turbopackIgnoreIssue.mdx,typedRoutes.mdx,typescript.mdx,urlImports.mdx,useLightningcss.mdx,viewTransition.mdx,webVitalsAttribution.mdx,webpack.mdx}|01-app/03-api-reference/05-config:{02-typescript.mdx,03-eslint.mdx}|01-app/03-api-reference/06-cli:{create-next-app.mdx,next.mdx}|01-app/03-api-reference/07-adapters:{01-configuration.mdx,02-creating-an-adapter.mdx,03-api-reference.mdx,04-testing-adapters.mdx,05-routing-with-next-routing.mdx,06-implementing-ppr-in-an-adapter.mdx,07-runtime-integration.mdx,08-invoking-entrypoints.mdx,09-output-types.mdx,10-routing-information.mdx,11-use-cases.mdx}|02-pages/01-getting-started:{01-installation.mdx,02-project-structure.mdx,04-images.mdx,05-fonts.mdx,06-css.mdx,11-deploying.mdx}|02-pages/02-guides:{analytics.mdx,authentication.mdx,babel.mdx,ci-build-caching.mdx,content-security-policy.mdx,css-in-js.mdx,custom-server.mdx,debugging.mdx,draft-mode.mdx,environment-variables.mdx,forms.mdx,incremental-static-regeneration.mdx,instrumentation.mdx,internationalization.mdx,lazy-loading.mdx,mdx.mdx,multi-zones.mdx,open-telemetry.mdx,package-bundling.mdx,post-css.mdx,preview-mode.mdx,production-checklist.mdx,redirecting.mdx,sass.mdx,scripts.mdx,self-hosting.mdx,static-exports.mdx,tailwind-v3-css.mdx,third-party-libraries.mdx}|02-pages/02-guides/migrating:{app-router-migration.mdx,from-create-react-app.mdx,from-vite.mdx}|02-pages/02-guides/testing:{cypress.mdx,jest.mdx,playwright.mdx,vitest.mdx}|02-pages/02-guides/upgrading:{codemods.mdx,version-10.mdx,version-11.mdx,version-12.mdx,version-13.mdx,version-14.mdx,version-9.mdx}|02-pages/03-building-your-application/01-routing:{01-pages-and-layouts.mdx,02-dynamic-routes.mdx,03-linking-and-navigating.mdx,05-custom-app.mdx,06-custom-document.mdx,07-api-routes.mdx,08-custom-error.mdx}|02-pages/03-building-your-application/02-rendering:{01-server-side-rendering.mdx,02-static-site-generation.mdx,04-automatic-static-optimization.mdx,05-client-side-rendering.mdx}|02-pages/03-building-your-application/03-data-fetching:{01-get-static-props.mdx,02-get-static-paths.mdx,03-forms-and-mutations.mdx,03-get-server-side-props.mdx,05-client-side.mdx}|02-pages/03-building-your-application/06-configuring:{12-error-handling.mdx}|02-pages/04-api-reference:{06-edge.mdx,08-turbopack.mdx}|02-pages/04-api-reference/01-components:{font.mdx,form.mdx,head.mdx,image-legacy.mdx,image.mdx,link.mdx,script.mdx}|02-pages/04-api-reference/02-file-conventions:{instrumentation.mdx,proxy.mdx,public-folder.mdx,src-folder.mdx}|02-pages/04-api-reference/03-functions:{get-initial-props.mdx,get-server-side-props.mdx,get-static-paths.mdx,get-static-props.mdx,next-request.mdx,next-response.mdx,use-params.mdx,use-report-web-vitals.mdx,use-router.mdx,use-search-params.mdx,userAgent.mdx}|02-pages/04-api-reference/04-config/01-next-config-js:{adapterPath.mdx,allowedDevOrigins.mdx,assetPrefix.mdx,basePath.mdx,bundlePagesRouterDependencies.mdx,compress.mdx,crossOrigin.mdx,deploymentId.mdx,devIndicators.mdx,distDir.mdx,env.mdx,exportPathMap.mdx,generateBuildId.mdx,generateEtags.mdx,headers.mdx,httpAgentOptions.mdx,images.mdx,logging.mdx,onDemandEntries.mdx,optimizePackageImports.mdx,output.mdx,pageExtensions.mdx,poweredByHeader.mdx,productionBrowserSourceMaps.mdx,proxyClientMaxBodySize.mdx,reactStrictMode.mdx,redirects.mdx,rewrites.mdx,serverExternalPackages.mdx,trailingSlash.mdx,transpilePackages.mdx,turbopack.mdx,typescript.mdx,urlImports.mdx,useLightningcss.mdx,webVitalsAttribution.mdx,webpack.mdx}|02-pages/04-api-reference/04-config:{01-typescript.mdx,02-eslint.mdx}|02-pages/04-api-reference/05-cli:{create-next-app.mdx,next.mdx}|02-pages/04-api-reference/06-adapters:{01-configuration.mdx,02-creating-an-adapter.mdx,03-api-reference.mdx,04-testing-adapters.mdx,05-routing-with-next-routing.mdx,06-implementing-ppr-in-an-adapter.mdx,07-runtime-integration.mdx,08-invoking-entrypoints.mdx,09-output-types.mdx,10-routing-information.mdx,11-use-cases.mdx}|03-architecture:{accessibility.mdx,fast-refresh.mdx,nextjs-compiler.mdx,supported-browsers.mdx}|04-community:{01-contribution-guide.mdx,02-rspack.mdx}<!-- NEXT-AGENTS-MD-END -->
