# Spike 5: Stripe Integration — Design Spec

**Date:** 2026-04-22  
**Spike:** 5 — Stripe Integration  
**Spike plan:** [docs/initiatives/mvp-spike-plan.md](../../initiatives/mvp-spike-plan.md)  
**Status:** Approved

---

## Overview

Add Stripe one-time payment integration to SolarLayout. Users purchase calculation packs from the dashboard Plan page via Stripe Checkout. On successful payment, an `Entitlement` (calculation balance) and `LicenseKey` (API key for desktop app) are provisioned automatically.

**Payment model:** One-time purchases (`mode: 'payment'`), not subscriptions. Users buy packs, use calculations, buy more when done. Purchases are additive — no downgrades.

**Why one-time, not subscription:** Target market is Indian solar professionals with project-based usage. Irregular usage patterns make subscriptions feel wasteful. Low price points ($1.99–$14.99) have high subscription-overhead-to-value ratio. One-time packs are a no-brainer impulse buy at launch. Subscriptions can be added as an upsell in a future spike once power users emerge.

**Why always Stripe Checkout (even for top-ups):** Indian RBI mandates require 2FA/OTP for most card transactions. Even saved-card charges trigger `requires_action` status. Stripe Checkout handles 3DS/OTP automatically. The UX difference is one redirect — not worth building custom PaymentIntent + 3DS handling for launch.

---

## Products

Three products, seeded per environment with environment-specific Stripe price IDs.

| Slug | Name | Price | Calculations | Features |
|---|---|---|---|---|
| `pv-layout-basic` | PV Layout Basic | $1.99 | 5 layout | `plant_layout`, `obstruction_exclusion` |
| `pv-layout-pro` | PV Layout Pro | $4.99 | 10 layout | `plant_layout`, `obstruction_exclusion`, `cable_routing`, `cable_measurements` |
| `pv-layout-pro-plus` | PV Layout Pro Plus | $14.99 | 50 layout + yield | `plant_layout`, `obstruction_exclusion`, `cable_routing`, `cable_measurements`, `energy_yield`, `generation_estimates` |

Feature labels (human-readable):

| Feature Key | Label |
|---|---|
| `plant_layout` | Plant Layout (MMS, Inverter, LA) |
| `obstruction_exclusion` | Obstruction Exclusion |
| `cable_routing` | AC & DC Cable Routing |
| `cable_measurements` | Cable Quantity Measurements |
| `energy_yield` | Energy Yield Analysis |
| `generation_estimates` | Plant Generation Estimates |

---

## Data Model

### New model: `Product` (seeded)

```prisma
model Product {
  id            String           @id @default("")
  slug          String           @unique
  name          String
  description   String
  priceAmount   Int              // cents (199 = $1.99)
  priceCurrency String           @default("usd")
  calculations  Int              // 5, 10, 50
  stripePriceId String           @unique
  displayOrder  Int              @default(0)
  active        Boolean          @default(true)
  features      ProductFeature[]
  entitlements  Entitlement[]
  createdAt     DateTime         @default(now())

  @@map("products")
}
```

### New model: `ProductFeature` (seeded)

```prisma
model ProductFeature {
  id         String  @id @default("")
  productId  String
  product    Product @relation(fields: [productId], references: [id])
  featureKey String  // "plant_layout", "cable_routing", etc.
  label      String  // "Plant Layout (MMS, Inverter, LA)", etc.

  @@unique([productId, featureKey])
  @@map("product_features")
}
```

### New model: `CheckoutSession`

```prisma
model CheckoutSession {
  id                       String    @id @default("")
  userId                   String
  user                     User      @relation(fields: [userId], references: [id])
  product                  String    // product slug at time of checkout
  stripeCheckoutSessionId  String    @unique
  stripeCheckoutSessionUrl String
  status                   String?
  processedAt              DateTime? // idempotency guard
  createdAt                DateTime  @default(now())

  @@map("checkout_sessions")
}
```

`processedAt` is the idempotency guard. Set atomically inside the transaction that provisions the entitlement. If non-null, any duplicate webhook or verify call is a no-op.

### Modified model: `User`

Add `stripeCustomerId` and relations:

```prisma
model User {
  id                String            @id @default("")
  clerkId           String            @unique
  email             String            @unique
  name              String?
  stripeCustomerId  String?           @unique
  createdAt         DateTime          @default(now())
  licenseKeys       LicenseKey[]
  entitlements      Entitlement[]
  checkoutSessions  CheckoutSession[]

  @@map("users")
}
```

### Modified model: `Entitlement`

Change `product` string field to `productId` FK:

```prisma
model Entitlement {
  id                String   @id @default("")
  userId            String
  user              User     @relation(fields: [userId], references: [id])
  productId         String
  product           Product  @relation(fields: [productId], references: [id])
  totalCalculations Int
  usedCalculations  Int      @default(0)
  purchasedAt       DateTime @default(now())

  @@map("entitlements")
}
```

### Unchanged: `LicenseKey`

