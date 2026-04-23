# S6 blocker — macOS window drag not working  *(HISTORICAL — resolved)*

**Written:** 2026-04-23
**Resolved:** 2026-04-24 — see §10 at bottom.
**Why this file exists:** S6 was mid-gate with a drag blocker. Four rounds of fixes failed. This file briefed the next session. The resolution is appended below; the original triage notes are preserved verbatim as history for anyone hitting similar Tauri 2 macOS chrome issues later.

**Read order for new session:**
1. `CLAUDE.md` (root) — project instructions, spike protocol.
2. `docs/ARCHITECTURE.md` §1–3 + §12.
3. `docs/SPIKE_PLAN.md` → S6 (In-Scope and Deliverables).
4. `docs/DESIGN_FOUNDATIONS.md` — design contract.
5. `docs/gates/s06.md` — what S6 built, known gaps, gate steps.
6. **This file.**

---

## 1. The bug

On macOS, clicking and dragging anywhere in the app's top bar does **not** move the window. Window is effectively locked in place. Traffic lights (close/min/max) still work.

**Expected:** dragging on empty top bar area (wordmark, breadcrumb text, "Pro" chip, empty space between them) moves the native macOS window, same as Claude Desktop / Finder / VSCode.

**User's physical verification:** tried, failed, on latest code.

---

## 2. Spike status

| Spike | Status |
|---|---|
| S0 through S5.5 | 🟢 passed |
| **S6** | 🟡 in progress, gate-blocked by this bug |

S6 shipped everything else:
- `packages/ui/` with 21 primitives + 10 compositions (all S6-spec components present).
- 8 solar-specific custom icons per DESIGN_FOUNDATIONS §9.
- Collapsible `ToolRail` + `Inspector` with named `sidebar-collapse` motion.
- Tauri native menu (File/Edit/View/Help) with accelerators and `menu:<id>` event forwarding.
- ThemeProvider + "Dark preview" label on the theme switcher.
- Command palette (cmdk) on ⌘K.
- Inter woff2 bundled (400/500/600).
- `import.meta.env.DEV`-gated FPS counter, units toggle (m/ft), zoom %, in status bar.
- Splash with minimum-display-duration so warm boots don't flash.
- Design-preview fallback (non-Tauri envs render the shell with mock values for headless screenshots).
- Screenshot harness at `docs/design/scripts/render-app.mjs` + output in `docs/design/rendered/app/`.
- **Visual parity with the S5.5 light mock (empty state) verified** via headless screenshots.
- `bun run typecheck` clean across 4 packages. `bun run build` clean. `cargo check` clean. Python `pytest` 33 passed / 6 skipped.

**Nothing except drag is open.** Do not rebuild what's already there.

---

## 3. What's been tried and has failed

All tried and physically tested. None worked.

### Round 1 — `titleBarStyle: "Overlay"` + bare data attribute
- `apps/desktop/src-tauri/tauri.conf.json`: `titleBarStyle: "Overlay"`, `hiddenTitle: false`, `decorations: true`.
- `<div data-tauri-drag-region>` on TopBar root and key child text/chip spans.
- **Result:** no drag. Also caused a doubled "SolarLayout" title because native titlebar was still visible.

### Round 2 — fix doubled title + React inline `-webkit-app-region`
- `hiddenTitle: true` (fixed title overlap — confirmed via screenshot).
- React inline style: `style={{ WebkitAppRegion: "drag" }}` on TopBar root, `{ WebkitAppRegion: "no-drag" }` on each interactive child.
- **Result:** title overlap fixed; drag still failed.

### Round 3 — canonical `data-tauri-drag-region` + global CSS rule (confirmed via Context7 against tauri-apps/tauri-docs)
- Kept the HTML attribute on text/spacer spans, removed it from buttons.
- Added to `packages/ui/src/globals.css`:
  ```css
  *[data-tauri-drag-region] {
    -webkit-app-region: drag;
    app-region: drag;
  }
  button, a, input, select, textarea,
  [role="button"], [role="menuitem"], [role="option"], [role="tab"] {
    -webkit-app-region: no-drag;
    app-region: no-drag;
  }
  ```
- **Verified** CSS makes it into the bundle: `grep "app-region" apps/desktop/dist/assets/index-*.css` returns both rules.
- **Result:** drag still failed.

