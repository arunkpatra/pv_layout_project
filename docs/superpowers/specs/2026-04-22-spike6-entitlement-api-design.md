# Spike 6: Entitlement API + License Key Auth — Design Spec

**Date:** 2026-04-22  
**Spike:** 6  
**Status:** Approved  
**Author:** Claude (brainstormed with Arun)

---

## Context

Spike 5 provisioned `LicenseKey` and `Entitlement` records on Stripe payment completion. Spike 6 exposes those records to Prasanta's Python desktop apps via a license-key-authenticated API. The Python apps check entitlements at startup, gate features in the UI, and report usage after each completed calculation.

Spike 7 will use this API to build the reference implementation on `PVlayout_Advance` and produce a PRD + Claude Code prompt for Prasanta to integrate into his final apps.

---

## Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | One license key per user, covers all products | Key authenticates the user; entitlements determine feature access. Solar professionals understand "license key" — one key to paste, works as they buy more packs. |
| D2 | Feature-based usage reporting (`feature` key, not product slug) | Python app has no awareness of product tiers. Feature keys are the stable contract. API picks the right entitlement pool. |
| D3 | Cheapest-first pool selection | When a user has multiple entitlement pools covering the same feature, deduct from the lowest-tier (by `displayOrder`) with remaining calculations. Natural depletion order. |
| D4 | `userId` denormalized onto `UsageRecord` | Common access pattern (`WHERE userId = ?`) for future admin UI. Avoids join through `license_keys` on high-volume queries. |
| D5 | Each completed feature action = one billable event | Simple, auditable. Python app decides what constitutes a "completed action" and calls `POST /usage/report` once per event. |
| D6 | `licensed: false` when zero remaining calculations | Python app needs a clear signal to disable all feature buttons and show a purchase alert. |
| D7 | Separate `licenseKeyAuth` middleware | Mirrors existing `clerkAuth` pattern. Clean separation from Clerk-authenticated routes. Easy to test independently. |

---

## Architecture

### New files

```
apps/mvp_api/src/
├── middleware/
│   └── license-key-auth.ts          ← new
├── modules/
│   ├── entitlements/
│   │   ├── entitlements.routes.ts   ← new
│   │   ├── entitlements.service.ts  ← new
│   │   └── entitlements.test.ts     ← new
│   └── usage/
│       ├── usage.routes.ts          ← new
│       ├── usage.service.ts         ← new
│       └── usage.test.ts            ← new

packages/mvp_db/prisma/
└── schema.prisma                    ← add UsageRecord model + migration
```

### `licenseKeyAuth` middleware

Mirrors `clerkAuth` exactly, but validates a license key instead of a Clerk JWT:

1. Read `Authorization: Bearer sl_live_...` header
2. Look up `LicenseKey` where `key = token AND revokedAt IS NULL`
3. Not found or revoked → 401
4. Load associated `User`
5. Set `user` and `licenseKey` on Hono context

Hono context additions (extend `MvpHonoEnv`):
- `user` — same `User` type as `clerkAuth` sets
- `licenseKey` — `LicenseKey` record (needed for `UsageRecord.licenseKeyId`)

### Route mounting in `app.ts`

```ts
app.route("/", entitlementsRoutes)  // GET /entitlements, GET /usage/history
app.route("/", usageRoutes)         // POST /usage/report
```

---

## Database

### New model: `UsageRecord`

```prisma
model UsageRecord {
  id           String     @id @default("")
  userId       String
  user         User       @relation(fields: [userId], references: [id])
  licenseKeyId String
  licenseKey   LicenseKey @relation(fields: [licenseKeyId], references: [id])
  productId    String
  product      Product    @relation(fields: [productId], references: [id])
  featureKey   String
  metadata     Json?
  createdAt    DateTime   @default(now())

  @@map("usage_records")
}
```

Add back-relations to `User`, `LicenseKey`, and `Product` models.

### Migration

`bun run db:migrate` from repo root after schema update.

---

## API Contract

### `GET /entitlements`

**Auth:** `Authorization: Bearer sl_live_...`

**Response (has entitlements with remaining calculations):**
```json
{
  "success": true,
  "data": {
    "licensed": true,
    "availableFeatures": ["plant_layout", "obstruction_exclusion", "cable_routing", "cable_measurements"],
    "remainingCalculations": 12,
    "totalCalculations": 15,
    "usedCalculations": 3
  }
}
```