One per user. Generated on first purchase. Format: `sl_live_<random>`.

---

## Purchase Flow

### Entry Points

1. **Pricing page** (`/pricing`) — "Buy Now" buttons link to `/dashboard/plan?product=<slug>`. Clerk handles auth redirect if user isn't signed in.
2. **Dashboard Plan page** (`/dashboard/plan`) — user clicks "Purchase" on a product card.
3. **Desktop Python app** — shows message with URL `solarlayout.in/dashboard/plan` when calculations run out.

**Universal purchase URL:** `/dashboard/plan?product=<slug>` — every surface that wants to trigger a purchase points here.

### Flow

1. User arrives at `/dashboard/plan` (authenticated via Clerk)
2. Plan page shows available products (from `GET /products`) and current entitlement balances (from `GET /billing/entitlements`)
3. User clicks "Purchase" on a product (or `?product=` param auto-selects it)
4. Frontend calls `POST /billing/checkout` with `{ product: "pv-layout-pro" }` + Clerk JWT
5. API:
   - Looks up `Product` by slug
   - Upserts `User` by Clerk ID (creates Stripe customer if `stripeCustomerId` is null)
   - Creates Stripe Checkout Session (`mode: 'payment'`, metadata: `{ userId, product }`)
   - Stores `CheckoutSession` row in DB
   - Returns `{ url }`
6. Frontend redirects to Stripe Checkout
7. User pays (Stripe handles 3DS/OTP for Indian cards)
8. Stripe redirects to `/dashboard/plan?session_id=cs_xxx`
9. Plan page calls `POST /billing/verify-session` with `{ sessionId: "cs_xxx" }`
10. Meanwhile, Stripe fires `checkout.session.completed` webhook to `POST /webhooks/stripe`
11. Whichever runs first (verify or webhook) provisions the entitlement:
    - In a single transaction:
      - Create `Entitlement` (userId, productId, totalCalculations from product)
      - Generate `LicenseKey` if user doesn't have one (`sl_live_<random>`)
      - Set `processedAt` on `CheckoutSession`
    - Second call (verify or webhook) sees `processedAt` set → no-op
12. Plan page shows success toast, displays updated entitlements

---

## API Routes

### New routes in `apps/mvp_api`

| Route | Auth | Purpose |
|---|---|---|
| `GET /products` | None | List active products with features |
| `POST /billing/checkout` | Clerk JWT | Create Stripe Checkout Session |
| `POST /billing/verify-session` | Clerk JWT | Verify + provision completed session |
| `GET /billing/entitlements` | Clerk JWT | Get user's entitlements + license key |
| `POST /webhooks/stripe` | Stripe signature | Handle `checkout.session.completed` |

### `GET /products`

Public, no auth. Returns all active products ordered by `displayOrder`, with features array. Consumed by the Python desktop app and the Plan page.

