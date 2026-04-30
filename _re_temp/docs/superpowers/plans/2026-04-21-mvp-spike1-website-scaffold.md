# MVP Spike 1 — SolarLayout Website Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete SolarLayout public marketing website (`apps/mvp_web`) with all 9 pages, responsive design, solar brand palette, and stubbed forms — no backend integration.

**Architecture:** A new Next.js 16 App Router app at `apps/mvp_web` consuming `packages/ui` (shadcn components) with CSS custom property overrides for the solar brand palette. All pages are static (SSG). No auth, no API calls, no data fetching. Forms render but submit is stubbed with Sonner toast notifications. Mobile navigation uses Sheet drawer.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS v4 via `@tailwindcss/postcss`, shadcn/ui from `@renewable-energy/ui`, lucide-react icons, Sonner toasts, Vitest + React Testing Library + jsdom.

---

## File Map

| File | Change |
|---|---|
| `packages/ui/src/styles/globals.css` | Add `@source` directive for `mvp_web` |
| `apps/mvp_web/package.json` | Create — app dependencies |
| `apps/mvp_web/tsconfig.json` | Create — TypeScript config |
| `apps/mvp_web/next.config.mjs` | Create — Next.js config |
| `apps/mvp_web/postcss.config.mjs` | Create — PostCSS passthrough |
| `apps/mvp_web/vitest.config.ts` | Create — Vitest config |
| `apps/mvp_web/vitest.setup.ts` | Create — Test setup |
| `apps/mvp_web/eslint.config.js` | Create — ESLint config |
| `apps/mvp_web/app/globals.css` | Create — Solar brand palette overrides |
| `apps/mvp_web/app/layout.tsx` | Create — Root layout with Header, Footer, Toaster |
| `apps/mvp_web/app/page.tsx` | Create — Home page |
| `apps/mvp_web/app/products/page.tsx` | Create — Products page |
| `apps/mvp_web/app/pricing/page.tsx` | Create — Pricing page |
| `apps/mvp_web/app/how-it-works/page.tsx` | Create — How It Works page |
| `apps/mvp_web/app/about/page.tsx` | Create — About page |
| `apps/mvp_web/app/faq/page.tsx` | Create — FAQ page |
| `apps/mvp_web/app/contact/page.tsx` | Create — Contact page |
| `apps/mvp_web/app/terms/page.tsx` | Create — Terms page |
| `apps/mvp_web/app/privacy/page.tsx` | Create — Privacy page |
| `apps/mvp_web/components/header.tsx` | Create — Sticky header with mobile drawer |
| `apps/mvp_web/components/footer.tsx` | Create — Footer |
| `apps/mvp_web/components/hero-section.tsx` | Create — Home hero |
| `apps/mvp_web/components/features-overview.tsx` | Create — Three product feature cards |
| `apps/mvp_web/components/how-it-works-summary.tsx` | Create — 4-step process diagram |
| `apps/mvp_web/components/screenshots-section.tsx` | Create — Placeholder screenshots with lightbox |
| `apps/mvp_web/components/system-requirements.tsx` | Create — Requirements table |
| `apps/mvp_web/components/product-card.tsx` | Create — Product card component |
| `apps/mvp_web/components/download-modal.tsx` | Create — Email capture modal (stubbed) |
| `apps/mvp_web/components/pricing-cards.tsx` | Create — Pricing comparison table |
| `apps/mvp_web/components/step-by-step.tsx` | Create — How It Works detailed steps |
| `apps/mvp_web/components/supported-features.tsx` | Create — Feature list |
| `apps/mvp_web/components/faq-accordion.tsx` | Create — FAQ accordion |
| `apps/mvp_web/components/contact-info.tsx` | Create — Contact details |
| `apps/mvp_web/components/contact-form.tsx` | Create — Contact form (stubbed) |
| `apps/mvp_web/components/mvp-toaster.tsx` | Create — Toaster wrapper (no ThemeProvider) |

---

## Task 1: App Scaffold

**Files:**
- Modify: `packages/ui/src/styles/globals.css`
- Create: `apps/mvp_web/package.json`
- Create: `apps/mvp_web/tsconfig.json`
- Create: `apps/mvp_web/next.config.mjs`
- Create: `apps/mvp_web/postcss.config.mjs`
- Create: `apps/mvp_web/vitest.config.ts`
- Create: `apps/mvp_web/vitest.setup.ts`
- Create: `apps/mvp_web/eslint.config.js`

- [ ] **Step 1: Add `@source` directive to UI package globals.css**

Open `packages/ui/src/styles/globals.css`. After the existing `@source "../../../apps/**/*.{ts,tsx}";` line, add a specific source for the MVP app. The existing wildcard already covers `apps/mvp_web`, but adding it explicitly ensures Tailwind scans it even if the wildcard pattern changes in future. Actually, the existing `@source "../../../apps/**/*.{ts,tsx}";` already covers all apps including `mvp_web`, so no change is needed here. However, the design spec calls for it explicitly, so add it for clarity:

Find the line:
```css
@source "../../../apps/**/*.{ts,tsx}";
```

Add after it:
```css
@source "../../../apps/mvp_web/**/*.{ts,tsx}";
```

The full top section of `packages/ui/src/styles/globals.css` becomes:

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));
@source "../../../apps/**/*.{ts,tsx}";
@source "../../../apps/mvp_web/**/*.{ts,tsx}";
@source "../../../components/**/*.{ts,tsx}";
@source "../**/*.{ts,tsx}";
```

- [ ] **Step 2: Create `apps/mvp_web/package.json`**

```json
{
  "name": "@renewable-energy/mvp-web",
  "version": "0.0.1",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "format": "prettier --write \"**/*.{ts,tsx}\"",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@renewable-energy/ui": "workspace:*",
    "lucide-react": "^0.511.0",
    "next": "16.2.4",
    "react": "^19.2.4",
    "react-dom": "^19.2.4",
    "sonner": "^2.0.0"
  },
  "devDependencies": {
    "@renewable-energy/eslint-config": "workspace:^",
    "@renewable-energy/typescript-config": "workspace:*",
    "@tailwindcss/postcss": "^4.1.18",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1",
    "@types/node": "^25.1.0",
    "@types/react": "^19.2.10",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "eslint": "^9.39.2",
    "jsdom": "^29.0.2",
    "typescript": "^5.9.3",
    "vitest": "^4.1.4"
  }
}
```

- [ ] **Step 3: Create `apps/mvp_web/tsconfig.json`**

```json
{
  "extends": "@renewable-energy/typescript-config/nextjs.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"],
      "@renewable-energy/ui/*": ["../../packages/ui/src/*"]
    },
    "plugins": [
      {
        "name": "next"
      }
    ]
  },
  "include": [
    "next-env.d.ts",
    "next.config.mjs",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create `apps/mvp_web/next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@renewable-energy/ui"],
}

export default nextConfig
```

- [ ] **Step 5: Create `apps/mvp_web/postcss.config.mjs`**

```js
export { default } from "@renewable-energy/ui/postcss.config";
```

- [ ] **Step 6: Create `apps/mvp_web/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@renewable-energy/ui": path.resolve(
        __dirname,
        "../../packages/ui/src"
      ),
    },
  },
})
```

- [ ] **Step 7: Create `apps/mvp_web/vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest"

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.IntersectionObserver =
  MockIntersectionObserver as unknown as typeof IntersectionObserver

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver =
  MockResizeObserver as unknown as typeof ResizeObserver
```

- [ ] **Step 8: Create `apps/mvp_web/eslint.config.js`**

```js
import { nextJsConfig } from "@renewable-energy/eslint-config/next-js"

/** @type {import("eslint").Linter.Config} */
export default nextJsConfig
```

- [ ] **Step 9: Install dependencies**

```bash
cd /Users/arunkpatra/codebase/renewable_energy && bun install
```

Expected: lockfile updates, no errors.

- [ ] **Step 10: Verify the scaffold builds**

Create a minimal `apps/mvp_web/app/layout.tsx` and `apps/mvp_web/app/page.tsx` as placeholders so the build can run:

`apps/mvp_web/app/layout.tsx`:
```tsx
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

`apps/mvp_web/app/page.tsx`:
```tsx
export default function HomePage() {
  return <h1>SolarLayout</h1>
}
```

Run:
```bash
bunx turbo build --filter=@renewable-energy/mvp-web
```

Expected: build succeeds.

- [ ] **Step 11: Commit**

```bash
git add packages/ui/src/styles/globals.css apps/mvp_web/
git commit -m "feat: scaffold apps/mvp_web with package.json, tsconfig, next.config, vitest"
```

---

## Task 2: Theme + Root Layout + Header + Footer + Toaster

**Files:**
- Create: `apps/mvp_web/app/globals.css`
- Modify: `apps/mvp_web/app/layout.tsx` (replace placeholder)
- Create: `apps/mvp_web/components/header.tsx`
- Create: `apps/mvp_web/components/footer.tsx`
- Create: `apps/mvp_web/components/mvp-toaster.tsx`
- Create: `apps/mvp_web/components/header.test.tsx`
- Create: `apps/mvp_web/components/footer.test.tsx`

- [ ] **Step 1: Create `apps/mvp_web/app/globals.css`**

The UI package's `globals.css` uses oklch CSS custom properties under `:root`. We override these with the SolarLayout brand palette. We import the UI globals first, then override the `:root` block.

```css
@import "@renewable-energy/ui/globals.css";

:root {
  --background: #F4F6F8;
  --foreground: #1C1C1C;
  --card: #FFFFFF;
  --card-foreground: #1C1C1C;
  --popover: #FFFFFF;
  --popover-foreground: #1C1C1C;
  --primary: #1A3A5C;
  --primary-foreground: #FFFFFF;
  --secondary: #F4F6F8;
  --secondary-foreground: #1A3A5C;
  --muted: #E5E7EB;
  --muted-foreground: #6B7280;
  --accent: #F5A623;
  --accent-foreground: #1C1C1C;
  --destructive: #DC2626;
  --border: #D1D5DB;
  --input: #D1D5DB;
  --ring: #1A3A5C;
  --radius: 0.625rem;
}
```

- [ ] **Step 2: Create `apps/mvp_web/components/mvp-toaster.tsx`**

The shared UI Sonner component depends on `next-themes` (useTheme). Since the MVP has no ThemeProvider, we create a thin wrapper that imports Sonner directly without the theme hook.

```tsx
"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"

export function MvpToaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}
```

- [ ] **Step 3: Create `apps/mvp_web/components/header.tsx`**

```tsx
"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Sun, Menu, X } from "lucide-react"
import { Button } from "@renewable-energy/ui/components/button"
import {
  Sheet,
  SheetTrigger,
  SheetContent,
} from "@renewable-energy/ui/components/sheet"
import { cn } from "@renewable-energy/ui/lib/utils"

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/products", label: "Products" },
  { href: "/pricing", label: "Pricing" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
]

