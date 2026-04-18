# 10X Development with Claude Code — Principles and Practices

**Audience:** Claude Code and the human developer (Arun Patra)
**Purpose:** Hard-won principles for getting production-quality output at high velocity

---

## The Fundamental Insight

Claude Code can generate 500 lines of code in 30 seconds. That is not the bottleneck. The bottleneck is **the time between writing code and knowing it works.** Every minute of that gap costs:

- Context switching (lost flow while waiting for results)
- Compounding errors (broken code built on broken code)
- Debugging time (10x harder to find bugs in 500 lines than in 50)
- Trust erosion (manual review of everything instead of trusting the output)

**10X velocity is not about writing code faster. It is about shrinking feedback loops until bugs are caught within seconds of being introduced, not hours later in a manual testing session.**

---

## What Claude Code Is Good At vs. What It Cannot Do

### Genuinely Strong

| Capability | Reliability |
|---|---|
| Code generation from clear specs | Very high |
| Mechanical refactoring (rename, move, re-export) | Very high |
| Research (reading docs, searching codebases) | High |
| Test writing (when given a clear contract) | High |
| Monorepo-wide changes (consistent updates across packages) | High |
| Static analysis compliance (lint, typecheck, build) | Very high |

### Unreliable — Requires Human Verification

| Capability | Why It Fails |
|---|---|
| **Predicting runtime behavior** | Cannot run the app. Cannot see what the user sees. Relies on reasoning about framework behavior, which is often wrong for edge cases. |
| **Framework behavior assumptions** | Reads docs and infers. Docs describe the happy path; real behavior has undocumented edge cases. "The docs say X is supported" ≠ "X works for our case." |
| **Knowing when it's wrong** | High confidence is not correlated with correctness. Claude will assert something wrong with the same confidence as 2+2=4. There is no self-doubt signal. |
| **Visual/interactive UX** | Cannot see the screen. Cannot click buttons. Cannot verify that the UI looks or behaves correctly. |
| **Integration behavior** | Unit tests mock everything. The real system has interactions between routing, auth, data loading, and rendering that mocks cannot replicate. |

### The Critical Implication

**Never trust Claude Code's assertion that something works unless you can see it working in the browser.** "All tests pass" means "all mocked scenarios pass." "Typecheck passes" means "types are consistent." Neither means "the feature works."

---

## The 3 Principles

### Principle 1: Spike Before You Scale

**Before building N things, build 1 thing and verify it works.**

When Claude Code presents an implementation plan with N tasks, ask:

> "Which 1-2 tasks form a minimal spike we can verify in the browser before doing the rest?"

Execute only those tasks, verify in browser, then proceed.

**When to spike:**
- Any new routing or layout pattern (before building 10 pages)
- Any new UI component pattern (before building 10 instances)
- Any new API integration (before building all endpoints)
- Any framework feature being used for the first time
- Any change where correctness depends on runtime behavior, not just types

**When you don't need a spike:**
- Pure logic with good unit tests
- Database schema changes (migrations verify themselves)
- Adding fields to existing CRUD patterns
- Mechanical refactoring with strong type coverage

### Principle 2: Separate Static from Runtime Verification

| Static Verification (Claude runs autonomously) | Runtime Verification (human required) |
|---|---|
| Type errors | Routing and navigation behavior |
| Lint violations | Page rendering |
| Broken dependencies | UI layout and visual correctness |
| Build failures | Actual user flows |
| Import resolution | Data loading sequences |

**You — the human — are the only runtime verification available.** Your time in the browser is the scarcest resource in the process.

Tell Claude Code: *"After implementing the spike, give me exact steps to test in the browser. I will test and report back. Do not declare anything works until I confirm."*

Never accept "all gates pass" as evidence a feature works. It is evidence the code is internally consistent. Necessary but not sufficient.

### Principle 3: Short Prompts for High-Trust Tasks, Deep Prompts for Low-Trust Tasks

**High-trust tasks (short prompt OK):**
```
"Add a createdAt field to the projects table."
```
- Pattern is established, types constrain implementation, static analysis catches mistakes.

**Low-trust tasks (deep prompt required):**
```
"Restructure the layout to use route groups.
SPIKE FIRST: Build one route group with one page, verify in browser.
FRAMEWORK ASSUMPTIONS: List any Next.js App Router behavior assumptions
you have not verified. I will check these during the spike."
```
- New pattern, runtime behavior involved, framework edge cases likely.

---

## Prompt Patterns That Prevent Wasted Work

### Pattern 1: "What Are You Assuming?"

After Claude presents a design:

> "List every framework behavior assumption in this design that you have not verified by running code."

