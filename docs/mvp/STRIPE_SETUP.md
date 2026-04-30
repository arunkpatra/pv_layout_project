# Stripe Setup Guide — SolarLayout MVP

This guide covers setting up Stripe for local development, testing, and production.

---

## 1. Create Stripe Products and Prices

In the [Stripe Dashboard](https://dashboard.stripe.com/test/products), create three products in **test mode**:

| Product Name | Price | Type | Notes |
|---|---|---|---|
| PV Layout Basic | $1.99 USD | One-time | 5 layout calculations |
| PV Layout Pro | $4.99 USD | One-time | 10 layout calculations |
| PV Layout Pro Plus | $14.99 USD | One-time | 50 layout + yield calculations |

After creating each product, copy its **Price ID** (starts with `price_`). You'll need all three.

---

## 2. Get Your API Keys

From [Stripe Dashboard > Developers > API Keys](https://dashboard.stripe.com/test/apikeys):

- **Secret key** (starts with `sk_test_`) — used by `apps/mvp_api`
- **Publishable key** (starts with `pk_test_`) — not needed for this integration (we use Stripe Checkout redirect, not embedded elements)

---

## 3. Local Environment Setup

### 3.1 Set environment variables

Add to your **root `.env`** file:

```bash
# Stripe — test mode
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

### 3.2 Seed products into local database

Make sure the local MVP database is running (`docker compose up -d`), then:

```bash
cd /path/to/repo

# Set your Stripe price IDs and run the seed
STRIPE_PRICE_BASIC=price_xxx \
STRIPE_PRICE_PRO=price_yyy \
STRIPE_PRICE_PRO_PLUS=price_zzz \
  bun run packages/mvp_db/prisma/seed-products.ts
```

Verify the seed worked:

```bash
cd packages/mvp_db && bun -e "
import { prisma } from './src/index.js';
const products = await prisma.product.findMany({ orderBy: { displayOrder: 'asc' } });
for (const p of products) console.log(p.slug, p.stripePriceId);
await prisma.\$disconnect();
"
```

You should see your three products with real Stripe price IDs.

### 3.3 Re-seeding

The seed script uses `upsert` — it's safe to re-run. If you need to update price IDs, just run it again with the new values.

---

## 4. Local Webhook Testing with Stripe CLI

Stripe sends webhook events (e.g. `checkout.session.completed`) to your API after a payment succeeds. For local development, you need to forward these events to your local server.

### 4.1 Install the Stripe CLI

```bash
# macOS
brew install stripe/stripe-cli/stripe

# Or download from https://stripe.com/docs/stripe-cli
```

### 4.2 Login to Stripe

```bash
stripe login
```

This opens a browser to authenticate. You only need to do this once.

### 4.3 Forward webhooks to local API

```bash
stripe listen --forward-to http://localhost:3003/webhooks/stripe
```

This will output a **webhook signing secret** (starts with `whsec_`):

```
> Ready! Your webhook signing secret is whsec_abc123... (^C to quit)
```

Copy this value and set it as `STRIPE_WEBHOOK_SECRET` in your root `.env`.

**Important:** This secret changes every time you restart `stripe listen`. Update your `.env` accordingly, and restart `apps/mvp_api` to pick up the new value.

### 4.4 Keep it running

Leave `stripe listen` running in a separate terminal while testing purchases. You'll see webhook events logged in real-time:

```
2026-04-22 12:00:00  --> checkout.session.completed [evt_xxx]
2026-04-22 12:00:00  <-- [200] POST http://localhost:3003/webhooks/stripe
```

---

## 5. Testing the Purchase Flow Locally

1. Start all services:
   ```bash
   bun run dev          # starts mvp_web (3002) + mvp_api (3003)
   stripe listen --forward-to http://localhost:3003/webhooks/stripe  # separate terminal
   ```

2. Open `http://localhost:3002/dashboard/plan`

3. Click "Purchase" on any product

4. You'll be redirected to Stripe Checkout (test mode). Use test card:
   - **Card number:** `4242 4242 4242 4242`
   - **Expiry:** any future date
   - **CVC:** any 3 digits
   - **For Indian 3DS testing:** `4000 0027 6000 3184` (triggers 3D Secure authentication)

5. After payment, you'll be redirected back to `/dashboard/plan?session_id=cs_xxx`

6. The verify-session endpoint and/or webhook will provision the entitlement

7. You should see your entitlement balance and license key on the Plan page

---

## 6. Production Setup

### 6.1 Create live Stripe products

Switch to **live mode** in the Stripe Dashboard and create the same three products with live prices.

### 6.2 Set Vercel environment variables

In the Vercel project for `apps/mvp_api`:

| Variable | Value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_...` (live secret key) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` (from webhook endpoint setup) |

### 6.3 Create a Stripe webhook endpoint

In [Stripe Dashboard > Developers > Webhooks](https://dashboard.stripe.com/webhooks):

1. Click "Add endpoint"
2. **Endpoint URL:** `https://api.solarlayout.in/webhooks/stripe`
3. **Events to send:** Select `checkout.session.completed`
4. Click "Add endpoint"
5. Copy the **Signing secret** and set it as `STRIPE_WEBHOOK_SECRET` in Vercel

### 6.4 Seed production database

Run the seed script with live price IDs:

```bash
STRIPE_PRICE_BASIC=price_live_xxx \
STRIPE_PRICE_PRO=price_live_yyy \
STRIPE_PRICE_PRO_PLUS=price_live_zzz \
MVP_DATABASE_URL="your_production_db_url" \
  bun run packages/mvp_db/prisma/seed-products.ts
```

---

## 7. Stripe Test Cards Reference

| Card | Scenario |
|---|---|
| `4242 4242 4242 4242` | Succeeds immediately |
| `4000 0027 6000 3184` | Requires 3D Secure (Indian card simulation) |
| `4000 0000 0000 9995` | Always declines |
| `4000 0000 0000 3220` | 3D Secure 2 — required |

Full list: [Stripe Testing Docs](https://docs.stripe.com/testing)

---

## 8. Troubleshooting

### Webhook not received
- Is `stripe listen` running?
- Is the `STRIPE_WEBHOOK_SECRET` in `.env` matching the one shown by `stripe listen`?
- Did you restart `apps/mvp_api` after changing the secret?

### "STRIPE_SECRET_KEY is not configured"
- Check your root `.env` has `STRIPE_SECRET_KEY` set
- Restart `bun run dev`

### Products show placeholder price IDs
- Re-run the seed script with real Stripe price IDs (see section 3.2)

### Entitlement not provisioned after payment
- Check `stripe listen` output — did the webhook return 200?
- Check `apps/mvp_api` console for provisioning errors
- The verify-session endpoint (called on redirect) is a safety net — if the webhook failed, the redirect should still provision