export function Header() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-card">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <Sun className="h-7 w-7 text-accent" />
          <span className="text-xl font-bold text-primary">
            SolarLayout
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted",
                pathname === link.href
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden md:block">
          <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Link href="/products">Download Free Trial</Link>
          </Button>
        </div>

        {/* Mobile hamburger */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <div className="flex items-center gap-2 pb-6 pt-2">
              <Sun className="h-6 w-6 text-accent" />
              <span className="text-lg font-bold text-primary">
                SolarLayout
              </span>
            </div>
            <nav className="flex flex-col gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted",
                    pathname === link.href
                      ? "text-primary"
                      : "text-muted-foreground"
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="mt-6">
              <Button
                asChild
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
              >
                <Link href="/products" onClick={() => setOpen(false)}>
                  Download Free Trial
                </Link>
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}
```

- [ ] **Step 4: Create `apps/mvp_web/components/footer.tsx`**

```tsx
import Link from "next/link"
import { Sun, Linkedin, Youtube, Mail, MapPin } from "lucide-react"

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/products", label: "Products" },
  { href: "/pricing", label: "Pricing" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
]

const legalLinks = [
  { href: "/terms", label: "Terms & Conditions" },
  { href: "/privacy", label: "Privacy Policy" },
]

export function Footer() {
  return (
    <footer className="border-t border-border bg-primary text-primary-foreground">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Sun className="h-6 w-6 text-accent" />
              <span className="text-lg font-bold">SolarLayout</span>
            </div>
            <p className="text-sm text-primary-foreground/70">
              Design Smarter. Deploy Faster. Power the Future.
            </p>
          </div>

          {/* Navigation */}
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider">
              Navigation
            </h3>
            <ul className="space-y-2">
              {navLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-primary-foreground/70 transition-colors hover:text-primary-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider">
              Legal
            </h3>
            <ul className="space-y-2">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-primary-foreground/70 transition-colors hover:text-primary-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact & Social */}
          <div>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider">
              Contact
            </h3>
            <ul className="space-y-3">
              <li className="flex items-center gap-2 text-sm text-primary-foreground/70">
                <Mail className="h-4 w-4 shrink-0" />
                <a
                  href="mailto:support@solarlayout.in"
                  className="transition-colors hover:text-primary-foreground"
                >
                  support@solarlayout.in
                </a>
              </li>
              <li className="flex items-center gap-2 text-sm text-primary-foreground/70">
                <MapPin className="h-4 w-4 shrink-0" />
                Bangalore, India
              </li>
            </ul>
            <div className="mt-4 flex gap-3">
              <a
                href="https://linkedin.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                className="text-primary-foreground/70 transition-colors hover:text-primary-foreground"
              >
                <Linkedin className="h-5 w-5" />
              </a>
              <a
                href="https://youtube.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="YouTube"
                className="text-primary-foreground/70 transition-colors hover:text-primary-foreground"
              >
                <Youtube className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-primary-foreground/10 pt-8 text-center text-sm text-primary-foreground/50">
          &copy; {new Date().getFullYear()} SolarLayout. All Rights
          Reserved.
        </div>
      </div>
    </footer>
  )
}
```

- [ ] **Step 5: Replace `apps/mvp_web/app/layout.tsx` with full layout**

```tsx
import { Geist } from "next/font/google"
import type { Metadata } from "next"

import "@renewable-energy/ui/globals.css"
import "./globals.css"

import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { MvpToaster } from "@/components/mvp-toaster"

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
})

export const metadata: Metadata = {
  title: {
    default: "SolarLayout — PV Layout Design Tools",
    template: "%s | SolarLayout",
  },
  description:
    "Automated PV plant layout design tools for solar professionals. Upload KMZ, generate layouts, export results.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${fontSans.variable} antialiased font-sans`}>
      <body className="flex min-h-screen flex-col bg-background text-foreground">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        <MvpToaster />
      </body>
    </html>
  )
}
```

- [ ] **Step 6: Create `apps/mvp_web/components/header.test.tsx`**

```tsx
import { test, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

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

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}))

import { Header } from "./header"

test("renders SolarLayout logo text", () => {
  render(<Header />)
  expect(screen.getByText("SolarLayout")).toBeInTheDocument()
})

test("renders Download Free Trial CTA", () => {
  render(<Header />)
  const ctas = screen.getAllByText("Download Free Trial")
  expect(ctas.length).toBeGreaterThanOrEqual(1)
})

