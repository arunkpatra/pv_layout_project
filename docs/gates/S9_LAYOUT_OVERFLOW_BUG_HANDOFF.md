# S9 blocker — page-level scroll appeared after Inspector got real content  *(HISTORICAL — resolved)*

**Written:** 2026-04-24
**Resolved:** 2026-04-24 — see §11 at bottom.
**Why this file exists:** S9 was mid-gate with a viewport-scroll blocker triggered once LayoutPanel + SummaryPanel made the inspector tall enough to engage `overflow-y: auto`. This file briefed the fresh session so it could investigate from clean DOM evidence rather than chasing mid-session hunches. The resolution is appended below (§11); the original triage notes (§§1–10) are preserved verbatim as history for anyone hitting similar WKWebView + custom-scrollbar + nested-overflow cascades later.

The two pathologies captured at the time of writing:

1. **Page-level vertical scroll.** Scrolling the page moves the WHOLE AppShell — the top bar disappears off the top of the viewport while the status bar stays visible at the bottom. Should be impossible: AppShell is `h-screen overflow-hidden`.
2. **Page-level horizontal scrollbar.** A horizontal scrollbar appears at the bottom of the viewport, partially obscuring the status bar.

Three rounds of speculative fixes in S8's bug debugging had wasted time; this handoff existed to prevent the same pattern in S9.

**Read order for the new session:**

1. `CLAUDE.md` (root) — project instructions, spike protocol, "Local execution, global awareness" working agreement.
2. `docs/ARCHITECTURE.md` §1–3 + §6.5 (state architecture) + §12.
3. `docs/SPIKE_PLAN.md` → S9 entry (In-Scope and Deliverables).
4. `docs/adr/0003-state-architecture.md`.
5. `docs/gates/s09.md` — what S9 built, gate steps.
6. `docs/gates/S8_KMZ_RENDER_BUG_HANDOFF.md` §10 — the resolution / methodology lessons from the previous open-ended layout bug. Especially the "what worked" section.
7. **This file.**

---

## 1. The bug (what the user sees)

Open the Tauri app via `cd apps/desktop && bun run dev`. With or without a KMZ loaded:

- A **horizontal scrollbar** appears at the bottom of the window. It wasn't there in S8.
- A **vertical page-level scroll** is engaged — scrolling the page (mouse wheel anywhere outside the inspector) moves the WHOLE AppShell. The top bar (with breadcrumb, plan chip, user avatar) scrolls UP and out of view. The status bar stays at the bottom. Behavior is consistent with the WHOLE PAGE having scrollable overflow.
- Inspector content (LayoutPanel + SummaryPanel) IS taller than the inspector aside's available height. The aside has `overflow-y-auto` in `AppShell.tsx`, but it's not engaging — instead the page scrolls.

User screenshots from the session:
- Screenshot 1: app loaded with phaseboundary2.kmz, panel visible in normal state, inspector vertical scrollbar present (correct).
- Screenshot 2: title bar still visible but a horizontal scrollbar appears at bottom of window, partially obscuring status bar.
- Screenshot 3: title bar GONE from the top — the page has been scrolled UP. Status bar still at the bottom of the visible viewport. Inspector content visible mid-screen.

**The S8 KMZ-render fix is intact** — when a KMZ is loaded, the boundary renders correctly inside the canvas (cascade-layer fix from S8 still works). This is purely a layout-overflow bug surfaced by the inspector growing.

---

## 2. Spike status

| Spike | Status |
|---|---|
| S0 → S8 | 🟢 passed (tags `v0.0.0-s0` … `v0.0.9-s8`) |
| S8.7 — Frontend test harness + CI | 🟢 passed (`v0.0.10-s8_7`) |
| S8.8 — State architecture cleanup | 🟢 passed (`v0.0.11-s8_8`) |
| **S9 — Input panel + Generate Layout** | 🟡 in progress, gate-blocked by this layout bug |

S9 shipped everything else successfully. Static gates green: 0 lint errors, 7 typecheck, 75 frontend tests, 4 build, 43 sidecar pytests. The blocker is purely visual layout in the Tauri webview.

