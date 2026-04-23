# ADR 0001: Online-required entitlement policy

Date: 2026-04-24
Spike: S7
Status: accepted

## Context

On launch, the desktop app authenticates the user's license key against `api.solarlayout.in/entitlements` and uses the response to gate features and display plan information. The question is what to do when the call fails — network down, API unavailable, user travelling offline.

Two broad options exist:

1. **Offline grace window** — persist entitlements to disk after a successful online fetch; on subsequent launches, if the API is unreachable, fall back to the cached entitlements for up to N days. Common v1 SaaS pattern (7 / 14 / 30 days are typical).
2. **Online required** — no disk cache; no grace period; a failed entitlements call is a blocking error the user resolves by reconnecting.

The earlier SPIKE_PLAN.md draft assumed option 1 (with "7 / 14 / 30 days" listed as an open question for S7). During S7 planning the assumption was revisited.

## Options considered

**Option 1 — Offline grace window (N-day cache)**
- Pro: tolerates flaky networks and short-haul offline use; user can still work during an ISP outage.
- Pro: industry-standard v1 SaaS behaviour.
- Con: meaningful implementation cost — persisted cache schema, cache invalidation on key change, stale-cache reconciliation on reconnect, grace-expiry UX, timezone edge cases.
- Con: opens a class of drift / support bugs (entitlements change server-side but desktop keeps old state for N days).
- Con: value is moderate — the desktop app is a *network-aware* tool (consumes `api.solarlayout.in` for entitlements and telemetry, uses online basemap tiles for the canvas in S8). A user with no internet has a degraded experience regardless.

**Option 2 — Online required**
- Pro: zero persisted entitlement state; no cache invalidation code; no grace-expiry UX.
- Pro: entitlement changes (purchase, refund, plan change) take effect on the next launch, not up to N days later.
- Pro: simpler mental model — the app is online or it isn't.
- Con: users on a plane or in an outage can't launch the app. Real but narrow — the target user is an engineer designing PV plants at a desk with connectivity.
- Con: reconnect story must be clean — a good error surface with a "retry" affordance, not a silent failure.

**Option 3 — Hybrid** (cache for intra-session robustness, online required on cold boot)
- Effectively what TanStack Query gives us by default (in-memory cache with the stale time we set). Not a persistent offline cache. Folds into Option 2 as the intended behaviour.

## Decision

**Option 2.** Online required on every launch. No persisted entitlements cache. No grace window.

Scope of the decision:
- On boot, the desktop calls `GET /entitlements` with the stored license key.
- Success → entitlements held in TanStack Query for the session; no persistence.
- Failure (network error, 5xx, timeout) → blocking error surface with "Retry" action; app does not open the main shell.
- 401 (invalid / revoked key) → clear the keyring entry, show the license-entry dialog.
- Intra-session caching (TanStack Query with a session-long stale time) is fine — that's not an offline cache, just RPC deduplication.

## Consequences

**Accepted:**
- Users must have network connectivity to launch the app. Documented on the download page.
- A connectivity outage on the user's side looks, operationally, like the app being "broken" — so the error surface must be crisp and the retry UX must feel responsive.
- If `api.solarlayout.in` is down, all desktop users are blocked. This puts the API on the critical path; uptime SLO must reflect it.

**Not implemented:**
- No persisted entitlements cache. No grace-period expiry timer. No "last successful verification at <timestamp>" UI. No stale-cache reconciliation logic.

**Revisitable:**
- If future telemetry shows a meaningful population of users hitting the online-required barrier repeatedly (e.g. frequent air travel, field deployments), a grace-window ADR can supersede this one. The S13.7 subscription redesign is a natural point to reconsider, since subscription lifecycle changes already touch the entitlements contract.

## Related

- SPIKE_PLAN.md → S7 Human Gate steps (no "turn off wifi" offline-works case).
- ARCHITECTURE.md §4 — Entitlements flow references this ADR.
- ARCHITECTURE.md §10 — Non-goals list includes "no offline grace window".