test("renders all desktop navigation links", () => {
  render(<Header />)
  expect(screen.getByRole("link", { name: "Products" })).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "Pricing" })).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "FAQ" })).toBeInTheDocument()
  expect(screen.getByRole("link", { name: "Contact" })).toBeInTheDocument()
})
```

- [ ] **Step 7: Create `apps/mvp_web/components/footer.test.tsx`**

```tsx
import { test, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

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

import { Footer } from "./footer"

test("renders SolarLayout brand name", () => {
  render(<Footer />)
  expect(screen.getByText("SolarLayout")).toBeInTheDocument()
})

test("renders tagline", () => {
  render(<Footer />)
  expect(
    screen.getByText("Design Smarter. Deploy Faster. Power the Future.")
  ).toBeInTheDocument()
})

test("renders legal links", () => {
  render(<Footer />)
  expect(
    screen.getByRole("link", { name: "Terms & Conditions" })
  ).toBeInTheDocument()
  expect(
    screen.getByRole("link", { name: "Privacy Policy" })
  ).toBeInTheDocument()
})

test("renders contact email", () => {
  render(<Footer />)
  expect(
    screen.getByText("support@solarlayout.in")
  ).toBeInTheDocument()
})

test("renders location", () => {
  render(<Footer />)
  expect(screen.getByText("Bangalore, India")).toBeInTheDocument()
})
```

- [ ] **Step 8: Run tests**

```bash
bunx turbo test --filter=@renewable-energy/mvp-web
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add apps/mvp_web/ packages/ui/src/styles/globals.css
git commit -m "feat: add solar brand theme, root layout, Header, Footer, and MvpToaster"
```

---

## Task 3: Home Page

**Files:**
- Create: `apps/mvp_web/components/hero-section.tsx`
- Create: `apps/mvp_web/components/features-overview.tsx`
- Create: `apps/mvp_web/components/how-it-works-summary.tsx`
- Create: `apps/mvp_web/components/screenshots-section.tsx`
- Create: `apps/mvp_web/components/system-requirements.tsx`
- Modify: `apps/mvp_web/app/page.tsx` (replace placeholder)
- Create: `apps/mvp_web/app/page.test.tsx`

- [ ] **Step 1: Create `apps/mvp_web/components/hero-section.tsx`**

```tsx
import Link from "next/link"
import { Button } from "@renewable-energy/ui/components/button"
import { ChevronRight } from "lucide-react"

export function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-primary px-4 py-20 text-primary-foreground sm:px-6 sm:py-28 lg:px-8 lg:py-36">
      {/* Decorative background grid */}
      <div className="absolute inset-0 opacity-10">
        <div className="h-full w-full bg-[linear-gradient(rgba(255,255,255,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.1)_1px,transparent_1px)] bg-[size:4rem_4rem]" />
      </div>

      <div className="relative mx-auto max-w-4xl text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          Design Smarter. Deploy Faster.{" "}
          <span className="text-accent">Power the Future.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-primary-foreground/80 sm:text-xl">
          Automated PV plant layout design from KMZ boundary files. Place
          MMS tables, route cables, estimate energy yield — in minutes,
          not days.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Button
            asChild
            size="lg"
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <Link href="/products">
              Explore Products
              <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10"
          >
            <Link href="/pricing">See Pricing</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Create `apps/mvp_web/components/features-overview.tsx`**

```tsx
import Link from "next/link"
import { Layout, Zap, Sun } from "lucide-react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@renewable-energy/ui/components/card"
import { Button } from "@renewable-energy/ui/components/button"

const products = [
  {
    name: "PV Layout Basic",
    icon: Layout,
    features: [
      "KMZ boundary input with exclusion zones",
      "Automatic MMS table placement",
      "Inverter and lightning arrester placement",
      "5 layout calculations per purchase",
    ],
  },
  {
    name: "PV Layout Pro",
    icon: Zap,
    features: [
      "All Basic features included",
      "AC and DC cable placement",
      "Full cable quantity measurements",
      "10 layout calculations per purchase",
    ],
  },
  {
    name: "PV Layout Pro Plus",
    icon: Sun,
    features: [
      "All Pro features included",
      "Energy yield analysis (P50/P75/P90)",
      "Plant generation estimates",
      "50 layout and yield calculations per purchase",
    ],
  },
]

export function FeaturesOverview() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Three Tools for Every Stage of Solar Development
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            From quick capacity estimates to detailed bankable layouts
            with energy yield analysis.
          </p>
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <Card key={product.name} className="flex flex-col">
              <CardHeader>
                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <product.icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-xl">{product.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <ul className="flex-1 space-y-2">
                  {product.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button
                  asChild
                  variant="outline"
                  className="mt-6 w-full"
                >
                  <Link href="/products">Learn More</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Create `apps/mvp_web/components/how-it-works-summary.tsx`**

```tsx
import { Upload, Settings, Layout, FileOutput } from "lucide-react"

const steps = [
  {
    icon: Upload,
    title: "Upload KMZ",
    description: "Upload your site boundary file",
  },
  {
    icon: Settings,
    title: "Enter Parameters",
    description: "Configure module and plant specs",
  },
  {
    icon: Layout,
    title: "Generate Layout",
    description: "Software creates your layout automatically",
  },
  {
    icon: FileOutput,
    title: "Export Results",
    description: "Download KMZ, DXF, and PDF reports",
  },
]

export function HowItWorksSummary() {
  return (
    <section className="bg-muted px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            How It Works
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            From boundary to bankable layout — in minutes.
          </p>
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <div key={step.title} className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <step.icon className="h-7 w-7" />
              </div>
              <div className="mt-2 text-sm font-semibold text-accent">
                Step {index + 1}
              </div>
              <h3 className="mt-1 text-lg font-semibold text-foreground">
                {step.title}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Create `apps/mvp_web/components/screenshots-section.tsx`**

```tsx
"use client"

import { useState } from "react"
import { Monitor } from "lucide-react"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@renewable-energy/ui/components/dialog"

const screenshots = [
  {
    id: 1,
    caption: "Plant boundary import and visualization",
  },
  {
    id: 2,
    caption: "MMS table placement with exclusion zones",
  },
  {
    id: 3,
    caption: "Cable routing and quantity measurements",
  },
  {
    id: 4,
    caption: "Energy yield analysis and generation report",
  },
]

export function ScreenshotsSection() {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const selected = screenshots.find((s) => s.id === selectedId)

  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            See It in Action
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Screenshots from the SolarLayout desktop application.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {screenshots.map((screenshot) => (
            <Dialog
              key={screenshot.id}
              open={selectedId === screenshot.id}
              onOpenChange={(open) =>
                setSelectedId(open ? screenshot.id : null)
              }
            >
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="group cursor-pointer overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md"
                >
                  <div className="flex aspect-video items-center justify-center bg-muted">
                    <div className="text-center">
                      <Monitor className="mx-auto h-10 w-10 text-muted-foreground/50 transition-colors group-hover:text-primary" />
                      <span className="mt-2 block text-xs text-muted-foreground">
                        Screenshot coming soon
                      </span>
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="text-sm text-muted-foreground">
                      {screenshot.caption}
                    </p>
                  </div>
                </button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>{screenshot.caption}</DialogTitle>
                </DialogHeader>
                <div className="flex aspect-video items-center justify-center rounded-lg bg-muted">
                  <div className="text-center">
                    <Monitor className="mx-auto h-16 w-16 text-muted-foreground/50" />
                    <span className="mt-3 block text-sm text-muted-foreground">
                      Screenshot coming soon
                    </span>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 5: Create `apps/mvp_web/components/system-requirements.tsx`**

```tsx
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@renewable-energy/ui/components/table"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@renewable-energy/ui/components/card"
import { HardDrive } from "lucide-react"

const requirements = [
  { requirement: "Operating System", details: "Windows 10 or higher" },
  { requirement: "RAM", details: "8 GB minimum" },
  { requirement: "Disk Space", details: "500 MB free" },
  { requirement: "Additional Software", details: "None required" },
  {
    requirement: "Internet Connection",
    details: "Required for entitlement validation (Phase 2)",
  },
]

export function SystemRequirements() {
  return (
    <section className="bg-muted px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <HardDrive className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="text-xl">
                System Requirements
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-1/3">Requirement</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requirements.map((row) => (
                  <TableRow key={row.requirement}>
                    <TableCell className="font-medium">
                      {row.requirement}
                    </TableCell>
                    <TableCell>{row.details}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
```

- [ ] **Step 6: Replace `apps/mvp_web/app/page.tsx` with full Home page**

```tsx
import { HeroSection } from "@/components/hero-section"
import { FeaturesOverview } from "@/components/features-overview"
import { HowItWorksSummary } from "@/components/how-it-works-summary"
import { ScreenshotsSection } from "@/components/screenshots-section"
import { SystemRequirements } from "@/components/system-requirements"

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <FeaturesOverview />
      <HowItWorksSummary />
      <ScreenshotsSection />
      <SystemRequirements />
    </>
  )
}
```

- [ ] **Step 7: Create `apps/mvp_web/app/page.test.tsx`**

```tsx
import { test, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

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

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}))

import HomePage from "./page"

test("renders hero heading", () => {
  render(<HomePage />)
  expect(
    screen.getByRole("heading", { level: 1 })
  ).toBeInTheDocument()
})

test("renders Explore Products CTA", () => {
  render(<HomePage />)
  expect(
    screen.getByRole("link", { name: /Explore Products/i })
  ).toBeInTheDocument()
})

test("renders Features Overview section", () => {
  render(<HomePage />)
  expect(screen.getByText("PV Layout Basic")).toBeInTheDocument()
  expect(screen.getByText("PV Layout Pro")).toBeInTheDocument()
  expect(screen.getByText("PV Layout Pro Plus")).toBeInTheDocument()
})

test("renders How It Works summary steps", () => {
  render(<HomePage />)
  expect(screen.getByText("Upload KMZ")).toBeInTheDocument()
  expect(screen.getByText("Enter Parameters")).toBeInTheDocument()
  expect(screen.getByText("Generate Layout")).toBeInTheDocument()
  expect(screen.getByText("Export Results")).toBeInTheDocument()
})

test("renders System Requirements section", () => {
  render(<HomePage />)
  expect(screen.getByText("System Requirements")).toBeInTheDocument()
  expect(screen.getByText("Windows 10 or higher")).toBeInTheDocument()
})
```

- [ ] **Step 8: Run tests**

```bash
bunx turbo test --filter=@renewable-energy/mvp-web
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add apps/mvp_web/
git commit -m "feat: add Home page with hero, features, how-it-works, screenshots, and system requirements"
```

---

## Task 4: Products Page + DownloadModal

**Files:**
- Create: `apps/mvp_web/components/product-card.tsx`
- Create: `apps/mvp_web/components/download-modal.tsx`
- Create: `apps/mvp_web/app/products/page.tsx`
- Create: `apps/mvp_web/app/products/page.test.tsx`
- Create: `apps/mvp_web/components/download-modal.test.tsx`

- [ ] **Step 1: Create `apps/mvp_web/components/download-modal.tsx`**

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

export function DownloadModal({
  productName,
  children,
}: DownloadModalProps) {
  const [open, setOpen] = useState(false)
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [mobile, setMobile] = useState("")
  const [agreed, setAgreed] = useState(false)

  function handleSubmit(e: React.FormEvent) {
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

    toast.info(
      `Download for ${productName} coming soon. We have noted your interest.`
    )
    setOpen(false)
    setFullName("")
    setEmail("")
    setMobile("")
    setAgreed(false)
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
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
          >
            Submit &amp; Download
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Create `apps/mvp_web/components/product-card.tsx`**

```tsx
import { Download } from "lucide-react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@renewable-energy/ui/components/card"
import { Button } from "@renewable-energy/ui/components/button"
import { DownloadModal } from "./download-modal"

interface ProductCardProps {
  name: string
  price: string
  calculations: string
  features: string[]
  highlighted?: boolean
}

export function ProductCard({
  name,
  price,
  calculations,
  features,
  highlighted = false,
}: ProductCardProps) {
  return (
    <Card
      className={`flex flex-col ${highlighted ? "border-accent ring-2 ring-accent/20" : ""}`}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl">{name}</CardTitle>
          <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
            {price}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{calculations}</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <ul className="flex-1 space-y-2">
          {features.map((feature) => (
            <li
              key={feature}
              className="flex items-start gap-2 text-sm text-muted-foreground"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              {feature}
            </li>
          ))}
        </ul>
        <DownloadModal productName={name}>
          <Button className="mt-6 w-full bg-accent text-accent-foreground hover:bg-accent/90">
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
        </DownloadModal>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Create `apps/mvp_web/app/products/page.tsx`**

```tsx
import type { Metadata } from "next"
import { ProductCard } from "@/components/product-card"

export const metadata: Metadata = {
  title: "Products",
  description:
    "Download PV Layout Basic, Pro, or Pro Plus — automated solar plant layout design tools for Windows.",
}

const products = [
  {
    name: "PV Layout Basic",
    price: "$1.99",
    calculations: "5 layout calculations per purchase",
    features: [
      "KMZ boundary input with multiple plant areas",
      "Automatic MMS table placement within boundary",
      "Inverter and lightning arrester placement",
      "Obstruction exclusion (ponds, water bodies, transmission lines)",
      "KMZ and DXF export",
    ],
  },
  {
    name: "PV Layout Pro",
    price: "$4.99",
    calculations: "10 layout calculations per purchase",
    features: [
      "All PV Layout Basic features",
      "AC and DC cable placement with full routing",
      "Cable quantity measurements",
      "ICR building placement (1 per 18 MWp)",
      "KMZ, DXF, and PDF export",
    ],
    highlighted: true,
  },
  {
    name: "PV Layout Pro Plus",
    price: "$14.99",
    calculations: "50 layout and yield calculations per purchase",
    features: [
      "All PV Layout Pro features",
      "Energy yield analysis",
      "P50 / P75 / P90 exceedance values",
      "Plant generation estimates",
      "Complete PDF report with capacity, cables, and yield",
    ],
  },
]

export default function ProductsPage() {
  return (
    <div className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Our Products
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Three desktop tools for every stage of utility-scale solar
            PV plant development. From quick capacity estimates to
            detailed bankable layouts with energy yield analysis.
          </p>
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <ProductCard
              key={product.name}
              name={product.name}
              price={product.price}
              calculations={product.calculations}
              features={product.features}
              highlighted={product.highlighted}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `apps/mvp_web/components/download-modal.test.tsx`**

```tsx
import { test, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
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
    info: vi.fn(),
    error: vi.fn(),
  },
}))