---

## 3. What's been tried in this session

**One mid-session fix landed before this handoff was written**: an infinite-render loop in LayoutPanel was discovered and fixed (the `watch()` returning a new object reference every render, combined with a `useEffect([watched], setAll)` that pushed back to Zustand on every render, looped forever). Symptom of THAT bug was a blank/unresponsive window. After the fix, the window renders the full shell — the LAYOUT bug described above is what came next.

**Specifically:**
- Removed `useEffect(() => setAll(watched), [watched, setAll])` in `LayoutPanel.tsx`.
- Pushed `setAll(values)` only in the `onSubmit` handler (sync to Zustand on Generate, not every keystroke).
- Added `forceMount` + `data-[state=inactive]:hidden` to the Layout `TabsContent` so the form survives a tab switch to "Energy yield" and back.

After those fixes the app renders, but the layout-overflow bug appears. **No fix attempts have been made for the layout-overflow bug yet** — handoff written instead, on the user's "S8-pattern" instruction.

---

## 4. Hypotheses worth investigating (mine — start here, but verify before fixing)

I have two hypotheses, neither verified. The S8 lesson: refute hypothesis #1 with real evidence FIRST before touching code. Then add diagnostic probes if needed. Don't blind-fix.

### Hypothesis A — Vertical page scroll: aside's `min-height: auto` lets content push it taller than the row

**Reasoning:**
- `AppShell.tsx` aside is `<motion.aside className="shrink-0 border-l ... overflow-y-auto overflow-x-hidden">` with an inner `<div style={{ width: "320px" }}>` holding the inspector content.
- The aside is a flex item in the middle row (`flex flex-1 min-h-0 overflow-hidden`).
- Flex items default to `min-block-size: auto` (cross-axis, so `min-height: auto` for items in a row). This means the item's minimum size is its content's intrinsic size.
- Through S6/S7/S8, the inspector had ~3 small skeleton sections (~300px tall total). Less than the row's height (~828px on a typical window). No overflow → the auto-min-height never kicked in → no problem.
- In S9, the inspector now has 5 LayoutPanel sections + Generate area + SummaryPanel + tabs header. Total height likely >1000px.
- With `min-height: auto`, the aside's effective minimum height = content's intrinsic height = ~1000px. The aside grows to fit. The row tries to fit. The flex column (AppShell) tries to fit. AppShell's `h-screen overflow-hidden` should clip — BUT: in some browser engines, when a flex parent has `overflow: hidden` AND its child wants to overflow, the parent's intrinsic size may grow regardless. The user's WKWebView (Tauri on macOS) might exhibit this.
- **The fix would be `min-h-0` on the aside.** That overrides the default `min-height: auto`, allowing the aside to be smaller than its content, allowing `overflow-y-auto` to engage on internal content.

**Verify before fixing:**
- Open Safari Web Inspector → Elements. Inspect the `<aside>` (look for `class="...overflow-y-auto overflow-x-hidden..."`).
- Read its computed `height`, `min-height`, and check whether `overflow-y` shows scrollbar in the Box Model panel.
- Read `<div id="root">` and its child AppShell `<div>` for computed `height` — is it 100vh as expected, or larger?
- If AppShell's computed height exceeds 100vh, the bug is at the AppShell containment level. If aside height exceeds row height, the bug is at the aside.

### Hypothesis B — Horizontal scroll: NumberInput's `<input type="number">` has implicit `min-width: auto` from its content's intrinsic size