This forces Claude to distinguish between "I know this works" and "I believe this should work."

### Pattern 2: "What Can't Tests Catch?"

After Claude says "all tests pass":

> "What aspects of this change can only be verified by running the app? Give me the exact manual test steps."

### Pattern 3: "Spike First, Scale Second"

When Claude presents a multi-task plan:

> "Before executing all N tasks, identify the 1-2 that form a minimal spike. Execute only those. I will test in the browser. If the spike works, proceed with the rest."

### Pattern 4: "Show Me the Contract"

Before Claude implements a shared pattern (like a layout wrapper, API client, or data hook):

> "Show me the pattern for ONE instance. I'll verify it works. Then apply it everywhere."

### Pattern 5: "What Breaks If You're Wrong?"

When Claude asserts something with high confidence:

> "If this assumption is wrong, what breaks and how hard is it to fix?"

If the answer is "17 files need re-editing," verify the assumption first.

---

## How to Structure Implementation Sessions

### Phase 1: Research and Design (Claude leads)
- Claude researches docs, reads code, proposes architecture
- Human validates the approach
- **Key output:** Design spec with EXPLICITLY MARKED unverified assumptions

### Phase 2: Spike (Claude implements, Human verifies in browser)
- Claude builds minimal skeleton (1-2 tasks)
- Human tests in browser
- **Key gate:** Human confirms spike works before proceeding
- Iterate until spike passes

### Phase 3: Scale (Claude leads, Human spot-checks)
- Claude implements remaining tasks using the verified pattern
- Static verification after each task
- Human spot-checks 1-2 tasks at natural milestones

### Phase 4: Integration Test (Human leads)
- Human runs through full feature in browser
- Claude provides the structured test plan
- Failures → back to Claude for fixes

### Phase 5: Polish and Commit
- Final static verification (lint, typecheck, build)
- Final manual verification
- Commit and/or PR

---

## Anti-Patterns to Avoid

| Anti-Pattern | Instead |
|---|---|
| **Build everything then test** — Execute all N tasks then first browser test. Bugs found late cost 10x more. | Build 2 → test → build 5 → test → build rest → final test. |
| **"Tests pass therefore it works"** — Mocks are not the app. Types are not behavior. | Explicitly ask "what can tests NOT catch?" and plan manual verification. |
| **"The docs say it works"** — Docs describe general capabilities, not your specific edge case. | Spike and verify. |
| **"Claude is confident so it must be right"** — High confidence is not a reliability signal. | Treat every assertion about runtime behavior as a hypothesis until verified. |
| **"Let Claude handle everything"** — Claude cannot test runtime behavior. | You are the runtime verification layer. Own that role. |

---

## Self-Review After Significant Work

After any substantial or wide-blast change — new infrastructure, scope renames, multi-file refactors, new patterns, anything non-trivial — Claude Code **must** run a self-review using the `superpowers:code-reviewer` agent before declaring work complete.

**What counts as significant:**
- New infrastructure (test setup, CI, build config)
- Monorepo-wide renames or refactors
- New architectural patterns being introduced for the first time
- Any change touching 5+ files
- Anything where a missed file would cause a silent production failure

**How to run the self-review:**
```
Agent(subagent_type: "superpowers:code-reviewer", prompt: "Review [what was done]...")
```

The reviewer checks for: missed files, misaligned configs, correctness issues, and consistency gaps — the class of bugs that only surface when a second pass looks at the whole picture rather than each change in isolation.

**Do not skip this step** on the grounds that "tests pass" or "build passes." Static gates verify internal consistency. The self-review catches what the gates cannot: wrong assumptions, incomplete renames, config mismatches, and structural gaps.

---

## Checklist for Every Implementation Session

**Before starting implementation:**
- [ ] Are there unverified framework behavior assumptions? Mark them explicitly.
- [ ] Is there a spike plan that verifies the riskiest assumption first?
- [ ] Is there a manual browser test plan for what static analysis can't catch?

**Before declaring implementation complete:**
- [ ] Has the spike been tested in a running browser?
- [ ] Have all static verification gates passed (lint, typecheck, build)?
- [ ] Has the human done a structured manual test?
- [ ] Has Claude listed what it CAN'T verify?
- [ ] For significant/wide-blast work: has the `superpowers:code-reviewer` self-review been run?

**Before committing:**
- [ ] All gates pass (lint, typecheck, build)
- [ ] Manual browser testing confirms the feature works
- [ ] No "it should work" — only "I tested it and it works"

---

## The One Sentence Version

**Claude Code writes the code; you verify it works in the browser. The faster you can verify, the faster you can ship. Invest in shrinking the verification loop, not in generating more code.**
