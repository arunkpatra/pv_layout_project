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