**Reasoning:**
- `<input type="number">` has a browser-default intrinsic width of ~140-200px (varies by browser; based on the default `size="20"` attribute behavior).
- In `LayoutPanel.tsx`, the FieldRow's right column is `<div className="w-[150px]">` containing a NumberInput.
- NumberInput's wrapper is `flex items-stretch h-[28px] w-full` — sets the wrapper to 150px.
- Inside the wrapper, the actual `<input>` is `flex-1 ...` — flex item, default `min-width: auto`.
- If the input's intrinsic min-width (~150-200px) exceeds 150px, the input PUSHES the wrapper wider. Wrapper exceeds 150px. FieldRow exceeds parent. Parent (LayoutPanel section) exceeds 280px. Aside content exceeds 320px. Aside has `overflow-x-hidden` which CLIPS.
- But — if the clip happens via `overflow-x-hidden`, why is there a horizontal scrollbar at the PAGE level? Because clipping at the aside level shouldn't propagate to body.
- **Unless** the aside's `overflow-x-hidden` is being defeated by the same CSS Cascade Layers issue as S8 — some unlayered CSS rule is overriding it. (Less likely but worth checking.)
- **Another possibility:** the horizontal overflow is somewhere else entirely (the canvas? the toolrail? a portal element from Radix Popover?) — needs investigation.

**Verify before fixing:**
- Open Safari Web Inspector. Scroll right on the page. Inspect what's in the rightmost ~50px of the page. That's the element causing horizontal overflow.
- Check `document.body.scrollWidth` vs `document.body.clientWidth` in the JS console.
- Check whether `<aside>` computed `overflow-x` is actually `hidden` (cascade layer check).
- Use `* { outline: 1px solid red }` injected via DevTools to see all element bounds at once.

### Hypotheses I would explicitly NOT pursue first

- "MapCanvas is overflowing" — S8's cascade-layer fix is intact (the boundary renders correctly).
- "framer-motion is mis-animating the aside width" — aside width is set via inline style, doesn't depend on content.
- "It's a Tauri-only quirk" — possible but unlikely; the cleanest debug is in the running app, not isolated.

---

## 5. Explicitly do NOT do

- **Do NOT revert the S9 LayoutPanel infinite-loop fix** (the `useEffect([watched])` removal). That fix was correct and unrelated to this bug.
- **Do NOT remove `forceMount`** from the Layout TabsContent. Keep the form state across tab switches.
- **Do NOT touch the S8 cascade-layer fix in MapCanvas** (`w-full h-full` on the containerRef). It's the load-bearing comment in `MapCanvas.tsx`.
- **Do NOT scope-creep into S10.** Inverters/cables/LAs/drag are NOT part of this fix.
- **Do NOT widen the inspector** as a fix. The inspector is intentionally 320px per the design system.
- **Do NOT blindly add `min-h-0` and call it done.** Read computed CSS in the inspector first, confirm the aside's height is exceeding the row's height, then apply the fix surgically. The S8 lesson: blind fixes burned 3 rounds.
- **Do NOT add diagnostic console.log probes** to fix THIS bug — DOM inspection in Safari Web Inspector is much faster than logging here. (Probes were the right call in S8 because the bug was in event timing; this bug is purely CSS layout, which DevTools shows directly.)

---

## 6. What's on disk — current file map

S9 work (uncommitted as of this handoff):

```
apps/desktop/
├── public/map-styles/
│   ├── pv-light.json                 ← 2 new sources, 4 new layers (tables, ICRs)
│   └── pv-dark.json                  ← same
├── src/
│   ├── App.tsx                       ← tabbed Inspector, layout mutation wiring
│   ├── panels/                       (NEW)
│   │   ├── LayoutPanel.tsx           ← react-hook-form, 5 sections, Generate
│   │   └── SummaryPanel.tsx          ← StatGrid + PropertyRows from layoutResult
│   ├── project/
│   │   ├── layoutToGeoJson.ts        (NEW)
│   │   └── layoutToGeoJson.test.ts   (NEW)
│   └── state/
│       ├── layoutParams.ts           ← + Zod schema
│       ├── layoutParams.schema.test.ts (NEW)
│       ├── useLayoutMutation.ts      (NEW)
│       └── useLayoutMutation.test.tsx (NEW)
└── package.json                      ← + react-hook-form, zod, @hookform/resolvers

packages/
├── sidecar-client/src/index.ts       ← + LayoutResult.placed_*_wgs84, runLayout()
└── ui/src/
    ├── compositions/
    │   ├── LockedSectionCard.tsx     (NEW)
    │   └── MapCanvas.tsx             ← + tablesGeoJson/icrsGeoJson/icrLabels props
    └── index.ts                      ← + LockedSectionCard, IcrLabel exports

python/pvlayout_engine/
├── pvlayout_engine/
│   ├── adapters.py                   ← + _rect_corners_wgs84
│   └── schemas.py                    ← + placed_tables_wgs84, placed_icrs_wgs84
└── tests/integration/
    └── test_layout_wgs84_corners.py  (NEW)

docs/
└── gates/
    ├── s09.md                        (NEW) — gate memo
    └── S9_LAYOUT_OVERFLOW_BUG_HANDOFF.md  (THIS FILE)
```

