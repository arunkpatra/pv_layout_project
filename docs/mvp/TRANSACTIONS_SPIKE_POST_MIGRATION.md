# Post-Migration Ritual — Unified Transactions Spike

One-time runbook for the database wipe that ships with the unified `Transaction` ledger spike.

The migration TRUNCATEs `users`, `entitlements`, `license_keys`, `checkout_sessions`, `usage_records`, and `transactions` (new). Products and product features are preserved. Clerk metadata (including admin/ops roles) is preserved (it lives in Clerk, not our DB).

After the migration runs in any environment, each operator follows the ritual below to restore their working state.

## When this applies

- Local dev DB after pulling and running `bun run mvp-db:migrate`.
- Production after the `platform-deployment` workflow runs the migration step.
- Any Vercel preview environment that points at a wiped database.

Run the ritual once per environment per operator. Skipping it leaves the operator in a half-broken state (logged in to Clerk, no User row in the DB, no entitlement, no license key).

## Steps

### 1. mvp_web — sign in

Open the user dashboard (`https://renewable-energy-web.vercel.app/dashboard` in production, `http://localhost:3000/dashboard` locally) and sign in via Clerk if not already signed in.

The first authenticated API call to `mvp_api` triggers the existing first-auth path: a fresh `User` row, a `Transaction(source=FREE_AUTO, amount=0)`, a free `Entitlement` (5 calculations, all features for the Free tier), and a new `LicenseKey` are all created in a single DB transaction.

Verify on the dashboard:
- The license key card displays a new `sl_live_...` value.
- Remaining Calculations = 5.
- Plan = Free.

### 2. mvp_admin — sign in

Open the admin app (`https://renewable-energy-admin.vercel.app` in production, `http://localhost:3004` locally) and sign in. The Clerk session reused from step 1 is recognized; the admin nav (Dashboard, Customers, Plans, Transactions, Users, System) loads if the Clerk user has `roles: ["ADMIN"]` or `roles: ["OPS"]` in Clerk metadata.

Verify:
- `/dashboard` summary shows Total Customers ≥ 1, Total Revenue = $0, one or two FREE_AUTO transactions in the trends.
- `/customers` lists you (and any co-founders who have completed step 1).
- `/transactions` lists the FREE_AUTO rows.

### 3. Desktop app — re-enter license key

The desktop app's stored license key (in OS Keychain / Credential Manager / Secret Service) is now orphaned. On next launch:

1. App calls `GET /entitlements` with the old key.
2. API returns 401 (key not found).
3. App deletes the stored key and prompts for a new one.
4. Copy the license key from `mvp_web` `/dashboard` (step 1) and paste it into the prompt.
5. App re-fetches entitlements; UI unlocks.

If the app does not show a key prompt automatically, restart it.

## Verification checklist

After all three steps, the following should be true for each operator:

- [ ] mvp_web `/dashboard` shows a license key and Free plan stats.
- [ ] mvp_admin nav loads with the operator's role-appropriate items.
- [ ] mvp_admin `/transactions` shows at least one FREE_AUTO row per signed-in operator.
- [ ] Desktop app loads entitlements without errors.
- [ ] A test calculation in the desktop app decrements `Remaining Calculations` on the web dashboard by 1.

## What if something goes wrong

| Symptom | Likely cause | Fix |
|---|---|---|
| mvp_web dashboard shows a network error or 500 | mvp_api isn't running, or migration didn't apply cleanly | Confirm `mvp-db:migrate status` shows the new migration as applied; restart mvp_api |
| Admin nav missing Transactions / Users / System | Clerk metadata doesn't have ADMIN/OPS roles | Set the role in the Clerk dashboard for that user; sign out and back in |
| Desktop app stays stuck on 401 with old key | Keychain entry was not cleared | Manually delete the `solarlayout` keychain entry, restart the app |
| Stripe checkout from `/dashboard/plans` fails | Old Stripe customer ID in browser cache or test data | Browser hard reload; new Stripe customer is created on first new checkout |

## What this ritual does NOT cover

- Restoring any data that existed before the wipe. The migration is one-way; that data is gone.
- Re-creating purchase history. Stripe-side test purchases that existed before the wipe stay in Stripe but are not reflected in our DB. New purchases (Stripe or manual) populate the new `transactions` table from this point forward.
