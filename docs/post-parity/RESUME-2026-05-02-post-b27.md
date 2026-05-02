# Resume Prompt — Post-B27 (refund-on-cancel policy locked)

Copy the block between `--- BEGIN PROMPT ---` markers as the first message in the resumed session. ~3-minute read.

---

--- BEGIN PROMPT ---

# Resuming SolarLayout — B27 closed; CR1 closed; B27 implementation rows queued for `superpowers:writing-plans`

You're picking up after a long session that closed two major P0 items: CR1 (cable-routing correctness audit) and B27 (refund-on-cancel policy decision memo). Both are fully shipped + pushed.

## Critical state

**Working dir:** `/Users/arunkpatra/codebase/pv_layout_project`. **Branch:** `main`. Tree clean against `origin/main`.

**Recent commits (newest first, all pushed):**
```
<filled at commit time> docs(b27): close B27 — refund-on-cancel policy locked + implementation rows queued
2de7ec8 docs(cr1): aisle-routing verification end-to-end on both fixtures
55b1f9a docs(cr1): aisle-routing analyzer + how-to
05d952d docs(cr1): close CR1 — cable-routing audit complete; CR2 not-needed; CR3 added
```

Run `git log --oneline -10` to confirm the most recent commit's SHA.

## What just shipped (B27 — 2026-05-02)

**Decision memo:** [`docs/initiatives/findings/2026-05-02-002-refund-on-cancel-policy.md`](../initiatives/findings/2026-05-02-002-refund-on-cancel-policy.md). Locked via Arun interview using brainstorming-skill protocol. All 8 of B27's open questions answered.

**Headline decisions:**
- **Refund yes** on cancel + on failure (system + user-input error). Quota restored. B18 delete unchanged (no refund — delete is for completed/cancelled history cleanup).
- **Race semantics: cancel always wins** until Run reaches terminal `DONE`. Cancel marker persisted at `Run.status = CANCELLED` first; sidecar's completion path `SELECT … FOR UPDATE` checks the marker before committing DONE. Cancel-after-DONE → 409 (use B18 delete instead).
- **Refund mechanism:** new `UsageRecord` row with `kind = 'refund'`, `refundsRecordId = <original.id>`, `count = -1`. Original charge row stays immutable (audit trail). Single Postgres transaction with row-level locking — synchronous, no eventual reconcilers.
- **UI:** confirmation modal on Cancel ("…you'll lose any work in progress. Your calculation will be refunded."). `/dashboard/usage` shows charge rows only with status badges (Completed | Cancelled | Failed); refund rows hidden from customer.
- **Cancelled / Failed runs preserved** (`deletedAt = null`, status flag), visible in customer history, do NOT count against quota.

**Documents amended:** V2-plan §49 + offload-memo §14 — both updated in same commit, original "no refund" stances marked superseded.

**Implementation rows queued in `docs/initiatives/post-parity-v2-backend-plan.md`:**
- **B29** Schema migration (Run.status enum + UsageRecord.kind + refundsRecordId)
- **B30** Cancel endpoint (`POST /v2/projects/:id/runs/:runId/cancel`)
- **B31** Sidecar completion-path cancel-marker check
- **B32** Failed-runs internal path
- **B33** Desktop frontend (cancel modal + cancelRunV2 wiring)
- **B34** `/dashboard/usage` calc-history extension

All 6 marked **todo**. **Concrete plans for each will be developed via `superpowers:writing-plans` skill in this resumed session.** B27's row itself is now `done`.

**B28 row updated** to ratify B27 decisions in its scope (cancelled-run-re-deletable behavior, quota impact, wire shape). B28 stays `todo`; coordinate with B27's implementation rows.

## What just shipped (CR1 — 2026-05-02, earlier same session)

Cable-routing correctness audit. New app's Pattern V uses `route_poly = fence − ICRs` correctly per industry research (NEC 690 / IEC 62548 / IEC 60364-7-712). No engine fix needed; CR2 closed as `not-needed`. Six artifacts: PRD + unified compliance PDF + sidecar pytest + decision memo + probe script + unified-PDF generator. End-to-end DXF analysis on both fixtures (phaseboundary2 + complex-plant-layout) verified the "AC cables use inter-row aisles" claim at the artifact level.