Files most relevant to this layout bug:

```
packages/ui/src/compositions/AppShell.tsx       ← unchanged in S9 but the suspect (aside)
packages/ui/src/compositions/Inspector.tsx      ← unchanged in S9 (InspectorRoot, InspectorSection)
packages/ui/src/components/NumberInput.tsx      ← unchanged in S9 but suspect (input intrinsic min-width)
packages/ui/src/components/Tabs.tsx             ← unchanged in S9 but new in this layout
apps/desktop/src/panels/LayoutPanel.tsx         ← NEW; main culprit-shaped surface
apps/desktop/src/panels/SummaryPanel.tsx        ← NEW
apps/desktop/src/App.tsx                        ← MODIFIED (Tabs structure introduced)
packages/ui/src/globals.css                     ← unchanged; check for overflow rules anyway
```

---

## 7. Git state

```
Current branch: main
Latest tag:     v0.0.11-s8_8
Latest commit:  d309b12 → b735d59 → 2df5df7 (origin/main, all pushed)
                d309b12 docs: mark S8.7 passed; activate S8.8
                b735d59 s08_8: state architecture cleanup
                2df5df7 docs: mark S8.8 passed; activate S9

Uncommitted S9 work on disk (not yet committed):
  M apps/desktop/package.json
  M apps/desktop/public/map-styles/pv-dark.json
  M apps/desktop/public/map-styles/pv-light.json
  M apps/desktop/src/App.tsx
  M apps/desktop/src/state/layoutParams.ts
  M apps/desktop/src/state/layoutResult.test.ts
  M apps/desktop/src/test-utils/mockSidecar.ts
  M bun.lock
  M packages/sidecar-client/src/index.ts
  M packages/ui/src/compositions/MapCanvas.tsx
  M packages/ui/src/index.ts
  M python/pvlayout_engine/pvlayout_engine/adapters.py
  M python/pvlayout_engine/pvlayout_engine/schemas.py
  ?? apps/desktop/src/panels/
  ?? apps/desktop/src/project/layoutToGeoJson.test.ts
  ?? apps/desktop/src/project/layoutToGeoJson.ts
  ?? apps/desktop/src/state/layoutParams.schema.test.ts
  ?? apps/desktop/src/state/useLayoutMutation.test.tsx
  ?? apps/desktop/src/state/useLayoutMutation.ts
  ?? docs/gates/s09.md
  ?? docs/gates/S9_LAYOUT_OVERFLOW_BUG_HANDOFF.md   (this file)
  ?? python/pvlayout_engine/tests/integration/test_layout_wgs84_corners.py
```

**Do not commit** until the layout bug is fixed and the S9 gate passes. S9 closing commit should be one atomic commit per spike protocol.

---

## 8. Diagnostic approach for the new session

**Before touching code:**

1. **Open the Tauri app:** `cd apps/desktop && bun run dev`. Confirm the bug reproduces (page-level horizontal + vertical scroll).

2. **Right-click → Inspect Element** in the Tauri window. This opens Safari Web Inspector (Tauri uses WKWebView on macOS).