### Round 4 — JS fallback via `getCurrentWindow().startDragging()`
- Added mousedown listener in `apps/desktop/src/App.tsx` (inside `useEffect`, Tauri-only).
- Checks: `e.buttons === 1`, `target.closest("[data-tauri-drag-region]")` present, target is not interactive, then calls `getCurrentWindow().startDragging()` (double-click toggles maximize).
- **Verified** typecheck + build clean. Restart-from-scratch of `bun run dev` tested.
- **Result:** drag still failed.

## 4. Observations worth acting on

The CSS bundle contains the correct rules. The JS handler compiles and is installed. User has done clean restarts. Ruled out:

- Stale Vite cache (full restart tested).
- Stale Rust binary (`tauri.conf.json` only changed once, restarts captured it).
- Tailwind v4 purging the raw CSS rules (grep confirms they survived).
- Title overlap (fixed, confirmed visually).

**Most likely root causes remaining — investigate these, don't re-try Round 1–4:**

1. **`titleBarStyle: "Overlay"` + Tauri 2 may have a specific known issue with drag regions on macOS.** Check the tauri-apps/tauri GitHub issues. Possibility: Overlay leaves macOS's own window-drag handling enabled in the titlebar area (above some Y pixel) but disables it elsewhere; our TopBar sits below that zone.

2. **Different approach to investigate first:** switch from `titleBarStyle: "Overlay"` to `decorations: false` + manual traffic-light positioning. That path has more Rust code (needs `ns_window().setTitlebarAppearsTransparent()` or equivalent) but is the approach shown in the Tauri 2 docs under "Creating a Custom Titlebar" (the entire section assumes `decorations: false`).

3. **Check whether `getCurrentWindow().startDragging()` is actually being called** when the user mousedowns on the top bar. Instrument with a `console.log("drag attempt", { target })` inside the handler and have the user open DevTools (right-click → Inspect, or cmd-opt-i if enabled) to confirm. If it's never firing, the event isn't reaching the window-level listener — possibly intercepted. If it fires and drag still doesn't happen, it's a Tauri-runtime issue.

4. **Verify `@tauri-apps/api/window`'s `getCurrentWindow()` returns a usable handle.** Dump it to console on app boot.

5. **Look at Tauri GitHub issues specifically:**
   - `titleBarStyle Overlay drag region macOS`
   - `data-tauri-drag-region not working macOS`
   - `app-region Overlay custom titlebar not draggable`
   - The Tauri plugin-window-state / decorum plugins — does drag need one of them enabled?

## 5. Explicitly do NOT do

- Do not re-add the CSS rule — it's there. Verify with `grep "app-region" apps/desktop/dist/assets/index-*.css`.
- Do not re-add the JS `startDragging()` listener — it's there at `apps/desktop/src/App.tsx` lines ~100–130 (look for the comment block "Window dragging.").
- Do not re-add `data-tauri-drag-region` attributes — they're already on TopBar text spans.
- Do not flip `hiddenTitle` — it's correctly `true`.
- Do not scope-creep into S7. S7 is license + entitlements; do not start it.

## 6. What's on disk — current file map

Relevant files to read before acting:

