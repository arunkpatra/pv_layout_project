# Collaborative Testing Protocol

**Audience:** Claude Code
**Purpose:** How to conduct browser/runtime testing sessions with the human

---

## The Rule

**Ask one test question at a time. Never dump a full test list.**

When conducting a collaborative testing session with the human, ask for one specific thing to verify, wait for the result, then ask the next. This applies to all runtime verification — browser testing, UI checks, interaction flows.

## Why

- The human is at the keyboard/device. A list of 7 tasks creates cognitive overhead and loses the flow of the session.
- One-at-a-time keeps the feedback loop tight — a failure on step 2 means steps 3-7 may be irrelevant.
- It mirrors how a good pair-programming session actually works.

## How

**Wrong:**
> "Please check: 1) sidebar loads, 2) collapse works, 3) dark mode works, 4) mobile drawer works, 5) user menu opens, 6) nav items expand, 7) projects section visible"

**Right:**
> "Can you open `http://localhost:3000`? Does the sidebar layout load with 'SolarDesign Pro' at the top?"

Wait for response. Then:
> "Click the hamburger trigger in the top-left. Does the sidebar collapse to icon-only mode?"

Wait for response. Continue one step at a time.

## When to Apply

- Any time the human is verifying a feature in the browser
- Any time you ask the human to interact with the running app
- Any time you need runtime confirmation before proceeding

## Exception

If the human explicitly asks for a full test checklist upfront (e.g. "give me everything to test"), provide the full list. But still structure it as numbered steps they can work through sequentially, not a wall of questions.

---

## Spike Acceptance Testing

Spike testing follows the same one-at-a-time rule, with additional structure:

### Protocol

When a spike (or sub-spike) is implemented and committed, begin the acceptance session by presenting **only the first verification step**. Wait for the human's result. Proceed to the next step only after confirmation.

**Wrong:**
> "Spike 2a is committed. Please verify: 1) uv sync runs, 2) server starts, 3) curl returns {"status":"ok"}, 4) ruff passes, 5) monorepo gates pass."

**Right:**
> "Spike 2a is committed. Let's verify it together.
>
> **Step 1 of 5 — dependency install**
> ```bash
> cd apps/layout-engine && uv sync
> ```
> Did it complete with no errors?"

Wait. Then:
> "**Step 2 of 5 — server starts**
> ```bash
> PYTHONPATH=src uv run python src/server.py
> ```
> Does it print 'Layout engine listening on port 5000' with no errors?"

### Format

Each step follows this pattern:
- Label: **Step N of Total — what this checks**
- Command block (exact command to run)
- One yes/no question about the expected outcome
- Nothing else

### On Failure

If a step fails, stop the sequence. Diagnose and fix before resuming. Do not present the next step until the current one passes.

### Definition of Done for a Spike

A spike (or sub-spike) is **not done** until all five of the following are confirmed — in this order:

1. **Automated gates** — `bun run lint && bun run typecheck && bun run test && bun run build` all pass from repo root
2. **Human local verification** — human has run each acceptance step in a real local environment and confirmed each one
3. **CI/CD checks pass** — human pushes the branch and confirms all CI checks pass in the pipeline
4. **Production verification** — merge to main, wait for production deployment, then repeat the same verification steps against the production API/UI
5. **Explicit human sign-off** — human says the spike is done; Claude never declares a spike complete unilaterally

Do not begin the next spike until the human has confirmed all five. Wait — do not prompt.

### On Completion

Only after all four definition-of-done conditions are met, state what the next spike is. Do not begin it until the human explicitly says to proceed.