3. **In the Console**, paste:
   ```js
   const m = (sel, ...props) => {
     const el = document.querySelector(sel)
     if (!el) return `[${sel}]: not found`
     const cs = getComputedStyle(el)
     const obj = { tag: el.tagName, classes: el.className }
     for (const p of props) obj[p] = cs[p]
     obj.rect = el.getBoundingClientRect()
     return obj
   }
   console.log("body  ", m("body", "overflow", "overflowX", "overflowY", "height", "minHeight"))
   console.log("#root ", m("#root", "overflow", "overflowX", "overflowY", "height", "minHeight"))
   console.log("shell ", m(".h-screen.w-screen", "overflow", "overflowX", "overflowY", "height", "minHeight"))
   console.log("row   ", m(".flex.flex-1.min-h-0", "overflow", "overflowX", "overflowY", "height", "minHeight"))
   console.log("main  ", m("main", "overflow", "overflowX", "overflowY", "width", "height"))
   console.log("aside ", m("aside", "overflow", "overflowX", "overflowY", "width", "height", "minHeight"))
   console.log("aside-inner", m("aside > div", "width", "height", "overflow"))
   console.log("---")
   console.log("body scrollW/clientW:", document.body.scrollWidth, "/", document.body.clientWidth)
   console.log("body scrollH/clientH:", document.body.scrollHeight, "/", document.body.clientHeight)
   console.log("html scrollW/clientW:", document.documentElement.scrollWidth, "/", document.documentElement.clientWidth)
   console.log("html scrollH/clientH:", document.documentElement.scrollHeight, "/", document.documentElement.clientHeight)
   ```
   Paste the output back to the orchestrator. The `scrollW > clientW` mismatch identifies horizontal overflow source. The `scrollH > clientH` mismatch identifies vertical. The element computed-style readouts show whether `overflow-hidden` is actually applied where expected (cascade layer check).

4. **Visually identify the wide element.** In the same Console, run:
   ```js
   ;[...document.querySelectorAll("*")].filter(el => el.scrollWidth > el.clientWidth + 1 && el.scrollWidth > 100).slice(0, 20).map(el => ({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 80), scrollW: el.scrollWidth, clientW: el.clientWidth }))
   ```
   Reports elements that have horizontal overflow inside them. The first one with overflow IS the source of the horizontal scrollbar. Likely candidates: the inspector aside (or its inner div), a NumberInput wrapper, the form element.

5. **Same for vertical:**
   ```js
   ;[...document.querySelectorAll("*")].filter(el => el.scrollHeight > el.clientHeight + 1 && el.scrollHeight > 100).slice(0, 20).map(el => ({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 80), scrollH: el.scrollHeight, clientH: el.clientHeight, overflowY: getComputedStyle(el).overflowY }))
   ```
   Look for an element whose scrollHeight > clientHeight but `overflow-y` is `visible` (not `auto` or `scroll`). That element is leaking content vertically.

6. **Apply the fix** based on what step 5 reveals. Likely candidates:
   - `min-h-0` on the aside in `AppShell.tsx`.
   - `min-w-0` on the input element in `NumberInput.tsx`.
   - An overlooked `overflow-visible` somewhere.
   - A cascade-layer override on `overflow-hidden`.

7. **Verify the fix.** Re-run step 3 after the fix; both scrollWidth and scrollHeight should equal clientWidth/clientHeight at the body / html level. Page scroll gone. Inspector internal scroll engaged.

---

## 9. Verification after the fix

Re-run S9 gate steps from `docs/gates/s09.md`:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project

# Static gates (should still all pass — they did before this bug)
bun run lint && bun run typecheck && bun run test && bun run build
cd python/pvlayout_engine && uv run pytest tests/ -q && cd ../..

# Native dev — primary deliverable
cd apps/desktop && bun run dev