CR3 (obstacle / line-buffer subtraction policy + per-run exclusion persistence brainstorm) is **deferred** by Arun on 2026-05-02. Pick up before D-row drawing tools work begins.

## Next action

**Engage `superpowers:writing-plans` to plan B27's implementation rows** (B29-B34). The user signaled this in-session: *"since this is bigger chunk of work touching multiple surfaces we will be working with /using-superpowers"*.

Recommended sequencing:
1. **B29 first** (schema migration) — blocks all others.
2. **B30 + B32 in parallel** (cancel endpoint + failed-runs path; both depend on B29 only).
3. **B31** (sidecar completion-path check) — depends on B29 + B30.
4. **B33 + B34 in parallel** (frontend + dashboard) — depend on B30.

For each row: invoke `superpowers:writing-plans` to create a detailed plan at `docs/superpowers/plans/2026-05-NN-b<row>-<slug>.md`. Then execute via `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` per Arun's preference at execution time.

## Other open queues

- **CR3 brainstorm** — deferred. Picks up before D-row drawing tools.
- **Spike 2 kickoff** — was previously gated on B27. Now unblocked; B27's policy is the basis for Spike 2's `POST /v2/jobs/:id/cancel` endpoint design. The implementation rows B29-B34 are essentially the desktop-side prep for Spike 2.
- **Phase 4 D-rows** (drawing tools) — `todo`, need CR3 to land first per CR1 PRD's deferred questions.

## Locked non-negotiables to remember

1. **One question at a time** during design / brainstorming. Same rule as smoke verification. Never dump a numbered decision sheet.
2. **Cite-before-proceed.** For any far-reaching / customer-impact / deep-tech claim: fetch authoritative sources, cite URLs, only THEN proceed.
3. **External contracts process.** Tauri webview ↔ sidecar ↔ mvp_api are separate runtimes; read the source of truth before writing any boundary name.
4. **Bite-sized smoke chunks.** During UI verification: one check per prompt, wait for response.

## Working dynamic note

Arun is co-founder with Prasanta (30-year-friend dynamic; both repo co-owners; informal direct comms). Prasanta is the solar-domain authority + VP Eng. Per Prasanta's directive (CLAUDE.md §2): free hand on solar-domain calls supported by industry standards. B27 was a product-policy decision; standard SaaS billing patterns (Stripe charge/refund analogue) are the citation, no external standards needed.

## Files / paths to know

- **B27 memo:** `docs/initiatives/findings/2026-05-02-002-refund-on-cancel-policy.md`
- **Backend plan with B29-B34 + B27 closed:** `docs/initiatives/post-parity-v2-backend-plan.md`
- **V2-plan §49 + offload-memo §14** amended in same commit
- **CR1 artifacts:** `docs/post-parity/PRD-cable-routing-correctness.md`, `docs/post-parity/findings/cable-routing-compliance-report.pdf`, `docs/post-parity/findings/2026-05-02-cable-routing-correctness.md`, `docs/post-parity/findings/aisle-routing-verification.md`
- **CR1 scripts:** `python/pvlayout_engine/scripts/parity/{probe_pattern_stats,generate_unified_compliance_pdf,analyze_aisle_routing}.py`
- **CR1 pytest:** `python/pvlayout_engine/tests/integration/test_cable_routing_constraints.py`

## Standing by for

Your "go" to start `superpowers:writing-plans` on the first B27-implementation row (likely B29 = schema migration, since it blocks everything). If you'd like a different sequencing or a different starting point, tell me; otherwise I'll begin with B29.

## Sibling RESUME files (audit trail)

All under `docs/post-parity/`, newest first:

- `RESUME-2026-05-02-spike-2-prep.md` — start of this session (CR1 + complex-plant capture overnight)
- `RESUME-2026-05-01-spike1-smoke-mid.md` — mid-Spike-1 smoke
- `RESUME-2026-05-01-post-merge.md` — post `renewable_energy` merge state
- `RESUME-2026-04-30-end-of-day.md`, `RESUME-2026-04-30-mid-S4.md`, `RESUME-2026-04-30-mid-SP1.md`, `RESUME-2026-04-30.md` — multi-checkpoint day during SP1/SP4 thumbnails work

Convention: `RESUME-YYYY-MM-DD-<context-slug>.md`. Don't delete prior files — audit trail.

--- END PROMPT ---