**Response (exhausted or no entitlements):**
```json
{
  "success": true,
  "data": {
    "licensed": false,
    "availableFeatures": [],
    "remainingCalculations": 0,
    "totalCalculations": 0,
    "usedCalculations": 0
  }
}
```

**Feature resolution logic:**
- `availableFeatures` = union of `ProductFeature.featureKey` values across all products where the user's entitlement has `remaining > 0`
- `totalCalculations` = sum of `totalCalculations` across all entitlements
- `usedCalculations` = sum of `usedCalculations` across all entitlements
- `remainingCalculations` = `totalCalculations - usedCalculations`

---

### `POST /usage/report`

**Auth:** `Authorization: Bearer sl_live_...`

**Request body:**
```json
{ "feature": "cable_routing" }
```

**Pool selection (cheapest-first):**
1. Load all entitlements for user where `remaining > 0`
2. Filter to those whose product includes `feature`
3. Sort by `product.displayOrder` ascending (cheapest first)
4. Select the first — this is the pool to decrement
5. If none found → 402

**Atomic decrement (Prisma transaction):**
```
BEGIN
  SELECT entitlement WHERE id = ? FOR UPDATE
  IF usedCalculations >= totalCalculations → ROLLBACK → 409
  UPDATE entitlement SET usedCalculations = usedCalculations + 1
  INSERT UsageRecord (userId, licenseKeyId, productId, featureKey, metadata)
COMMIT
```

**Response (success):**
```json
{
  "success": true,
  "data": {
    "recorded": true,
    "remainingCalculations": 11
  }
}
```

`remainingCalculations` = total remaining across **all** entitlements (same computation as `GET /entitlements`), not just the pool that was decremented. Gives the Python app an up-to-date balance in one call.

---

### `GET /usage/history`

**Auth:** `Authorization: Bearer sl_live_...`

**Response:**
```json
{
  "success": true,
  "data": {
    "records": [
      {
        "featureKey": "cable_routing",
        "productName": "PV Layout Pro",
        "createdAt": "2026-04-22T10:00:00.000Z"
      }
    ]
  }
}
```

- Ordered by `createdAt` descending
- Capped at 100 records for MVP

---

## Error Handling

| Scenario | HTTP | Error code |
|---|---|---|
| Missing or malformed Bearer token | 401 | `UNAUTHORIZED` |
| Key not found or revoked | 401 | `UNAUTHORIZED` |
| `feature` not in user's available features | 400 | `VALIDATION_ERROR` |
| Unknown `feature` value | 400 | `VALIDATION_ERROR` |
| Zero remaining calculations | 402 | `PAYMENT_REQUIRED` |
| Concurrent decrement — lost race | 409 | `CONFLICT` — Python app should retry once |

---

## Testing

Co-located `*.test.ts` files, bun:test, mock DB pattern (same as `clerk-auth.test.ts`).

### `license-key-auth.test.ts`
- Valid active key → sets `user` and `licenseKey` on context, calls `next()`
- Revoked key (`revokedAt` set) → 401
- Key not found → 401
- Missing `Authorization` header → 401
- Malformed header (no `Bearer` prefix) → 401

### `entitlements.test.ts`
- User with one product, remaining > 0 → `licensed: true`, correct feature list
- User with two products, feature union computed correctly
- User with one product exhausted → `licensed: false`, `availableFeatures: []`
- User with no entitlements → `licensed: false`
- `totalCalculations` / `usedCalculations` summed across all entitlements

### `usage.test.ts`
- Valid feature, remaining > 0 → 200, `UsageRecord` created, `usedCalculations` incremented
- Valid feature, zero remaining → 402
- Feature not in user's available features → 400
- Unknown feature key → 400
- Cheapest-first pool selection: user has Basic + Pro entitlements, `plant_layout` call → Basic pool decremented
- Concurrent calls handled by transaction (simulate with sequential calls against same entitlement)

---

## Spike Plan Updates

### Add to overview table

| # | Spike | Scope | Status |
|---|---|---|---|
| 11 | Admin UI | Usage records, user list, entitlement overview, license key revocation | planned |

### Add Spike 11 section (placeholder)

Full scope to be defined during Spike 11 brainstorming session.

---

## Definition of Done

1. `bun run lint && bun run typecheck && bun run test && bun run build` passes
2. Human verifies locally: valid license key returns entitlements; usage report decrements count; revoked key returns 401; exhausted key returns 402
3. CI/CD passes
4. Production verified against `api.solarlayout.in`
5. Human sign-off