# Walk steps a–l in s09.md.
# Specifically for THIS bug:
#   - No horizontal scrollbar at the bottom of the window.
#   - Mouse-wheel scrolling on the canvas does NOT scroll the page (just zooms map).
#   - Mouse-wheel scrolling on the inspector scrolls the INSPECTOR INTERNALLY.
#     The top bar stays fixed at top.
#   - Resize the Tauri window taller and shorter — inspector adapts; no page scroll.
```

If both bugs fixed AND all S9 gate steps pass:

1. Strip any diagnostic JS pasted into the console (it's not in source).
2. Mark `docs/gates/STATUS.md` S9 row 🟢; update `docs/gates/s09.md` Status → Passed.
3. Append §11 "Resolution" to this file (mirror the structure used in `S8_KMZ_RENDER_BUG_HANDOFF.md` §10 — but numbered §11 here to avoid colliding with the pre-existing §10 "User's working style"; S8 has a duplicate §10 which we don't propagate).
4. Commit the S9 batch: `s09: input panel + generate layout (tabbed inspector + canvas extension)`.
5. Tag: `v0.0.12-s9`.
6. Hand off: "S9 passed, ready for S10."

---

## 10. User's working style (reminders)

- Precise about scope. Corrects misstatements; track the plan faithfully.
- Runs every physical gate. Will copy-paste output / screenshots back.
- Prefers opinionated defaults over open questions, but expects evidence-backed recommendations — see "Local execution, global awareness" in CLAUDE.md.
- Prefers automation. Does NOT want narrated deliberation — keep updates tight.
- Writes handoff docs when a session is hitting a wall, then opens a fresh session with full context. (Pattern previously used in S6 and S8 with great effect.)
- Has pushed `main` to `origin` as of S8.8 close (`2df5df7`). All S9 work is **local only**.

---

**End of handoff. New session: read top to bottom, then start by running the diagnostic console snippets in §8 step 3–5. Do not blind-fix — confirm the overflowing element first.**

---

## 11. Resolution (2026-04-24)

S9 passed. Three distinct bugs were found and fixed via diagnostic-driven debugging — the layout-overflow bug described in §1 plus two gate-step regressions surfaced during the a–l walkthrough. None of §4's hypotheses matched the actual root causes; the diagnostic data drove each fix.

### Bug A — viewport-scroll cascade (the "top bar disappears, horizontal scrollbar appears" bug)

**Hypothesis A (aside `min-h-0`) was refuted by data.** The console snippet in §8 step 3 showed `aside.overflow-y = auto` was correctly engaging internally (`aside.scrollH=1032, aside.clientH=513, aside.height=513`) — the inspector's internal scroll worked as intended. Hypothesis B (NumberInput min-width) identified a real internal overflow (`input.scrollW=249, wrapper.clientW=148`) but it was cleanly clipped by the aside's `overflow-x: hidden` and was **not** the trigger for the page-level bug.

**The real chain**, proved by Snippet 5 in the bug state (window 1120×585, scrollbars visible):

1. S9's LayoutPanel + SummaryPanel grew the inspector's inner content to 1032px tall. Before S9, inspector skeletons were ~300px — short enough to never engage `overflow-y: auto` on the aside.
2. At viewport heights below ~1104px, aside content > aside height → `overflow-y: auto` engaged, creating an internal scrollbar inside the aside.
3. **WebKit scrollHeight quirk:** `getBoundingClientRect()` on the internally-scrolled inner div returned its unclipped virtual position (`rect.top = -658` in viewport coords, 519px above the aside's top — the aside's scroll offset). This contributed ~316px to `html.scrollHeight` beyond the shell's natural 585px, even though the content was visually clipped by aside's `overflow: auto`.
4. The 316px phantom scroll triggered html's vertical scrollbar (10px wide per the custom `::-webkit-scrollbar` rule in `globals.css`).
5. Once the vertical scrollbar existed, `100vw` (= 1120) included the scrollbar gutter while `html.clientWidth` (= 1110) excluded it. Shell's `w-screen = 100vw = 1120` now overshoots clientW by 10px → horizontal overflow at body level.
6. Horizontal scrollbar appears → steals 10px vertically → `h-screen = 100vh = 585` now overshoots `clientH = 575` → vertical overflow reinforced, user can scroll the page, topbar disappears on scroll.

**Fix:** [`packages/ui/src/globals.css`](../../packages/ui/src/globals.css) — add `overflow: hidden` to the `html, body, #root` rule. Desktop shell apps should never allow viewport-level scroll; all scroll is internal. Clipping at the html/body boundary makes the cascade physically impossible regardless of what WebKit's scrollHeight computes: no viewport scrollbar → `100vw === clientW`, `100vh === clientH`, shell always sized to viewport exactly. Standard pattern for Linear/Figma/Claude Desktop-class apps. Long inline comment documents the WHY so a future reader doesn't "optimize" it away.

