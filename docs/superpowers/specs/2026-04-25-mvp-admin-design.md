# mvp_admin App — Design Spec

**Date:** 2026-04-25  
**Status:** Approved  
**Scope:** New `apps/mvp_admin` workspace + supporting changes to `packages/mvp_db` and `apps/mvp_api`

---

## 1. Goal

Add an internal admin/ops application (`mvp_admin`) to the SolarLayout monorepo. The app allows ADMIN and OPS users to manage the platform. In this first phase the primary functional capability is admin user management (create, edit roles, deactivate). A dashboard placeholder page is included; its content is defined in a later spike.

The app is invite-only — there is no public sign-up flow. All user accounts are provisioned by an ADMIN via the admin app itself.

---

## 2. Architecture

### New workspace

| Property | Value |
|---|---|
| Path | `apps/mvp_admin` |
| Package name | `@renewable-energy/mvp-admin` |
| Framework | Next.js 16 App Router |
| Dev port | `3004` |
| Production URL | `https://admin.solarlayout.in` |
| Clerk instance | Shared with `mvp_web` (same `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`) |

### Monorepo hard boundary preserved

`apps/mvp_admin` never imports `@renewable-energy/mvp-db` directly. All data access flows:

```
apps/mvp_admin → HTTP → apps/mvp_api → @renewable-energy/mvp-db → PostgreSQL
```

### Changes to existing workspaces

| Workspace | Change | Breaking? |
|---|---|---|
| `packages/mvp_db` | Add `roles String[] @default([])` and `status String @default("ACTIVE")` to `User` model | No — defaults preserve existing rows |
| `apps/mvp_api` | Add `requireRole()` RBAC middleware + `/admin/*` routes | No — additive only, existing routes unchanged |
| `apps/mvp_api` | Update `clerkAuth` to read `metadata.roles` from JWT and store on `HonoEnv` user context | No — existing routes ignore roles |

### Clerk JWT template (manual one-time setup)

A Clerk "Session token" customization must be configured in the Clerk dashboard to expose `publicMetadata` as `metadata` in the JWT:

```json
{
  "metadata": "{{user.public_metadata}}"
}
```

This is required for server-side role checks in both `mvp_admin` and `mvp_api`. Without it `sessionClaims.metadata.roles` is undefined and all users are denied access.

### Primordial ADMIN bootstrap

The first ADMIN user is set manually in the Clerk dashboard — open the user record, set `publicMetadata`:

```json
{ "roles": ["ADMIN"] }
```

After that all admin and ops users are created via the admin app.

---

## 3. Roles & Access Control

### Role definitions

| Role | Capabilities |
|---|---|
| `ADMIN` | Full access: dashboard, user list, create user, edit roles, deactivate/reactivate user |
| `OPS` | All of the above **except** user management pages (create, edit, list users) |

Roles are stored as a string array in Clerk `publicMetadata.roles` (source of truth) and mirrored to `User.roles` in the database after every mutation.

### Role flow

1. JWT token carries `metadata.roles` (via Clerk session customization)
2. `apps/mvp_admin` layout server component reads `sessionClaims.metadata.roles`
3. Users with neither `ADMIN` nor `OPS` role are shown an "Access Denied" page
4. User management pages additionally redirect `OPS` users to `/dashboard`
5. `mvp_api` admin routes are protected by `requireRole("ADMIN")` middleware

### Role type

```typescript
// shared across mvp_api — defined in src/middleware/clerk-auth.ts
type AdminRole = "ADMIN" | "OPS"
```

### RBAC middleware in `mvp_api`

```typescript
// src/middleware/rbac.ts
export function requireRole(...roles: AdminRole[]): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const user = c.get("user")
    if (!user.roles.some((r) => roles.includes(r))) {
      throw new AppError("FORBIDDEN", "Insufficient role", 403)
    }
    return next()
  }
}
```

---

## 4. Database changes (`packages/mvp_db`)

### Migration

```prisma
model User {
  // existing fields unchanged ...
  roles  String[] @default([])
  status String   @default("ACTIVE")
}
```

New migration: `add_roles_status_to_user`

### Backward compatibility

- Existing rows get `roles = []` and `status = "ACTIVE"` via defaults
- `mvp_web` and `mvp_api` existing behaviour is unchanged — neither reads `roles` or `status` today

---

## 5. API changes (`apps/mvp_api`)