Response:
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "slug": "pv-layout-basic",
        "name": "PV Layout Basic",
        "priceAmount": 199,
        "priceCurrency": "usd",
        "calculations": 5,
        "features": [
          { "featureKey": "plant_layout", "label": "Plant Layout (MMS, Inverter, LA)" },
          { "featureKey": "obstruction_exclusion", "label": "Obstruction Exclusion" }
        ]
      }
    ]
  }
}
```

### `POST /billing/checkout`

Clerk JWT required. Body: `{ product: "pv-layout-pro" }`.

1. Validate product slug exists and is active
2. Get Clerk user ID from JWT, upsert `User` by Clerk ID
3. If `user.stripeCustomerId` is null, create Stripe customer and store ID
4. Create Stripe Checkout Session:
   - `mode: 'payment'`
   - `customer: user.stripeCustomerId`
   - `line_items: [{ price: product.stripePriceId, quantity: 1 }]`
   - `metadata: { userId: user.id, product: product.slug }`
   - `success_url: ${baseUrl}/dashboard/plan?session_id={CHECKOUT_SESSION_ID}`
   - `cancel_url: ${baseUrl}/dashboard/plan`
5. Store `CheckoutSession` row
6. Return `{ url: session.url }`

### `POST /billing/verify-session`

Clerk JWT required. Body: `{ sessionId: "cs_xxx" }`.

1. Look up `CheckoutSession` by `stripeCheckoutSessionId`
2. If `processedAt` is set → return `{ verified: true, updated: false }`
3. Retrieve session from Stripe API
4. If status !== `'complete'` → update DB status, return `{ verified: false }`
5. Run provisioning transaction (see below)
6. Return `{ verified: true, updated: true }`

### `GET /billing/entitlements`

Clerk JWT required.

1. Get Clerk user ID from JWT, find `User`
2. Return entitlements (with product details) and license key

Response:
```json
{
  "success": true,
  "data": {
    "entitlements": [
      {
        "product": "pv-layout-pro",
        "productName": "PV Layout Pro",
        "totalCalculations": 10,
        "usedCalculations": 3,
        "remainingCalculations": 7,
        "purchasedAt": "2026-04-22T..."
      }
    ],
    "licenseKey": "sl_live_abc123..."
  }
}
```

### `POST /webhooks/stripe`

Unauthenticated. Verified by Stripe webhook signature.

1. Verify signature with `stripe.webhooks.constructEvent(rawBody, sig, secret)`
2. If event type !== `checkout.session.completed` → return 200 (ignore)
3. Extract `userId` and `product` from session metadata
4. Look up `CheckoutSession` by Stripe session ID
5. If `processedAt` is set → return 200 (already processed)
6. Run provisioning transaction
7. Return 200

### Provisioning Transaction (shared logic)

Used by both verify-session and webhook handler:

1. Look up `Product` by slug
2. In a single Prisma transaction:
   - Create `Entitlement` (userId, productId, totalCalculations = product.calculations)
   - If user has no `LicenseKey`: create one with key = `sl_live_<random>`
   - Set `processedAt = now()` on `CheckoutSession`

---

## Frontend Changes (`apps/mvp_web`)

### Plan page (`/dashboard/plan`) — replaces placeholder

- Fetches `GET /products` to display available product cards
- Fetches `GET /billing/entitlements` (Clerk JWT) to show current balances
- If `?product=<slug>` query param: auto-selects that product for purchase (still requires user click to confirm)
- If `?session_id=<id>` query param: calls verify-session on mount, shows success toast, removes param from URL
- Shows product cards (name, price, calculations, features list, "Purchase" button)
- Shows current entitlements below (product, remaining calculations)
- Shows license key with copy-to-clipboard

### License page (`/dashboard/license`) — replaces placeholder

- Fetches `GET /billing/entitlements` to get license key
- Displays key with copy-to-clipboard button
- If no key yet: shows "Purchase a plan to get your license key"

### Pricing page (`/pricing`) — enable Buy Now buttons

- Change disabled `<Button>` to `<Link href="/dashboard/plan?product=<slug>">`
- Remove `disabled`, `cursor-not-allowed`, `opacity-60` classes

### Dashboard home page — show entitlement balances

- Fetch `GET /billing/entitlements` on dashboard home
- Show remaining calculations on each download card
- Show "Buy more" link to Plan page when balance is zero

---

## New Dependencies

| Package | Where | Purpose |
|---|---|---|
| `stripe` | `apps/mvp_api` | Stripe Node SDK |

No Stripe packages on the frontend — Stripe Checkout is a redirect, not an embed.

## Environment Variables

| Var | Where | Purpose |
|---|---|---|
| `STRIPE_SECRET_KEY` | `apps/mvp_api` | Stripe API key (test/live per env) |
| `STRIPE_WEBHOOK_SECRET` | `apps/mvp_api` | Webhook signing secret |

## Seed Script

`packages/mvp_db/prisma/seed-products.ts` — upserts the 3 products + features. Takes `stripePriceId` values from env vars so it works across environments. Run manually after creating Stripe products in the Stripe dashboard.

---

## Testing

### `apps/mvp_api` (Bun test)

| File | What it tests |
|---|---|
| `modules/products/products.routes.test.ts` | GET /products returns active products with features |
| `modules/billing/checkout.routes.test.ts` | POST /billing/checkout validates product, creates session; POST /billing/verify-session provisions entitlement idempotently |
| `modules/billing/entitlements.routes.test.ts` | GET /billing/entitlements returns balances + license key |
| `modules/webhooks/stripe.webhook.test.ts` | Webhook verifies signature, provisions entitlement, handles duplicates |

Stripe SDK mocked in all tests. No real Stripe calls.

### `apps/mvp_web` (Vitest)

| File | What it tests |
|---|---|
| `app/(main)/dashboard/plan/page.test.tsx` | Renders product cards, handles purchase flow, shows entitlements |
| `app/(main)/dashboard/license/page.test.tsx` | Renders license key with copy button |
| `app/(marketing)/pricing/page.test.tsx` | Buy Now buttons link to /dashboard/plan?product=<slug> |
| `app/(main)/dashboard/page.test.tsx` | Shows remaining calculations on download cards |

---

## What's NOT in Spike 5

- Usage reporting from Python app (`POST /usage/report`) — Spike 6
- API key auth middleware (license key authentication for Python app calls) — Spike 6
- Embedded Stripe Payment Element (future enhancement)
- Subscription/recurring billing (future spike if demand warrants)
- Refunds

---

## Definition of Done

1. `bun run lint && bun run typecheck && bun run test && bun run build` pass from repo root
2. Human verifies locally:
   - Products seeded in local DB
   - Buy Now on pricing page links to `/dashboard/plan?product=<slug>`
   - Purchase flow: Plan page → Stripe Checkout → redirect back → entitlement provisioned
   - Plan page shows entitlement balances after purchase
   - License page shows license key with copy button
   - Download cards show remaining calculations
   - Second purchase for same product stacks (additive entitlements)
3. CI/CD passes
4. Production: Stripe live mode products created, purchase works end-to-end at `solarlayout.in`
5. Human sign-off