**Defensive hygiene fix** (not the trigger, but latent): [`packages/ui/src/components/NumberInput.tsx`](../../packages/ui/src/components/NumberInput.tsx) — added `min-w-0` to the `<input>`. Overrides the flex-item default `min-width: auto` which would otherwise resolve to the input's intrinsic min-content width (~200px for `type=number` with implicit `size=20`), forcing the wrapper 67px wider than its 150px container. Currently aside's `overflow-x: hidden` hid this, but it'd surface in any layout without aside-level clipping.

**Confirmation:** post-fix Snippet 5 at the same window dimensions showed `html.scrollW === clientW`, `html.scrollH === clientH`, `html.scrollTop === 0` with scrolling impossible.

### Bug B — tilt override (and every other form-edit) ignored on first Generate (the "stale closure" bug)

Surfaced during gate step f. User toggled "Override tilt" ON, set tilt=25, clicked Generate — summary showed 19.6 (latitude-derived auto value), not 25. Re-clicking Generate without further edits applied 25 correctly. "Inconsistent UI behaviour" was the initial framing — the real pattern was "first Generate after any form edit uses stale params."

**Root cause: stale closure + same-tick Zustand write.** The submit flow in `LayoutPanel.tsx` ran `setAll(values); onGenerate(values)` synchronously. `handleGenerate` in `App.tsx` was a `useCallback` closed over `layoutParams = useLayoutParamsStore((s) => s.params)`. Zustand's `setAll` updated the store synchronously, but the `layoutParams` bound inside `handleGenerate`'s closure was captured at the **previous render** — React doesn't re-render mid-event-handler. So `layoutMutation.mutate({ params: layoutParams })` fired with the old (pre-submit) params every time. Subsequent clicks (with no further edits) worked because by then React had re-rendered and the closure was fresh.

**Fix:** [`apps/desktop/src/App.tsx`](../../apps/desktop/src/App.tsx) — read from Zustand via `useLayoutParamsStore.getState().params` at call-time inside `handleGenerate`. Removes the hook subscription and its useCallback dependency; reads the synchronously-just-written value every time. Also correctly handles the retry path (no new values in flight → last-submitted values still in the store). Long inline comment documents the pattern so future callbacks that need just-written Zustand state follow the same approach.

### Bug C — LayoutPanel form values don't reset on new KMZ load (the "stale form" bug)

Surfaced during gate step j. Loading a second KMZ correctly cleared the canvas layer and reverted the Summary Panel to placeholder, but LayoutPanel's input fields retained the previous project's edited values. The initial call (before user reflection) was to leave this as-is with a "Reset to defaults" affordance in a future spike; user preference on reflection was auto-reset.

**Fix:** [`apps/desktop/src/App.tsx`](../../apps/desktop/src/App.tsx) — three changes wired together:
1. Subscribe to `useLayoutParamsStore((s) => s.resetToDefaults)` — already exposed by the slice since S8.8.
2. New local state `layoutFormKey`, bumped on each successful KMZ load.
3. In `handleOpenKmz`, on successful parse: `clearLayoutResult()` → `resetLayoutParams()` → `setLayoutFormKey((k) => k + 1)` → `setProject(...)`.
4. `<LayoutPanel key={layoutFormKey} ...>` — the key change forces a remount on new KMZ, which causes RHF's `useForm({ defaultValues: params })` to re-read the freshly-reset Zustand params. A plain RHF `reset()` wouldn't work: `defaultValues` is captured at mount; changing Zustand in place doesn't propagate to RHF without an explicit reset call, which introduces loop-risk with `mode: "onChange"`. The `key`-based remount is the idiomatic React primitive for "reset this subtree."