### Updated `clerkAuth` middleware

After finding/creating the user, store `roles` from the DB on the Hono context:

```typescript
c.set("user", { ...existingFields, roles: user.roles as AdminRole[] })
```

The JWT `metadata.roles` is used only for **new user creation** (seeding initial roles). For existing users the DB value is authoritative (same pattern as Happyfeet — avoids stale JWT cache race).

After resolving the user, `clerkAuth` also checks `user.status` — if not `"ACTIVE"`, throws 401. This means deactivated users cannot call any API endpoint even though their Clerk account is still active.

### New admin routes

All routes require `authMiddleware` + `requireRole("ADMIN")`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/users` | Paginated user list (`page`, `pageSize` query params). Returns `id, name, email, roles, status, createdAt`. |
| `POST` | `/admin/users` | Create user in Clerk + upsert in DB + set `publicMetadata.roles`. Body: `{ name, email, roles: ("ADMIN" \| "OPS")[] }`. |
| `PATCH` | `/admin/users/:id/roles` | Add or remove a single role. Body: `{ role, action: "add" \| "remove" }`. Read-spread-write on Clerk publicMetadata. |
| `PATCH` | `/admin/users/:id/status` | Set `ACTIVE` or `INACTIVE`. Body: `{ status }`. DB only — Clerk account remains active but `clerkAuth` rejects inactive users at the API level (401), blocking all further API calls. |

### User creation flow (`POST /admin/users`)

```
1. Call clerk.users.createUser({
     emailAddress: [email],
     firstName, lastName,
     publicMetadata: { roles },
     skipPasswordRequirement: true   ← no invite email sent
   })
2. Upsert User in DB with clerkId, email, name, roles, status: "ACTIVE"
3. Return { id, email, name, roles, status }
```

New user sets their own password via "Forgot password" on the admin app sign-in page. No automated email is sent from the system.

### Role mutation pattern (read-spread-write)

```typescript
const clerkUser = await clerk.users.getUser(user.clerkId)
const current = (clerkUser.publicMetadata?.roles ?? []) as AdminRole[]
const updated = action === "add"
  ? [...new Set([...current, role])]
  : current.filter((r) => r !== role)

await clerk.users.updateUser(user.clerkId, {
  publicMetadata: { ...clerkUser.publicMetadata, roles: updated },
})
await db.user.update({ where: { id: userId }, data: { roles: updated } })
```

---

## 6. `apps/mvp_admin` — App structure

### Route tree

```
apps/mvp_admin/app/
  layout.tsx                          ← ClerkProvider, ThemeProvider, QueryProvider, Toaster
  globals.css                         ← imports @renewable-energy/ui/globals.css + admin theme overrides
  sign-in/[[...sign-in]]/page.tsx     ← Clerk <SignIn /> centred, no sign-up link
  (admin)/
    layout.tsx                        ← server: reads sessionClaims.metadata.roles, denies if no role
    dashboard/
      page.tsx                        ← placeholder (content TBD in later spike)
    users/
      page.tsx                        ← ADMIN only: paginated user table
      new/
        page.tsx                      ← ADMIN only: create user form
      [id]/
        page.tsx                      ← ADMIN only: edit roles + status (tabbed: Profile / Access)
```

### Sidebar

Component: `AdminSidebar` — same `Sidebar`, `SidebarContent`, `SidebarHeader`, `SidebarFooter`, `SidebarRail` primitives from `@renewable-energy/ui`.

```
Header:  ShieldCheck icon  |  "SolarLayout"  /  "Admin"
Nav:     Dashboard                    (ADMIN + OPS)
         Users                        (ADMIN only)
Footer:  Avatar + name + email + role badge  |  sign out dropdown
```

Role badge in footer: `ADMIN` → blue `Badge`; `OPS` → secondary `Badge`.

The `(admin)/layout.tsx` server component reads `sessionClaims.metadata.roles`, determines `primaryRole`, and passes it as a prop to `AdminSidebar` (a `"use client"` component). No intermediate RSC wrapper needed — direct server-to-client prop.

### Env vars (`apps/mvp_admin/.env.local`)

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<same as mvp_web>
CLERK_SECRET_KEY=<same as mvp_web>
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_MVP_API_URL=http://localhost:3003
```

Production URL: `https://admin.solarlayout.in` — must be added to `MVP_CORS_ORIGINS` in `mvp_api` production env and to the Clerk dashboard's allowed origins.

