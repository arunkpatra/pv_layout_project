# Session Kickoff Prompt — `renewable_energy` V2 Backend Work

**Purpose:** Paste this into a new Claude Code session opened in `/Users/arunkpatra/codebase/renewable_energy`. It gives Claude full context to start the V2 backend work correctly without back-and-forth.

**How to use:**
1. Open Claude Code in `/Users/arunkpatra/codebase/renewable_energy`
2. Paste everything below the `--- BEGIN PROMPT ---` line as the first user message
3. Let Claude do its session-start reading before answering

---

--- BEGIN PROMPT ---

# V2 Backend Initiative — Post-Parity for Tauri Desktop App

You are starting a multi-week initiative on this repo. This is the active backend work to support a brand-new Tauri desktop app for PVLayout (the existing legacy PyQt5 app's replacement). The desktop app's source of truth is a sibling repo at `/Users/arunkpatra/codebase/pv_layout_project`.

## ⛔ Critical caveats — read before doing anything else

1. **This repo is LIVE PRODUCTION.** It drives `api.solarlayout.in`, processes real Stripe payments, and is the entitlements source-of-truth for the legacy PVLayout install (Prasanta's machine). Mistakes have customer + billing impact. Verify assumptions; do not guess.
2. **Read the mandatory docs first** per `CLAUDE.md`:
   - `docs/architecture.md` (note: partially stale on app naming — live apps are `apps/mvp_*`, not `apps/api`/`apps/web`/`apps/layout-engine`)
   - `docs/claude-dev-principles.md` (TDD-first, spike-before-scale, 5-step DoD, self-review with `superpowers:code-reviewer` for significant work)
   - `docs/collaborative-testing-protocol.md` (one-question-at-a-time, environment URLs from `.env.production`, browser-console pattern with real Clerk JWT)
3. **Honor the pre-commit gate** every time:
   ```bash
   bun run lint && bun run typecheck && bun run test && bun run build
   ```
   For build-infra-touching commits, use the clean-environment gate (delete dist/.next first).
4. **Branch is already created.** You are on (or should checkout) `post-parity-v2-backend`. Do not touch `main` directly. PR to main when the initiative completes.
5. **Auto-memory.** Check this repo's `~/.claude/projects/.../memory/MEMORY.md` for any prior-session memory entries that apply. Read what's relevant before making decisions.

## Mission

Ship V2 of the SolarLayout backend to support the new Tauri desktop app:

- **Project + Run primitives** — persistent state for the desktop's project-centric model.
- **Per-tier project quotas** — Free=3, Basic=5, Pro=10, Pro Plus=15 (concurrent).
- **Idempotent usage reporting** — fix V1's network-retry-double-debits risk.
- **Blob storage extensions** — pre-signed PUT for KMZ + run results, on the existing AWS S3 infrastructure.
- **V1 freeze** — no new features in V1 routes; legacy install keeps working until desktop is end-to-end ready, at which point V1 retires.

The desktop app is being built in parallel in `/Users/arunkpatra/codebase/pv_layout_project`. Your work unblocks its V2 integration rows.

## Where the plan lives

Active plan: [`docs/initiatives/post-parity-v2-backend-plan.md`](./docs/initiatives/post-parity-v2-backend-plan.md). Already committed to `post-parity-v2-backend` (commit `849c85b`).

**The plan needs minor revision before B1 starts.** Audits surfaced ~6-7 specific corrections that didn't make it into the v1.0 of the plan. See "First task" below.

Superseded historical context (already marked):
- `docs/initiatives/pv-layout-cloud.md` — old "fully cloud-native web port" direction
- `docs/initiatives/pv-layout-spike-plan.md` — its companion spike plan

## Discovery audits (essential reading — they are the ground truth)

These three files were produced by sub-agents in the brainstorm session that scoped this initiative. They contain the production reality check on which the V2 plan is built. **Read all three before revising the plan or executing rows.**

1. `/Users/arunkpatra/codebase/pv_layout_project/docs/post-parity/discovery/2026-04-29-003-renewable-energy-infra-audit.md` — AWS account/buckets/IAM, deployment platform, environment variables, GitHub Actions, domains, S3 patterns. **Most important.**
2. `/Users/arunkpatra/codebase/pv_layout_project/docs/post-parity/discovery/2026-04-29-004-renewable-energy-codebase-audit.md` — full endpoint inventory (all 38), Prisma schema model-by-model, auth flows (Clerk + license-key), Stripe billing flow, admin/web app surfaces, package responsibilities.
3. `/Users/arunkpatra/codebase/pv_layout_project/docs/post-parity/discovery/2026-04-29-005-renewable-energy-planning-audit.md` — every existing planning artifact + status, conflicts with the V2 plan, recommendations for revision.

Two earlier discovery audits also exist for full context (lighter-weight, read if useful):
- `/Users/arunkpatra/codebase/pv_layout_project/docs/post-parity/discovery/2026-04-29-001-legacy-app-capability-audit.md` — what the legacy PyQt5 desktop app does (informs desktop-side work, less relevant here).
- `/Users/arunkpatra/codebase/pv_layout_project/docs/post-parity/discovery/2026-04-29-002-backend-api-contract-audit.md` — earlier V1 backend contract audit (now superseded by audit #4 above; read only if #4 leaves a gap).

## Locked decisions (do NOT relitigate — these came out of a 2026-04-29 brainstorm with Prasanta)

These are foundational; everything in the plan flows from them.

### Commercial model
- **Prepaid packs only at v1** (NOT subscriptions). All purchases are one-time Stripe Checkout `mode=payment`. Pricing already configured in production via `packages/mvp_db/prisma/seed-products.ts`:
  - Free: $0 / 5 lifetime calcs / all features
  - Basic: $1.99 / 5 calcs / `plant_layout`, `obstruction_exclusion`
  - Pro: $4.99 / 10 calcs / + `cable_routing`, `cable_measurements`
  - Pro Plus: $14.99 / 50 calcs / + `energy_yield`, `generation_estimates`
- **Per-tier project quotas (concurrent):** Free=3, Basic=5, Pro=10, Pro Plus=15. Effective quota = max across active+non-exhausted entitlements. Users can delete projects to free slots — this is intentional, not a bug.
- **Identity:** shared SolarLayout user account, but only PVLayout consumes it now. Future products (BankableCalc etc.) will be commercially standalone — same auth system, separate `productId`-namespaced entitlements.

### Architecture
- **Cloud-first.** No internet → no app. Project state in Postgres + S3.
- **API caller is the Tauri Rust shell.** Native HTTP client → no CORS issue. Existing `MVP_CORS_ORIGINS` allowlist (Vercel web origin only) does NOT need Tauri added.
- **Wallet model: cheapest-tier-first that supports the feature.** Already correct in `apps/mvp_api/src/modules/usage/usage.service.ts`. Don't change this — just add idempotency around it.
- **Run = persisted artifact.** Each "Generate Layout" click on desktop = 1 calc-debit + 1 Run row. Compare workflow = split-view of 2 runs in same project. Run delete does NOT refund the calc.
- **Auto-save** for project edits (debounced ~2s on desktop). `PATCH /v2/projects/:id` must support frequent small writes.

### Storage
- **AWS S3 — NOT Vercel Blob.** This was a v1.0-plan mistake; revision needed. Use the existing S3 setup in `ap-south-1` (account `378240665051`). Existing IAM user `renewable-energy-app` already has `s3:*` permissions on the existing buckets. New bucket(s) for V2 (likely a `renewable-energy-{env}-projects` family for KMZ + run results) just need to be added to that IAM policy.
- **Existing presigned-GET helper at `apps/mvp_api/src/lib/s3.ts`** is the template. V2 needs to add presigned-PUT on top of the same SDK setup.

### V1 retirement
- **V1 is frozen.** No new features in V1 routes. Mark with file-header comment.
- **Pause downloads** from `solarlayout.in` (mvp_web change) in lockstep with V2 launch. Legacy install keeps working against V1 endpoints.
- **Retirement criterion:** "new app + backend working end-to-end." Not 100% line-by-line parity on every legacy decision.

## Plan revisions needed before B1 starts (your first task)

The planning audit (`2026-04-29-005-renewable-energy-planning-audit.md`) catalogues these. Apply them as the first commit on this branch.

### Required edits to `docs/initiatives/post-parity-v2-backend-plan.md`

1. **Row B5: change provider from Vercel Blob to AWS S3.** The plan currently says "Vercel Blob recommended; alternative R2." Reality: S3 is already in production (`ap-south-1`, three artifacts buckets, three downloads buckets), the IAM user already exists, the SDK helper exists. Re-frame B5 as: "Add S3 buckets for V2 projects + run results; extend existing IAM policy; reuse `apps/mvp_api/src/lib/s3.ts` SDK pattern." Tier stays T3 (decision memo for bucket-naming + lifecycle + region choice).

2. **Row B19: extend `createEntitlementAndTransaction`, do not invent parallel path.** `Entitlement.transactionId` is NOT NULL post-2026-04-28. The webhook update in B19 must add `projectQuota` to the entitlement-creation flow that already exists in `apps/mvp_api/src/modules/billing/create-entitlement-and-transaction.ts`. Update the row text to make this explicit.

3. **Terminology fix throughout: "prepaid packs" not "PAYG".** The plan calls the model "PAYG-only at v1." Audit recommends "prepaid packs" — same idea, but matches how the existing repo describes the products (`Product` table, one-time purchases, no metering). Replace globally in the plan.

4. **Add explicit note: V1 `EntitlementSummary` response shape is consumed by desktop legacy install + mvp_web + mvp_admin — frozen.** New fields go on V2 routes only, never on V1.

5. **Add explicit note: license-key auth scheme `sl_live_<random>` format is locked since mvp-spike6.** V2 routes reuse the existing `licenseKeyAuth` middleware in `apps/mvp_api/src/modules/auth/` — do not introduce a new bearer scheme.

6. **Add explicit note: register new ID prefixes with the semantic-ID Prisma extension** when adding `Project` (suggest `prj_`) and `Run` (suggest `run_`) models. Look at how existing models (`User`, `Entitlement`, etc.) register their prefixes and follow the same pattern.

7. **Add explicit note: layout-engine app at `apps/layout-engine` is dormant** (Lambda+ECR+SQS, fully wired but unused). Don't mistake it for a V2 dependency. The desktop's compute happens in its bundled Python sidecar, not in Lambda.

8. **Add explicit note: rate-limiting on `POST /v2/usage/report` is deferred** (no abuse vector at current volume). Idempotency is the v1 protection.

9. **Move `Open questions for product` to "Resolved":** project quota numbers (3/5/10/15) are locked; concurrent-not-lifetime is locked; over-quota read-only is locked. Remove the section or fold into the Decisions log.

10. **Add to Decisions log (section 9):** all of the above as 2026-04-29 entries with one-line rationale each.

### After plan revision

Single commit on `post-parity-v2-backend`:
```
docs(initiatives): revise V2 backend plan per discovery audits

- B5: S3 not Vercel Blob (existing infra)
- B19: extend createEntitlementAndTransaction, not parallel path
- Terminology: "prepaid packs" not "PAYG"
- Notes: V1 response shape frozen; license-key format locked;
  semantic-ID prefix registration; layout-engine dormant;
  rate-limiting deferred
- Resolved: project quota numbers + concurrent + over-quota
```

Pre-commit gate runs (docs-only, but run anyway for the discipline). After commit, surface the revised plan to the user and **stop** — wait for explicit "approved, start B1" before any code rows.

## Subsequent execution flow

Per the plan's row protocol:

1. Pick top `todo` row whose `Depends` are done.
2. Read row's `Files / Notes` end-to-end. Read adjacent module files for context.
3. **TDD: write the failing test first.** Verify it fails for the right reason.
4. Minimum code to make it pass.
5. Apply tier ceremony (T2 → integration test; T3 → decision memo at `docs/initiatives/findings/`).
6. **Pre-commit gate** from repo root.
7. **Self-review with `superpowers:code-reviewer`** if row is significant (5+ files, new infra, new pattern).
8. Atomic commit: `feat(<scope>): <feature>`. Squash any `wip:` checkpoints.
9. Flip `Status` to `done` in the plan file (same commit).
10. **Spike rows: full 5-step DoD** (gates → human local → CI → prod → human sign-off) before declaring done.

## How to communicate with the user (Arun)

Read the user-style entries in this repo's auto-memory (`MEMORY.md` and the entries it links). Key patterns:

- **Recommend, don't ask.** When there are 2-3 options, pick one and explain why. The user will override if they disagree. Do not present 5-option questionnaires.
- **Scope-tight.** Don't expand a row's scope mid-execution unless the gap is small + bounded + textbook (per the user's `feedback_scope_expansion.md` memory if it exists). Otherwise flag and ask.
- **No narration.** Don't explain what you're about to do unless it's a meaningful decision. Just do it.
- **Handoff format at row close:** `What to run / Summary / Heads-up`. Commands grounded in the row's Acceptance.
- **Gates are physical.** Don't claim "should pass" — run the gate, paste the result.

## When you're blocked

- **Don't guess on solar-domain questions.** The user has a co-founder (Prasanta, VP Eng) who's the solar authority. If a domain question surfaces, surface it to the user; don't make the call yourself.
- **Don't guess on production-risk decisions.** Live system. Better to ask "should I rotate this IAM key first?" than to silently push a config that broadens blast radius.
- **For everything else — read the audits, read the existing code, then make a recommendation.** The user wants speed; just be honest about uncertainty.

## Sibling repo context (the desktop side)

If you need to understand what the desktop app is asking the backend for, look at `/Users/arunkpatra/codebase/pv_layout_project`:

- `/Users/arunkpatra/codebase/pv_layout_project/docs/PLAN.md` — desktop-side plan; Phase 1 rows depend on this initiative's V2 surface. (Promoted from `docs/post-parity/PLAN.md` after this kickoff was written.)
- `/Users/arunkpatra/codebase/pv_layout_project/docs/post-parity/PLAN-backend.md` — earlier draft of the backend plan (now superseded by `docs/initiatives/post-parity-v2-backend-plan.md` in this repo); read for additional rationale on row design.

## Stop after step 1

Your first deliverable is the plan revision. Do not start B1 until the user explicitly approves the revised plan.

--- END PROMPT ---

---

# Notes on this kickoff (for the orchestrator — Arun)

- **What the new session does first:** read mandatory docs + 3 discovery audits + auto-memory, then revise the plan, then stop and wait for your approval. No code rows execute on its first turn.
- **What survives from this session's work:** the branch `post-parity-v2-backend` with commit `849c85b` (the v1.0 plan + superseded banners). The new session amends the plan via a follow-up commit on the same branch.
- **What you do at handoff:** open Claude Code in `/Users/arunkpatra/codebase/renewable_energy`, paste the prompt above (everything between `BEGIN PROMPT` and `END PROMPT`), let it work.
- **What to expect from the new session:** the revision commit + a "ready for review" message. Then you say "approved, start B1" or push back on revisions.
- **If anything goes wrong:** the plan + audits + this kickoff file are your audit trail. Worst case you can checkout an earlier commit and start over.