TabsContent's `forceMount` still keeps LayoutPanel mounted across tab switches (the key doesn't change on tab switch, only on KMZ load) — the S9 form-state-across-tabs fix from earlier in the session is preserved.

### What worked, methodologically

- **Refuting §4 hypotheses with real data first** prevented a repeat of the three speculative rounds from the S8 debugging. Snippets 1–5 showed `aside.overflow-y: auto` was engaging correctly, eliminating Hypothesis A from consideration in <2 minutes of DOM inspection.
- **The asymmetry between `html.scrollH = 891` and `body.scrollH = 585`** was the single most important diagnostic clue — it pointed outside body, then further data ruled out portals, narrowing to "some WebKit-specific behaviour with internally-scrolled content." The exact mechanism (scrollHeight picking up unclipped bounds) was confirmed by Snippet 5's offender list.
- **User's timing clue — "the bug started when inspector got tall"** — locked the trigger condition unambiguously and validated the fix's scope (solve it at the html/body boundary, not inside the aside).
- **Progressive snippet narrowing** — each snippet answered a specific hypothesis, rather than dumping everything at once. Snippet 5 in the bug state (post-reproduction) was the only one that mattered for the final fix.

### What this means for future debugging

- **WKWebView + custom classic scrollbars + nested `overflow: auto` is a hazard pattern.** The scrollbar width adding to `100vw`/`100vh` when visible is the amplifier that turns any minor overflow into a visible scrollbar cascade. `overflow: hidden` on html/body is a hard break and should be the default for all shell-style desktop-web apps in this repo.
- **Any synchronous `setAll(values); callback()` pattern where `callback` reads from Zustand is a stale-closure trap.** The fix (read via `.getState()` inside the callback) generalises — any future callback that needs just-written Zustand state should follow the same pattern. Worth noting in ADR-0003 if the pattern recurs.
- **RHF's `defaultValues` is sticky at mount.** When external state (Zustand, props) needs to reset the form, use a remounting `key`, not an in-place `reset()` — especially with `mode: "onChange"` which makes reset-loop issues more likely.

Diagnostic probes were never written to source (this handoff has the snippets for future reference). All fixes carry inline comments at the change sites documenting the WHY.

---

## 12. S10 backlog items captured during S9 gate

Non-blocking observations from the gate walkthrough — do NOT address in S9; they're S10 (or later) scope. Captured here so they don't fall through the cracks.

### From gate step d (Compare against PVlayout_Advance)

PVlayout_Advance's summary surface includes data points we don't yet render. S9's spec is intentionally narrow (MWp / Tables / ICRs / plant area / used area / packing density + row pitch + tilt angle). S10 should expand SummaryPanel to include:

- **Module count** (derived in-app: `tables × modules_per_row × rows_per_table`). PVlayout_Advance shows 34216 for the phaseboundary2 fixture. Trivial to add — just an additional SummaryStat or PropertyRow.
- **String inverter count + kWp** — PVlayout_Advance shows 62 / 324.80. These are the S10 deliverable for inverters, so they'll materialise naturally when `placed_string_inverters` is wired through.
- **LA count** — PVlayout_Advance shows 22. S10 feature (LAs render + toggle).
- **AC capacity (MW) + DC/AC ratio** — PRO_PLUS-gated per SPIKE_PLAN.md §S10, so only when `availableFeatures` includes the appropriate key.

### From gate step j reflection (initial note before it was escalated to a fail)

A "Reset to defaults" affordance on the LayoutPanel is now unnecessary given the auto-reset behaviour implemented as Bug C's fix. Revisit only if users request the ability to carry params across projects.

### From general gate flow

**LayoutPanel form-interaction tests via RTL** remain the one known gap from the S9 plan (already noted in [`docs/gates/s09.md` §"Known gaps vs. S9 plan"](./s09.md)). Bug B (stale closure) and Bug C (form reset) are exactly the kind of issues RTL tests catch. Worth adding in S10 alongside the first form-interaction test for the inverter panel extensions.