import { DownloadModal } from "./download-modal"
import { toast } from "sonner"

test("renders trigger button", () => {
  render(
    <DownloadModal productName="PV Layout Basic">
      <button>Download</button>
    </DownloadModal>
  )
  expect(
    screen.getByRole("button", { name: "Download" })
  ).toBeInTheDocument()
})

test("opens dialog on trigger click", async () => {
  const user = userEvent.setup()
  render(
    <DownloadModal productName="PV Layout Basic">
      <button>Download</button>
    </DownloadModal>
  )

  await user.click(screen.getByRole("button", { name: "Download" }))
  expect(
    screen.getByText("Enter your details to download")
  ).toBeInTheDocument()
})

test("shows toast on submit with valid data", async () => {
  const user = userEvent.setup()
  render(
    <DownloadModal productName="PV Layout Basic">
      <button>Download</button>
    </DownloadModal>
  )

  await user.click(screen.getByRole("button", { name: "Download" }))

  await user.type(
    screen.getByPlaceholderText("Enter your full name"),
    "Test User"
  )
  await user.type(
    screen.getByPlaceholderText("you@company.com"),
    "test@example.com"
  )

  // Click the checkbox
  const checkbox = screen.getByRole("checkbox")
  await user.click(checkbox)

  await user.click(
    screen.getByRole("button", { name: /Submit & Download/i })
  )

  expect(toast.info).toHaveBeenCalledWith(
    expect.stringContaining("PV Layout Basic")
  )
})
```

- [ ] **Step 5: Create `apps/mvp_web/app/products/page.test.tsx`**

```tsx
import { test, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

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
  toast: { info: vi.fn(), error: vi.fn() },
}))

import ProductsPage from "./page"

test("renders page heading", () => {
  render(<ProductsPage />)
  expect(
    screen.getByRole("heading", { level: 1, name: /Our Products/i })
  ).toBeInTheDocument()
})

test("renders all three product cards", () => {
  render(<ProductsPage />)
  expect(screen.getByText("PV Layout Basic")).toBeInTheDocument()
  expect(screen.getByText("PV Layout Pro")).toBeInTheDocument()
  expect(screen.getByText("PV Layout Pro Plus")).toBeInTheDocument()
})

test("renders prices", () => {
  render(<ProductsPage />)
  expect(screen.getByText("$1.99")).toBeInTheDocument()
  expect(screen.getByText("$4.99")).toBeInTheDocument()
  expect(screen.getByText("$14.99")).toBeInTheDocument()
})

test("renders download buttons", () => {
  render(<ProductsPage />)
  const downloadButtons = screen.getAllByRole("button", {
    name: /Download/i,
  })
  expect(downloadButtons.length).toBe(3)
})
```

- [ ] **Step 6: Run tests**

```bash
bunx turbo test --filter=@renewable-energy/mvp-web
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/mvp_web/
git commit -m "feat: add Products page with ProductCard and DownloadModal (stubbed)"
```

---

## Task 5: Pricing Page

**Files:**
- Create: `apps/mvp_web/components/pricing-cards.tsx`
- Create: `apps/mvp_web/app/pricing/page.tsx`
- Create: `apps/mvp_web/app/pricing/page.test.tsx`

- [ ] **Step 1: Create `apps/mvp_web/components/pricing-cards.tsx`**

```tsx
import { Check, X } from "lucide-react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@renewable-energy/ui/components/card"
import { Button } from "@renewable-energy/ui/components/button"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@renewable-energy/ui/components/tooltip"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@renewable-energy/ui/components/table"

interface PricingTier {
  name: string
  price: string
  purchaseModel: string
  calculations: string
  highlighted?: boolean
}

const tiers: PricingTier[] = [
  {
    name: "PV Layout Basic",
    price: "$1.99",
    purchaseModel: "One-time",
    calculations: "5 Layout",
  },
  {
    name: "PV Layout Pro",
    price: "$4.99",
    purchaseModel: "One-time",
    calculations: "10 Layout",
    highlighted: true,
  },
  {
    name: "PV Layout Pro Plus",
    price: "$14.99",
    purchaseModel: "One-time",
    calculations: "50 Layout + Yield",
  },
]

interface FeatureRow {
  feature: string
  basic: boolean
  pro: boolean
  proPlus: boolean
}

const features: FeatureRow[] = [
  {
    feature: "Plant Layout (MMS, Inverter, LA)",
    basic: true,
    pro: true,
    proPlus: true,
  },
  {
    feature: "Obstruction Exclusion",
    basic: true,
    pro: true,
    proPlus: true,
  },
  {
    feature: "AC & DC Cable Routing",
    basic: false,
    pro: true,
    proPlus: true,
  },
  {
    feature: "Cable Quantity Measurements",
    basic: false,
    pro: true,
    proPlus: true,
  },
  {
    feature: "Energy Yield Analysis",
    basic: false,
    pro: false,
    proPlus: true,
  },
  {
    feature: "Plant Generation Estimates",
    basic: false,
    pro: false,
    proPlus: true,
  },
  {
    feature: "Top-up Available",
    basic: true,
    pro: true,
    proPlus: true,
  },
]

function FeatureIcon({ included }: { included: boolean }) {
  return included ? (
    <Check className="mx-auto h-5 w-5 text-green-600" />
  ) : (
    <X className="mx-auto h-5 w-5 text-muted-foreground/40" />
  )
}