```
apps/desktop/
├── src/App.tsx                         ← JS drag fallback (lines ~100–130)
├── src/main.tsx                        ← Providers
├── src/main.css                        ← imports @solarlayout/ui globals
├── index.html                          ← stripped of inline styles
├── vite.config.ts                      ← Tailwind v4 plugin
├── package.json                        ← @solarlayout/ui dep + tailwindcss
├── src-tauri/
│   ├── tauri.conf.json                 ← titleBarStyle: "Overlay", hiddenTitle: true, decorations: true
│   ├── src/lib.rs                      ← sets menu via menu::build()
│   ├── src/menu.rs                     ← File/Edit/View/Help
│   └── src/sidecar.rs                  ← unchanged since S5

packages/ui/src/
├── globals.css                         ← *[data-tauri-drag-region] { app-region: drag } rule, lines ~115–140
├── tokens.css                          ← semantic tokens, unchanged from S5.5
├── fonts.css                           ← Inter @font-face
├── fonts/                              ← Inter woff2 × 3 weights
├── lib/cn.ts                           ← clsx+twMerge
├── lib/motion.ts                       ← named motion variants
├── components/                         ← 21 primitives
│   ├── Button.tsx  IconButton.tsx  Kbd.tsx  Chip.tsx  Badge.tsx
│   ├── Icon.tsx  SolarIcons.tsx  Separator.tsx  Card.tsx
│   ├── Input.tsx  NumberInput.tsx  Label.tsx  Select.tsx
│   ├── Segmented.tsx  Switch.tsx  Slider.tsx  Tabs.tsx
│   ├── Tooltip.tsx  Dialog.tsx  Sheet.tsx  Popover.tsx
│   ├── DropdownMenu.tsx  CommandPalette.tsx  Toast.tsx
└── compositions/
    ├── AppShell.tsx                    ← collapsible rails via framer-motion
    ├── TopBar.tsx                      ← has data-tauri-drag-region on text spans
    ├── ToolRail.tsx  Inspector.tsx  StatusBar.tsx  MapCanvas.tsx
    ├── Splash.tsx  EmptyState.tsx  ThemeProvider.tsx
└── index.ts                            ← barrel

docs/
├── DESIGN_FOUNDATIONS.md               ← normative
├── SPIKE_PLAN.md                       ← S6 spec
├── gates/
│   ├── STATUS.md                       ← S6 row = 🟡 in progress
│   ├── s06.md                          ← gate memo with expected run/expect blocks
│   ├── s05_5.md  s00.md … s05.md       ← prior gates
│   └── S6_DRAG_BUG_HANDOFF.md          ← this file
├── design/
│   ├── tokens/  light/  rendered/      ← S5.5 mocks (frozen)
│   └── scripts/
│       ├── render-mocks.mjs            ← S5.5 mock renderer
│       └── render-app.mjs              ← S6 live shell renderer (Playwright)
```

## 7. Git state

```
Current branch: main
Latest commit:  3c432bd docs: mark SESSION_HANDOFF.md as historical
Prior commit:   1e12b1b s05_5: design foundations + light mocks (TAG v0.0.6-s05_5)

Uncommitted on disk (all S6 work, not yet committed):
  M apps/desktop/index.html
  M apps/desktop/package.json
  M apps/desktop/src-tauri/src/lib.rs
  M apps/desktop/src-tauri/tauri.conf.json
  M apps/desktop/src/App.tsx
  M apps/desktop/src/main.tsx
  M apps/desktop/vite.config.ts
  M bun.lock
  M docs/design/package.json
  M docs/gates/STATUS.md
  M packages/ui/package.json
  ?? apps/desktop/src-tauri/src/menu.rs
  ?? apps/desktop/src/main.css
  ?? docs/design/rendered/app/
  ?? docs/design/scripts/render-app.mjs
  ?? docs/gates/s06.md
  ?? docs/gates/S6_DRAG_BUG_HANDOFF.md    (this file)
  ?? packages/ui/src/
  ?? packages/ui/tsconfig.json
```

**Do not commit** until drag is fixed and S6 gate passes. S6 closing commit should be one atomic commit, per spike protocol.

## 8. Verification commands after your fix

Baseline commands. Re-run per `docs/gates/s06.md` gate steps 1–8 to confirm no regressions:

```bash
. "$HOME/.cargo/env"
cd /Users/arunkpatra/codebase/pv_layout_project

# Static gates
bun run typecheck && bun run build
cd python/pvlayout_engine && uv run pytest tests/ -q && cd ../..
# Expect: 6 typecheck / 4 build green; 33 passed, 6 skipped.

# Headless shell screenshot (no Tauri)
cd docs/design && bun run render:app && cd ../..
# Expect: docs/design/rendered/app/{shell-light,shell-dark,shell-light-cmdk}.png

# The actual drag test — native Tauri, physical verification
cd apps/desktop && bun run dev
# Verify:
#   a. Splash visible ~900ms, then full shell
#   b. No doubled "SolarLayout" text
#   c. Click and DRAG from anywhere in the top bar strip NOT on a button:
#      - wordmark SolarLayout text
#      - breadcrumb "No project open" text
#      - Pro chip
#      - empty space between breadcrumb and ⌘K button
#      → window moves smoothly with the cursor
#   d. ⌘K still opens command palette
#   e. Buttons (rail toggle, inspector toggle, AP avatar) still click
#   f. Close window → sidecar dies within 1s
```

If native drag now works AND the other S6 gate steps in `docs/gates/s06.md` also pass, the path to closing S6 is:

1. Mark `docs/gates/STATUS.md` S6 row 🟢.
2. Commit: `s06: design system + shell (light polished)`.
3. Tag: `v0.0.7-s6`.
4. Hand off to user: "S6 passed, ready for S7".

## 9. User's working style (reminders)

- Precise about scope. Corrects misstatements; track the plan faithfully.
- Runs every gate physically. Will copy-paste output back.
- Prefers opinionated defaults over open-ended questions.
- Prefers automation. Does NOT want narrated deliberation — keep updates tight.
- Gate handoffs in the structured "What to run / Summary / Heads-up" format; commands grounded in SPIKE_PLAN.md.

---

**End of handoff. New session: read top to bottom, then start by deciding which of §4's five hypotheses to investigate first. Do not repeat Round 1–4 fixes from §3.**

---

## 10. Resolution (2026-04-24)

### Root cause

Hypothesis §4.1 was correct — but the specific mechanism was a missing **Tauri 2 ACL permission**, not a macOS Overlay-mode quirk. Tauri 2 `core:window:default` (bundled under `core:default` in [`capabilities/default.json`](../../apps/desktop/src-tauri/capabilities/default.json)) does **not** include `allow-start-dragging`. Per the [core permissions reference](https://v2.tauri.app/reference/acl/core-permissions/), the default window set is read-only introspection; any mutating operation, including `startDragging`, is opt-in.

That single gap explains all four prior rounds uniformly:

- **Round 3** (HTML attribute + CSS `app-region` rule) — Tauri's injected webview handler does read the `data-tauri-drag-region` attribute, and on mousedown calls the internal `startDragging` command. That command failed the ACL check silently.
- **Round 4** (JS `getCurrentWindow().startDragging()` fallback) — same IPC command, same ACL check, same silent failure.

`titleBarStyle: "Overlay"` was a red herring — [tauri-apps/tauri#9503](https://github.com/tauri-apps/tauri/issues/9503) describes a real but narrower Overlay-mode issue that only manifests when the window is unfocused. Focused-window drag works fine in Overlay mode once the ACL permission is present.

### Fix

One line in [`capabilities/default.json`](../../apps/desktop/src-tauri/capabilities/default.json):

```json
"core:window:allow-start-dragging"
```

### Closing cleanup (tech-debt removed)

The Round 3 and Round 4 workarounds were redundant once the ACL landed. In the S6-closing pass we removed:

- The `*[data-tauri-drag-region] { app-region: drag }` + `button, a, input, … { app-region: no-drag }` CSS block from `packages/ui/src/globals.css`. Electron-era pattern; Tauri 2's injected handler reads the HTML attribute, not CSS properties. Dead code.
- The `useEffect` mousedown listener and `getCurrentWindow().startDragging()` fallback in `apps/desktop/src/App.tsx`. Duplicated what Tauri's injected handler already does.

What ships:

- `data-tauri-drag-region` on the TopBar root + text spans in [`packages/ui/src/compositions/TopBar.tsx`](../../packages/ui/src/compositions/TopBar.tsx). Tauri's native handler does the rest.
- `core:window:allow-start-dragging` in capabilities.
- `titleBarStyle: "Overlay"` + `hiddenTitle: true` kept (unrelated to drag; justified in [s06.md](./s06.md) deviation note).

### Secondary defect uncovered during the same gate run

While verifying drag, the §4g status-bar `m`/`ft` segmented toggle didn't visibly flip. Investigation via Playwright against the live dev server revealed a CSS **cascade-layer bug**: the base reset in `globals.css` was unlayered, and unlayered declarations beat any declaration inside `@layer` regardless of specificity. Tailwind v4 emits utilities into `@layer utilities`, so every `bg-[var(…)]` / `text-[var(…)]` on every button in the app was silently overridden.

Fix: wrapped the base reset in `@layer base { … }`. Covered in the main [s06.md](./s06.md) gate memo.

### Lessons

- In Tauri 2, ALWAYS enumerate ACL permissions explicitly. A missing permission produces a silent IPC rejection with no console error and no visible failure mode — easy to mistake for a native platform bug.
- When a "belt-and-braces" workaround ALSO fails, the common cause is probably below both layers (here: the IPC itself, not the invoking code).
- CSS cascade layers matter. Any "reset" that doesn't live in `@layer base` will override utilities it was never meant to fight with.