No `NEXT_PUBLIC_CLERK_SIGN_UP_URL` — no self-sign-up in this app.

---

## 7. UI/UX & Theme

### Stack

Identical to `mvp_web`: Next.js 16 App Router, React 19, `@clerk/nextjs` v6, TanStack Query v5, `@renewable-energy/ui`, Lucide icons, Geist font, Vitest + Testing Library.

### Design principles

Same Nova conventions as `docs/ux-design.md`: no decorative gradients, no drop shadows for depth, sharp borders, muted fills, consistent Tailwind spacing. Full responsive web design — sidebar collapses to icon rail on tablet (`collapsible="icon"`), overlays as sheet on mobile (shadcn default behaviour).

### Color theme

The admin app uses a **slate-blue** primary palette to distinguish it from the consumer SolarLayout green. All other tokens (`--muted`, `--card`, `--border`, `--accent`) are identical to `mvp_web`.

```css
/* apps/mvp_admin/app/globals.css */
@import "@renewable-energy/ui/globals.css";

:root {
  --background: #F1F5F9;
  --foreground: #1C1C1C;
  --card: #FFFFFF;
  --card-foreground: #1C1C1C;
  --popover: #FFFFFF;
  --popover-foreground: #1C1C1C;
  --primary: #1E40AF;
  --primary-foreground: #FFFFFF;
  --secondary: #EFF6FF;
  --secondary-foreground: #1E40AF;
  --muted: #E2E8F0;
  --muted-foreground: #64748B;
  --accent: #F5A623;
  --accent-foreground: #1C1C1C;
  --destructive: #DC2626;
  --border: #CBD5E1;
  --input: #CBD5E1;
  --ring: #1E40AF;
  --radius: 0.625rem;
  --sidebar: #FFFFFF;
  --sidebar-foreground: #1C1C1C;
  --sidebar-primary: #1E40AF;
  --sidebar-primary-foreground: #FFFFFF;
  --sidebar-accent: #EFF6FF;
  --sidebar-accent-foreground: #1E40AF;
  --sidebar-border: #CBD5E1;
  --sidebar-ring: #1E40AF;
}

.dark {
  --background: #0F172A;
  --foreground: #E2E8F0;
  --card: #1E293B;
  --card-foreground: #E2E8F0;
  --popover: #1E293B;
  --popover-foreground: #E2E8F0;
  --primary: #3B82F6;
  --primary-foreground: #FFFFFF;
  --secondary: #1E3A5F;
  --secondary-foreground: #93C5FD;
  --muted: #1E293B;
  --muted-foreground: #94A3B8;
  --accent: #F5A623;
  --accent-foreground: #1C1C1C;
  --destructive: #EF4444;
  --border: #334155;
  --input: #334155;
  --ring: #3B82F6;
  --sidebar: #0F172A;
  --sidebar-foreground: #E2E8F0;
  --sidebar-primary: #3B82F6;
  --sidebar-primary-foreground: #FFFFFF;
  --sidebar-accent: #1E293B;
  --sidebar-accent-foreground: #E2E8F0;
  --sidebar-border: #334155;
  --sidebar-ring: #3B82F6;
}
```

Light mode is default. Dark mode available via `d` key (ThemeProvider, same as `mvp_web`).

---

## 8. Testing

- Co-located `*.test.ts` / `*.test.tsx` beside every source file (Vitest + Testing Library)
- API routes: unit tests for `adminService` functions; integration tests for routes with mocked DB
- UI components: render tests for `AdminSidebar` (role-based nav), user form validation
- TDD: failing test before any production code

---

## 9. turbo.json additions

```json
"@renewable-energy/mvp-admin#build": {
  "dependsOn": ["^build"],
  "outputs": [".next/**", "!.next/cache/**"],
  "env": [
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_CLERK_SIGN_IN_URL",
    "NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL",
    "NEXT_PUBLIC_MVP_API_URL",
    "NODE_ENV"
  ]
},
"@renewable-energy/mvp-admin#typecheck": {
  "dependsOn": ["^build"],
  "outputs": []
}
```

---

## 10. Out of scope (this spike)

- Dashboard page content (metrics, charts) — TBD in later spike
- Audit log / activity history
- Email notifications of any kind
- Two-factor enforcement
- Fine-grained permissions beyond `ADMIN` / `OPS`