export function PricingCards() {
  return (
    <div className="space-y-12">
      {/* Card grid for mobile */}
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {tiers.map((tier) => (
          <Card
            key={tier.name}
            className={`flex flex-col text-center ${tier.highlighted ? "border-accent ring-2 ring-accent/20" : ""}`}
          >
            <CardHeader>
              <CardTitle className="text-xl">{tier.name}</CardTitle>
              <div className="mt-2">
                <span className="text-4xl font-bold text-foreground">
                  {tier.price}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {tier.purchaseModel} &middot; {tier.calculations}
              </p>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-end">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full cursor-not-allowed opacity-60"
                      disabled
                    >
                      Buy Now
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Payment coming soon</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Feature comparison table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-2/5">Feature</TableHead>
              <TableHead className="text-center">
                PV Layout Basic
              </TableHead>
              <TableHead className="text-center">
                PV Layout Pro
              </TableHead>
              <TableHead className="text-center">
                PV Layout Pro Plus
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Price</TableCell>
              <TableCell className="text-center">$1.99</TableCell>
              <TableCell className="text-center">$4.99</TableCell>
              <TableCell className="text-center">$14.99</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">
                Purchase Model
              </TableCell>
              <TableCell className="text-center">One-time</TableCell>
              <TableCell className="text-center">One-time</TableCell>
              <TableCell className="text-center">One-time</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">
                Calculations Included
              </TableCell>
              <TableCell className="text-center">5 Layout</TableCell>
              <TableCell className="text-center">10 Layout</TableCell>
              <TableCell className="text-center">
                50 Layout + Yield
              </TableCell>
            </TableRow>
            {features.map((row) => (
              <TableRow key={row.feature}>
                <TableCell className="font-medium">
                  {row.feature}
                </TableCell>
                <TableCell>
                  <FeatureIcon included={row.basic} />
                </TableCell>
                <TableCell>
                  <FeatureIcon included={row.pro} />
                </TableCell>
                <TableCell>
                  <FeatureIcon included={row.proPlus} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Top-up note */}
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-muted-foreground">
          <strong className="text-foreground">
            Need more calculations?
          </strong>{" "}
          Top up anytime at the same rate. Payment system coming in
          Phase 2.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `apps/mvp_web/app/pricing/page.tsx`**

```tsx
import type { Metadata } from "next"
import { PricingCards } from "@/components/pricing-cards"

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple, transparent pricing for SolarLayout PV design tools. One-time purchase, usage-based entitlements.",
}

export default function PricingPage() {
  return (
    <div className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Simple, Transparent Pricing
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Pay once. Use as many times as your plan allows.
          </p>
        </div>

        <div className="mt-12">
          <PricingCards />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `apps/mvp_web/app/pricing/page.test.tsx`**

```tsx
import { test, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

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

import PricingPage from "./page"

test("renders page heading", () => {
  render(<PricingPage />)
  expect(
    screen.getByRole("heading", {
      level: 1,
      name: /Simple, Transparent Pricing/i,
    })
  ).toBeInTheDocument()
})

test("renders all three tier names", () => {
  render(<PricingPage />)
  expect(screen.getAllByText("PV Layout Basic").length).toBeGreaterThanOrEqual(1)
  expect(screen.getAllByText("PV Layout Pro").length).toBeGreaterThanOrEqual(1)
  expect(screen.getAllByText("PV Layout Pro Plus").length).toBeGreaterThanOrEqual(1)
})

test("renders prices", () => {
  render(<PricingPage />)
  expect(screen.getAllByText("$1.99").length).toBeGreaterThanOrEqual(1)
  expect(screen.getAllByText("$4.99").length).toBeGreaterThanOrEqual(1)
  expect(screen.getAllByText("$14.99").length).toBeGreaterThanOrEqual(1)
})

test("renders disabled Buy Now buttons", () => {
  render(<PricingPage />)
  const buyButtons = screen.getAllByRole("button", { name: /Buy Now/i })
  expect(buyButtons.length).toBe(3)
  buyButtons.forEach((btn) => {
    expect(btn).toBeDisabled()
  })
})

test("renders feature comparison table", () => {
  render(<PricingPage />)
  expect(
    screen.getByText("Plant Layout (MMS, Inverter, LA)")
  ).toBeInTheDocument()
  expect(
    screen.getByText("Energy Yield Analysis")
  ).toBeInTheDocument()
})

test("renders top-up note", () => {
  render(<PricingPage />)
  expect(
    screen.getByText(/Need more calculations/i)
  ).toBeInTheDocument()
})
```

- [ ] **Step 4: Run tests**

```bash
bunx turbo test --filter=@renewable-energy/mvp-web
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mvp_web/
git commit -m "feat: add Pricing page with feature comparison table and disabled Buy Now"
```

---

## Task 6: How It Works Page

**Files:**
- Create: `apps/mvp_web/components/step-by-step.tsx`
- Create: `apps/mvp_web/components/supported-features.tsx`
- Create: `apps/mvp_web/app/how-it-works/page.tsx`
- Create: `apps/mvp_web/app/how-it-works/page.test.tsx`

- [ ] **Step 1: Create `apps/mvp_web/components/step-by-step.tsx`**

```tsx
import { Upload, Settings, Layout, FileOutput } from "lucide-react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@renewable-energy/ui/components/card"

const steps = [
  {
    icon: Upload,
    title: "Import Your Boundary",
    description:
      "Load your site KMZ file. SolarLayout automatically reads all boundary polygons, including exclusion zones for obstacles, water bodies, and transmission line corridors.",
  },
  {
    icon: Settings,
    title: "Configure Your Parameters",
    description:
      "Input your module specifications (dimensions, wattage), MMS table configuration, row pitch, GCR, perimeter road width, and inverter/SMB details. Both string inverter and central inverter topologies are supported.",
  },
  {
    icon: Layout,
    title: "Generate Your Layout",
    description:
      "The software automatically places MMS tables, inverters, lightning arresters, and routes DC/AC cables — all within your boundary constraints. ICR buildings are placed and sized automatically.",
  },
  {
    icon: FileOutput,
    title: "Export Your Results",
    description:
      "Export a full KMZ layout file, DXF drawing, and PDF report with plant capacity, cable quantities, energy yield, and generation estimates.",
  },
]

export function StepByStep() {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      {steps.map((step, index) => (
        <Card key={step.title}>
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <step.icon className="h-6 w-6" />
              </div>
              <div>
                <span className="text-sm font-semibold text-accent">
                  Step {index + 1}
                </span>
                <CardTitle className="text-lg">{step.title}</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{step.description}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create `apps/mvp_web/components/supported-features.tsx`**

```tsx
import { Check } from "lucide-react"

const supportedFeatures = [
  "KMZ boundary input with multiple plant areas",
  "Fixed-tilt MMS table placement",
  "String inverter and central inverter topologies",
  "Automatic ICR placement (1 per 18 MWp)",
  "Lightning arrester placement and protection zone calculation",
  "DC string cable and AC/DC-to-ICR cable routing with quantity measurements",
  "Energy yield analysis with P50 / P75 / P90 exceedance values",
  "PDF, KMZ and DXF export",
]

export function SupportedFeatures() {
  return (
    <div className="rounded-lg border border-border bg-card p-6 sm:p-8">
      <h2 className="text-2xl font-bold text-foreground">
        Supported Features
      </h2>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {supportedFeatures.map((feature) => (
          <li key={feature} className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
            <span className="text-muted-foreground">{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: Create `apps/mvp_web/app/how-it-works/page.tsx`**

```tsx
import type { Metadata } from "next"
import { StepByStep } from "@/components/step-by-step"
import { SupportedFeatures } from "@/components/supported-features"

export const metadata: Metadata = {
  title: "How It Works",
  description:
    "From boundary to bankable layout in minutes. Learn how SolarLayout automates PV plant design.",
}

export default function HowItWorksPage() {
  return (
    <div className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-16">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            How SolarLayout Works
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            From boundary to bankable layout — in minutes.
          </p>
        </div>

        <StepByStep />
        <SupportedFeatures />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `apps/mvp_web/app/how-it-works/page.test.tsx`**

```tsx
import { test, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

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

import HowItWorksPage from "./page"

test("renders page heading", () => {
  render(<HowItWorksPage />)
  expect(
    screen.getByRole("heading", {
      level: 1,
      name: /How SolarLayout Works/i,
    })
  ).toBeInTheDocument()
})

test("renders all four steps", () => {
  render(<HowItWorksPage />)
  expect(screen.getByText("Import Your Boundary")).toBeInTheDocument()
  expect(
    screen.getByText("Configure Your Parameters")
  ).toBeInTheDocument()
  expect(
    screen.getByText("Generate Your Layout")
  ).toBeInTheDocument()
  expect(screen.getByText("Export Your Results")).toBeInTheDocument()
})

test("renders step descriptions from PRD", () => {
  render(<HowItWorksPage />)
  expect(
    screen.getByText(/Load your site KMZ file/i)
  ).toBeInTheDocument()
  expect(
    screen.getByText(/Both string inverter and central inverter/i)
  ).toBeInTheDocument()
})

test("renders supported features", () => {
  render(<HowItWorksPage />)
  expect(
    screen.getByText("Supported Features")
  ).toBeInTheDocument()
  expect(
    screen.getByText(/KMZ boundary input with multiple plant areas/i)
  ).toBeInTheDocument()
  expect(
    screen.getByText(/P50 \/ P75 \/ P90 exceedance values/i)
  ).toBeInTheDocument()
})
```

- [ ] **Step 5: Run tests**

```bash
bunx turbo test --filter=@renewable-energy/mvp-web
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/mvp_web/
git commit -m "feat: add How It Works page with step-by-step and supported features"
```

---

## Task 7: About + FAQ Pages

**Files:**
- Create: `apps/mvp_web/app/about/page.tsx`
- Create: `apps/mvp_web/app/about/page.test.tsx`
- Create: `apps/mvp_web/components/faq-accordion.tsx`
- Create: `apps/mvp_web/app/faq/page.tsx`
- Create: `apps/mvp_web/app/faq/page.test.tsx`
- Create: `apps/mvp_web/components/faq-accordion.test.tsx`

- [ ] **Step 1: Create `apps/mvp_web/app/about/page.tsx`**

```tsx
import type { Metadata } from "next"
import { Shield } from "lucide-react"

export const metadata: Metadata = {
  title: "About Us",
  description:
    "SolarLayout is built by solar industry veterans with deep roots in large-scale PV plant development.",
}

export default function AboutPage() {
  return (
    <div className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Built by Solar Industry Veterans
          </h1>
        </div>

        <div className="mt-10 space-y-6 text-lg leading-relaxed text-muted-foreground">
          <p>
            SolarLayout has been developed by a team of experienced
            professionals with deep roots in the solar and renewable
            energy industry. With years of hands-on experience in
            large-scale PV plant development, land acquisition, and
            project engineering, we built the tools we always wished we
            had.
          </p>

          <p>
            We understand the challenges of utility-scale solar — the
            time-consuming manual layout work, the need for quick
            capacity estimates during land acquisition, and the
            pressure to produce bankable reports fast. SolarLayout
            automates the repetitive engineering work so you can focus
            on the decisions that matter.
          </p>

          <div className="rounded-lg border border-accent/30 bg-accent/5 p-6">
            <h2 className="text-xl font-semibold text-foreground">
              Our Mission
            </h2>
            <p className="mt-3 text-muted-foreground">
              Our mission is to put powerful, automated layout design
              tools in the hands of every solar professional — saving
              hours of manual work and enabling faster, smarter project
              decisions.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `apps/mvp_web/app/about/page.test.tsx`**

```tsx
import { test, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

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

import AboutPage from "./page"

test("renders page heading", () => {
  render(<AboutPage />)
  expect(
    screen.getByRole("heading", {
      level: 1,
      name: /Built by Solar Industry Veterans/i,
    })
  ).toBeInTheDocument()
})

test("renders mission statement", () => {
  render(<AboutPage />)
  expect(screen.getByText("Our Mission")).toBeInTheDocument()
  expect(
    screen.getByText(/powerful, automated layout design tools/i)
  ).toBeInTheDocument()
})

test("renders about body content", () => {
  render(<AboutPage />)
  expect(
    screen.getByText(/deep roots in the solar and renewable energy/i)
  ).toBeInTheDocument()
})
```

- [ ] **Step 3: Create `apps/mvp_web/components/faq-accordion.tsx`**

```tsx
"use client"

import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@renewable-energy/ui/components/accordion"

interface FaqItem {
  question: string
  answer: string
}

interface FaqCategory {
  category: string
  items: FaqItem[]
}

const faqData: FaqCategory[] = [
  {
    category: "About the Software",
    items: [
      {
        question: "What is SolarLayout?",
        answer:
          "SolarLayout is a suite of Windows desktop tools that automate the design of utility-scale fixed-tilt PV solar plant layouts. You provide a site boundary (KMZ file) and plant parameters, and the software generates a complete layout including MMS table placement, inverter positioning, cable routing, and energy yield analysis.",
      },
      {
        question: "What file format do I need to use as input?",
        answer:
          "SolarLayout accepts KMZ files as the primary input format. These files define your plant boundary polygons, including any exclusion zones for obstacles, water bodies, or transmission line corridors. KMZ files can be created using Google Earth Pro or any GIS tool that exports to KMZ.",
      },
      {
        question: "Which Windows versions are supported?",
        answer:
          "SolarLayout requires Windows 10 or higher. Both Windows 10 and Windows 11 are fully supported. The software requires a minimum of 8 GB RAM and 500 MB of free disk space.",
      },
      {
        question:
          "Do I need to install anything else to run the software?",
        answer:
          "No additional software is required. SolarLayout is a standalone executable that runs directly on Windows. No runtime libraries, frameworks, or other dependencies need to be installed.",
      },
      {
        question: "Does the software work offline?",
        answer:
          "The core layout generation functionality works offline. In Phase 2, an internet connection will be required for entitlement validation (checking your remaining calculation count) at software launch. Once validated, layout generation itself does not require connectivity.",
      },
    ],
  },
  {
    category: "Products & Downloads",
    items: [
      {
        question:
          "What is the difference between the three products?",
        answer:
          "PV Layout Basic generates plant layouts with MMS table, inverter, and lightning arrester placement. PV Layout Pro adds AC/DC cable routing with full quantity measurements. PV Layout Pro Plus adds energy yield analysis with P50/P75/P90 exceedance values and plant generation estimates. Each tier includes all features of the tier below it.",
      },
      {
        question: "How do I download the software?",
        answer:
          "Visit the Products page and click the Download button for the tool you need. You will be asked to provide your name and email address. After submitting, the download will begin automatically. Your email is used to manage your entitlements.",
      },
      {
        question: "Is the software free?",
        answer:
          "SolarLayout offers a free trial download. Each product tier includes a set number of calculations in its one-time purchase price: 5 for Basic ($1.99), 10 for Pro ($4.99), and 50 for Pro Plus ($14.99). Payment processing will be available in Phase 2.",
      },
      {
        question: "Can I try before I buy?",
        answer:
          "Yes. You can download any of the three tools to explore the interface and functionality. The trial allows you to evaluate the software before purchasing calculation entitlements.",
      },
    ],
  },
  {
    category: "Entitlements & Calculations",
    items: [
      {
        question: "What counts as one calculation?",
        answer:
          "One calculation is a single layout generation run. Each time you provide a boundary and parameters and generate a new layout, one calculation is deducted from your entitlement. Exporting results from a completed layout does not consume additional calculations.",
      },
      {
        question: "What happens when I run out of calculations?",
        answer:
          "When your calculation entitlement is exhausted, you can purchase a top-up pack at the same per-calculation rate. The software will notify you of your remaining count before each run. Top-up purchases will be available in Phase 2.",
      },
      {
        question: "Can I top up my calculations?",
        answer:
          "Yes. Top-up calculation packs will be available at the same rate as the original purchase. For example, PV Layout Basic top-ups will be priced proportionally to the $1.99 / 5-calculation base rate. The top-up purchase flow will be available in Phase 2.",
      },
      {
        question: "Is my entitlement tied to one machine?",
        answer:
          "No. Your entitlement is tied to your registered email address, not to a specific machine. You can use any Windows computer — simply enter your registered email when the software prompts for it, and your remaining calculations will be retrieved from the server.",
      },
    ],
  },
  {
    category: "Payments",
    items: [
      {
        question: "How do I purchase a plan?",
        answer:
          "Payment processing is coming in Phase 2. Currently, you can download the software and explore its capabilities. Pricing is listed on the Pricing page, and purchases will be enabled once the payment gateway is integrated.",
      },
      {
        question: "What payment methods are accepted?",
        answer:
          "Payment methods will be confirmed when the payment gateway is integrated in Phase 2. We plan to support standard options including credit/debit cards and UPI for Indian users.",
      },
      {
        question: "Will I receive a receipt?",
        answer:
          "Yes. Once payment processing is live in Phase 2, you will receive an email receipt with your purchase details and entitlement information after every transaction.",
      },
    ],
  },
  {
    category: "Support",
    items: [
      {
        question: "How do I contact support?",
        answer:
          "You can reach us via the Contact page on this website, or email us directly at support@solarlayout.in. We aim to respond to all queries within 2 business days.",
      },
      {
        question:
          "What if the software crashes or gives wrong results?",
        answer:
          "Please report any issues via the Contact page with as much detail as possible — including the KMZ file used, the parameters entered, and any error messages shown. Our engineering team will investigate and provide a fix or workaround. Calculations lost due to confirmed software bugs will be credited back to your entitlement.",
      },
    ],
  },
]

export function FaqAccordion() {
  return (
    <div className="space-y-10">
      {faqData.map((category) => (
        <div key={category.category}>
          <h2 className="mb-4 text-xl font-semibold text-foreground">
            {category.category}
          </h2>
          <Accordion type="single" collapsible className="w-full">
            {category.items.map((item) => (
              <AccordionItem
                key={item.question}
                value={item.question}
              >
                <AccordionTrigger className="text-left">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent>
                  <p className="text-muted-foreground">
                    {item.answer}
                  </p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Create `apps/mvp_web/app/faq/page.tsx`**

```tsx
import type { Metadata } from "next"
import { FaqAccordion } from "@/components/faq-accordion"

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Frequently asked questions about SolarLayout PV layout design tools — products, downloads, entitlements, payments, and support.",
}

export default function FaqPage() {
  return (
    <div className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Frequently Asked Questions
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Everything you need to know about SolarLayout. Can&apos;t
            find your answer?{" "}
            <a
              href="/contact"
              className="text-primary underline hover:text-primary/80"
            >
              Contact us
            </a>
            .
          </p>
        </div>

        <div className="mt-12">
          <FaqAccordion />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create `apps/mvp_web/components/faq-accordion.test.tsx`**

```tsx
import { test, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { FaqAccordion } from "./faq-accordion"

test("renders all FAQ categories", () => {
  render(<FaqAccordion />)
  expect(screen.getByText("About the Software")).toBeInTheDocument()
  expect(
    screen.getByText("Products & Downloads")
  ).toBeInTheDocument()
  expect(
    screen.getByText("Entitlements & Calculations")
  ).toBeInTheDocument()
  expect(screen.getByText("Payments")).toBeInTheDocument()
  expect(screen.getByText("Support")).toBeInTheDocument()
})

test("renders FAQ questions", () => {
  render(<FaqAccordion />)
  expect(
    screen.getByText("What is SolarLayout?")
  ).toBeInTheDocument()
  expect(
    screen.getByText(
      "What is the difference between the three products?"
    )
  ).toBeInTheDocument()
  expect(
    screen.getByText("How do I contact support?")
  ).toBeInTheDocument()
})

test("expands accordion item on click to reveal answer", async () => {
  const user = userEvent.setup()
  render(<FaqAccordion />)

  const trigger = screen.getByText("What is SolarLayout?")
  await user.click(trigger)

  expect(
    screen.getByText(
      /suite of Windows desktop tools that automate/i
    )
  ).toBeInTheDocument()
})
```

- [ ] **Step 6: Create `apps/mvp_web/app/faq/page.test.tsx`**

```tsx
import { test, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

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

import FaqPage from "./page"

test("renders page heading", () => {
  render(<FaqPage />)
  expect(
    screen.getByRole("heading", {
      level: 1,
      name: /Frequently Asked Questions/i,
    })
  ).toBeInTheDocument()
})

test("renders contact link", () => {
  render(<FaqPage />)
  expect(
    screen.getByRole("link", { name: /Contact us/i })
  ).toHaveAttribute("href", "/contact")
})
```

- [ ] **Step 7: Create `apps/mvp_web/app/about/page.test.tsx`** (already in Step 2)

Already created above.

- [ ] **Step 8: Run tests**

```bash
bunx turbo test --filter=@renewable-energy/mvp-web
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add apps/mvp_web/
git commit -m "feat: add About page and FAQ page with accordion"
```

---

## Task 8: Contact Page

**Files:**
- Create: `apps/mvp_web/components/contact-info.tsx`
- Create: `apps/mvp_web/components/contact-form.tsx`
- Create: `apps/mvp_web/app/contact/page.tsx`
- Create: `apps/mvp_web/app/contact/page.test.tsx`
- Create: `apps/mvp_web/components/contact-form.test.tsx`

- [ ] **Step 1: Create `apps/mvp_web/components/contact-info.tsx`**

```tsx
import { Mail, MapPin, Linkedin, Youtube } from "lucide-react"

const contactDetails = [
  {
    icon: Mail,
    label: "Email",
    value: "support@solarlayout.in",
    href: "mailto:support@solarlayout.in",
  },
  {
    icon: MapPin,
    label: "Location",
    value: "Bangalore, India",
    href: null,
  },
]

const socialLinks = [
  {
    icon: Linkedin,
    label: "LinkedIn",
    href: "https://linkedin.com",
  },
  {
    icon: Youtube,
    label: "YouTube",
    href: "https://youtube.com",
  },
]

export function ContactInfo() {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-foreground">
        Get in Touch
      </h2>

      <div className="space-y-4">
        {contactDetails.map((detail) => (
          <div
            key={detail.label}
            className="flex items-start gap-3"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <detail.icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {detail.label}
              </p>
              {detail.href ? (
                <a
                  href={detail.href}
                  className="text-sm text-muted-foreground transition-colors hover:text-primary"
                >
                  {detail.value}
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {detail.value}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          Follow Us
        </h3>
        <div className="flex gap-3">
          {socialLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={link.label}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-border transition-colors hover:bg-muted"
            >
              <link.icon className="h-5 w-5 text-muted-foreground" />
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `apps/mvp_web/components/contact-form.tsx`**

```tsx
"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@renewable-energy/ui/components/button"
import { Input } from "@renewable-energy/ui/components/input"
import { Textarea } from "@renewable-energy/ui/components/textarea"
import { Label } from "@renewable-energy/ui/components/label"

export function ContactForm() {
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (
      !fullName.trim() ||
      !email.trim() ||
      !subject.trim() ||
      !message.trim()
    ) {
      toast.error("Please fill in all required fields.")
      return
    }

    toast.info(
      "Message sending coming soon. Thank you for reaching out — we will get back to you within 2 business days."
    )
    setFullName("")
    setEmail("")
    setSubject("")
    setMessage("")
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="contact-name">
          Full Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="contact-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Enter your full name"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-email">
          Email Address <span className="text-destructive">*</span>
        </Label>
        <Input
          id="contact-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-subject">
          Subject <span className="text-destructive">*</span>
        </Label>
        <Input
          id="contact-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="What is this regarding?"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-message">
          Message <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us more..."
          rows={5}
          required
        />
      </div>

      <Button
        type="submit"
        className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
      >
        Send Message
      </Button>
    </form>
  )
}
```

- [ ] **Step 3: Create `apps/mvp_web/app/contact/page.tsx`**

```tsx
import type { Metadata } from "next"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@renewable-energy/ui/components/card"
import { ContactInfo } from "@/components/contact-info"
import { ContactForm } from "@/components/contact-form"

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Get in touch with the SolarLayout team. Email, location, and contact form.",
}

export default function ContactPage() {
  return (
    <div className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Contact Us
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Have a question or need help? We would love to hear from
            you.
          </p>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <ContactInfo />
          </div>
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle>Send us a message</CardTitle>
              </CardHeader>
              <CardContent>
                <ContactForm />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `apps/mvp_web/components/contact-form.test.tsx`**

```tsx
import { test, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("sonner", () => ({
  toast: {
    info: vi.fn(),
    error: vi.fn(),
  },
}))

import { ContactForm } from "./contact-form"
import { toast } from "sonner"

test("renders all form fields", () => {
  render(<ContactForm />)
  expect(
    screen.getByPlaceholderText("Enter your full name")
  ).toBeInTheDocument()
  expect(
    screen.getByPlaceholderText("you@company.com")
  ).toBeInTheDocument()
  expect(
    screen.getByPlaceholderText("What is this regarding?")
  ).toBeInTheDocument()
  expect(
    screen.getByPlaceholderText("Tell us more...")
  ).toBeInTheDocument()
})

test("renders Send Message button", () => {
  render(<ContactForm />)
  expect(
    screen.getByRole("button", { name: /Send Message/i })
  ).toBeInTheDocument()
})

test("shows toast on valid submit", async () => {
  const user = userEvent.setup()
  render(<ContactForm />)

  await user.type(
    screen.getByPlaceholderText("Enter your full name"),
    "Test User"
  )
  await user.type(
    screen.getByPlaceholderText("you@company.com"),
    "test@example.com"
  )
  await user.type(
    screen.getByPlaceholderText("What is this regarding?"),
    "Support"
  )
  await user.type(
    screen.getByPlaceholderText("Tell us more..."),
    "I need help with the software."
  )

  await user.click(
    screen.getByRole("button", { name: /Send Message/i })
  )

  expect(toast.info).toHaveBeenCalledWith(
    expect.stringContaining("Message sending coming soon")
  )
})
```

- [ ] **Step 5: Create `apps/mvp_web/app/contact/page.test.tsx`**

```tsx
import { test, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

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
  toast: { info: vi.fn(), error: vi.fn() },
}))

import ContactPage from "./page"

test("renders page heading", () => {
  render(<ContactPage />)
  expect(
    screen.getByRole("heading", {
      level: 1,
      name: /Contact Us/i,
    })
  ).toBeInTheDocument()
})

test("renders contact info", () => {
  render(<ContactPage />)
  expect(
    screen.getByText("support@solarlayout.in")
  ).toBeInTheDocument()
  expect(screen.getByText("Bangalore, India")).toBeInTheDocument()
})

test("renders contact form", () => {
  render(<ContactPage />)
  expect(
    screen.getByText("Send us a message")
  ).toBeInTheDocument()
  expect(
    screen.getByRole("button", { name: /Send Message/i })
  ).toBeInTheDocument()
})
```

- [ ] **Step 6: Run tests**

```bash
bunx turbo test --filter=@renewable-energy/mvp-web
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/mvp_web/
git commit -m "feat: add Contact page with ContactInfo and ContactForm (stubbed)"
```

---

## Task 9: Legal Pages (Terms + Privacy)

**Files:**
- Create: `apps/mvp_web/app/terms/page.tsx`
- Create: `apps/mvp_web/app/terms/page.test.tsx`
- Create: `apps/mvp_web/app/privacy/page.tsx`
- Create: `apps/mvp_web/app/privacy/page.test.tsx`

- [ ] **Step 1: Create `apps/mvp_web/app/terms/page.tsx`**

```tsx
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Terms & Conditions",
  description:
    "Terms and conditions for using SolarLayout software and services.",
}

export default function TermsPage() {
  return (
    <div className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Terms &amp; Conditions
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: April 2026
        </p>

        <div className="mt-8 space-y-6 text-muted-foreground">
          <section>
            <h2 className="text-xl font-semibold text-foreground">
              1. Introduction
            </h2>
            <p className="mt-2">
              These Terms and Conditions govern your use of the
              SolarLayout website and desktop software products. By
              accessing or using our services, you agree to be bound by
              these terms. SolarLayout is operated from Bangalore,
              Karnataka, India.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">
              2. Software Licence
            </h2>
            <p className="mt-2">
              SolarLayout grants you a non-exclusive, non-transferable
              licence to use the software for the number of calculations
              included in your purchased plan. The software is provided
              for professional use in solar PV plant layout design.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">
              3. Intellectual Property
            </h2>
            <p className="mt-2">
              All intellectual property rights in the SolarLayout
              software, website, and related materials are owned by
              SolarLayout. You may not reverse engineer, decompile, or
              disassemble the software.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">
              4. Limitation of Liability
            </h2>
            <p className="mt-2">
              SolarLayout provides the software on an &quot;as is&quot;
              basis. While we strive for accuracy in layout generation,
              all outputs should be independently verified by qualified
              engineers before use in project decision-making. We are
              not liable for any losses arising from reliance on
              software outputs.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">
              5. Refund Policy
            </h2>
            <p className="mt-2">
              Refund requests will be considered on a case-by-case basis
              for confirmed software defects that prevent usage.
              Calculations consumed on valid runs are non-refundable.
              Refund policy details will be finalized when payment
              processing is enabled in Phase 2.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">
              6. Prohibited Uses
            </h2>
            <p className="mt-2">
              You may not redistribute, sublicence, or share the
              software or your entitlements with third parties. You may
              not use the software for any unlawful purpose or in any
              manner that could damage, disable, or impair the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">
              7. Governing Law and Jurisdiction
            </h2>
            <p className="mt-2">
              These terms are governed by the laws of India, including
              the Information Technology Act 2000 and the Consumer
              Protection Act 2019. Any disputes shall be subject to the
              exclusive jurisdiction of the courts in Bangalore,
              Karnataka, India.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">
              8. Changes to These Terms
            </h2>
            <p className="mt-2">
              We may update these terms from time to time. Continued use
              of the software after changes constitutes acceptance of
              the revised terms.
            </p>
          </section>

          <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 text-sm">
            <strong className="text-foreground">Note:</strong> Full
            legal content compliant with the Information Technology Act
            2000, Consumer Protection Act 2019, and DPDP Act 2023 will
            replace this preliminary version following legal review.
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `apps/mvp_web/app/terms/page.test.tsx`**

```tsx
import { test, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

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

import TermsPage from "./page"

test("renders page heading", () => {
  render(<TermsPage />)
  expect(
    screen.getByRole("heading", {
      level: 1,
      name: /Terms & Conditions/i,
    })
  ).toBeInTheDocument()
})

test("renders all sections", () => {
  render(<TermsPage />)
  expect(screen.getByText("1. Introduction")).toBeInTheDocument()
  expect(screen.getByText("2. Software Licence")).toBeInTheDocument()
  expect(
    screen.getByText("7. Governing Law and Jurisdiction")
  ).toBeInTheDocument()
})

test("mentions Bangalore jurisdiction", () => {
  render(<TermsPage />)
  expect(
    screen.getByText(/Bangalore, Karnataka, India/i)
  ).toBeInTheDocument()
})
```

- [ ] **Step 3: Create `apps/mvp_web/app/privacy/page.tsx`**

```tsx
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Privacy policy for SolarLayout — how we collect, use, and protect your personal data.",
}

export default function PrivacyPage() {
  return (
    <div className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Last updated: April 2026
        </p>

        <div className="mt-8 space-y-6 text-muted-foreground">
          <section>
            <h2 className="text-xl font-semibold text-foreground">
              1. Data We Collect
            </h2>
            <p className="mt-2">
              When you download our software or contact us, we collect
              the following personal data:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              <li>Full name</li>
              <li>Email address</li>
              <li>Mobile number (optional)</li>
              <li>IP address</li>
              <li>Product selected and download timestamp</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">
              2. Why We Collect Your Data
            </h2>
            <p className="mt-2">
              We collect your data to manage software entitlements,
              provide customer support, communicate product updates, and
              improve our services. Your email address is the primary
              identifier for your software entitlements.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">
              3. How We Store Your Data
            </h2>
            <p className="mt-2">
              Your data is stored securely using industry-standard
              encryption at rest and in transit. We use cloud
              infrastructure hosted on AWS with data centres that comply
              with international security standards.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">
              4. Data Retention
            </h2>
            <p className="mt-2">
              We retain your personal data for as long as your
              entitlement is active, plus a period of 3 years after your
              last interaction with our services. After this period,
              your data will be securely deleted.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">
              5. Your Rights
            </h2>
            <p className="mt-2">
              Under the Digital Personal Data Protection (DPDP) Act
              2023, you have the right to:
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your personal data</li>
              <li>
                Withdraw consent for data processing at any time
              </li>
            </ul>
            <p className="mt-2">
              To exercise any of these rights, email us at
              support@solarlayout.in.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">
              6. Third-Party Sharing
            </h2>
            <p className="mt-2">
              We do not sell your personal data. We may share data with
              third-party service providers (e.g., cloud hosting,
              analytics) solely to operate and improve our services. All
              third-party providers are contractually obligated to
              protect your data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">
              7. Cookies
            </h2>
            <p className="mt-2">
              We use cookies for analytics purposes (Google Analytics
              4). Analytics cookies are only activated after you provide
              consent via the cookie consent banner. Essential cookies
              required for website functionality do not require consent.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">
              8. Grievance Officer
            </h2>
            <p className="mt-2">
              In accordance with the Information Technology Act 2000 and
              the DPDP Act 2023, our Grievance Officer can be reached
              at:
            </p>
            <p className="mt-2">
              <strong className="text-foreground">Email:</strong>{" "}
              grievance@solarlayout.in
              <br />
              <strong className="text-foreground">
                Location:
              </strong>{" "}
              Bangalore, Karnataka, India
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground">
              9. Changes to This Policy
            </h2>
            <p className="mt-2">
              We may update this privacy policy from time to time.
              Changes will be posted on this page with an updated
              revision date.
            </p>
          </section>

          <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 text-sm">
            <strong className="text-foreground">Note:</strong> Full
            privacy policy compliant with the Digital Personal Data
            Protection (DPDP) Act 2023 will replace this preliminary
            version following legal review.
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `apps/mvp_web/app/privacy/page.test.tsx`**

```tsx
import { test, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

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

import PrivacyPage from "./page"

test("renders page heading", () => {
  render(<PrivacyPage />)
  expect(
    screen.getByRole("heading", {
      level: 1,
      name: /Privacy Policy/i,
    })
  ).toBeInTheDocument()
})

test("renders data collection section", () => {
  render(<PrivacyPage />)
  expect(
    screen.getByText("1. Data We Collect")
  ).toBeInTheDocument()
  expect(screen.getByText("Email address")).toBeInTheDocument()
})

test("renders DPDP Act reference", () => {
  render(<PrivacyPage />)
  expect(
    screen.getByText(/Digital Personal Data Protection/i)
  ).toBeInTheDocument()
})

test("renders grievance officer section", () => {
  render(<PrivacyPage />)
  expect(
    screen.getByText("8. Grievance Officer")
  ).toBeInTheDocument()
  expect(
    screen.getByText("grievance@solarlayout.in")
  ).toBeInTheDocument()
})
```

- [ ] **Step 5: Run tests**

```bash
bunx turbo test --filter=@renewable-energy/mvp-web
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/mvp_web/
git commit -m "feat: add Terms and Privacy placeholder pages"
```

---

## Task 10: Full Gate

**Files:** None (verification only)

- [ ] **Step 1: Run full lint + typecheck + test + build gate from repo root**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all four pass with zero errors.

- [ ] **Step 2: If any gate fails, diagnose and fix the issue**

Common issues to watch for:
- **Lint errors**: unused imports, missing `"use client"` directives, import order
- **Typecheck errors**: missing type annotations, incorrect prop types, next.config.mjs not in `include`
- **Test failures**: missing mock for `next/link` or `next/navigation`, missing `sonner` mock
- **Build failures**: incorrect import paths, missing CSS file references

Fix any issues, re-run the gate, and commit the fix.

- [ ] **Step 3: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix: resolve gate failures in mvp_web"
```

---

## Self-Review Checklist

### Spec Coverage

| Spec Requirement | Task |
|---|---|
| App scaffold (package.json, tsconfig, next.config, etc.) | Task 1 |
| `@source` directive in UI package globals.css | Task 1, Step 1 |
| Solar brand palette CSS overrides | Task 2, Step 1 |
| Root layout with Geist font, metadata | Task 2, Step 5 |
| Toaster (Sonner) for stubbed forms | Task 2, Step 2 |
| Sticky Header with logo, nav, CTA, mobile Sheet drawer | Task 2, Step 3 |
| Footer with logo, tagline, nav, legal, social, contact | Task 2, Step 4 |
| Home: HeroSection | Task 3, Step 1 |
| Home: FeaturesOverview (3 product cards) | Task 3, Step 2 |
| Home: HowItWorksSummary (4 steps) | Task 3, Step 3 |
| Home: ScreenshotsSection (placeholders + lightbox) | Task 3, Step 4 |
| Home: SystemRequirements (table) | Task 3, Step 5 |
| Products: ProductCard with price badge, features, Download button | Task 4, Step 2 |
| Products: DownloadModal (name, email, mobile, T&C checkbox, stub toast) | Task 4, Step 1 |
| Pricing: PricingCards with feature comparison table | Task 5, Step 1 |
| Pricing: Disabled Buy Now with tooltip | Task 5, Step 1 |
| Pricing: Top-up note | Task 5, Step 1 |
| How It Works: StepByStep (4 steps with PRD descriptions) | Task 6, Step 1 |
| How It Works: SupportedFeatures (bulleted list from PRD) | Task 6, Step 2 |
| About: Headline, body, mission statement, no personal details | Task 7, Step 1 |
| FAQ: FaqAccordion with 5 categories, real answers | Task 7, Step 3 |
| Contact: ContactInfo (email, location, LinkedIn, YouTube) | Task 8, Step 1 |
| Contact: ContactForm (name, email, subject, message, stub toast) | Task 8, Step 2 |
| Terms: Placeholder with IT Act, Consumer Protection Act mentions | Task 9, Step 1 |
| Privacy: Placeholder with DPDP Act, grievance officer, data collection | Task 9, Step 3 |
| All 9 routes created | Tasks 3-9 |
| Tests for every page and interactive component | Tasks 2-9 |
| Full gate (lint, typecheck, test, build) | Task 10 |

### Placeholder Scan

No TBD, TODO, or "fill in later" placeholders exist in this plan. All code is complete and copy-pasteable. Legal pages contain preliminary content with a note about future legal review (this is by design per the spec).

### Type Consistency

| Item | Consistent? |
|---|---|
| Component names match file names (PascalCase) | Yes |
| All `next/link` mocks use same pattern across tests | Yes |
| `DownloadModal` props: `productName: string`, `children: React.ReactNode` | Yes |
| `ProductCard` props match usage in Products page | Yes |
| Import paths use `@/components/` and `@renewable-energy/ui/components/` consistently | Yes |
| `sonner` mock pattern consistent across DownloadModal and ContactForm tests | Yes |
| `toast.info` / `toast.error` calls match mock structure | Yes |
