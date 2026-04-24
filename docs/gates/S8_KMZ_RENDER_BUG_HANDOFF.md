# S8 blocker — KMZ parses successfully but MapLibre doesn't render the overlay  *(HISTORICAL — resolved)*

**Written:** 2026-04-24
**Resolved:** 2026-04-24 — see §10 at bottom.
**Why this file exists:** S8 was mid-gate with a MapLibre-render blocker — every deliverable passed except the boundary/obstacles/TL lines rendering after a successful parse. Three rounds of speculative fixes had failed to produce a visible overlay. This file briefed the fresh session so it could debug from a clean state without repeating what had been tried. The resolution is appended below (§10); the original triage notes (§§1–9) are preserved verbatim as history for anyone hitting similar Tauri 2 WKWebView + CSS cascade-layer issues later.

**Read order for the new session:**

1. `CLAUDE.md` (root) — project instructions, spike protocol, working agreements.
2. `docs/ARCHITECTURE.md` §1–3 + §12.
3. `docs/SPIKE_PLAN.md` → S8 entry (In-Scope and Deliverables).
4. `docs/adr/0002-no-basemap.md` — design contract for the MapLibre style.
5. `docs/gates/s08.md` — what S8 built, known gaps, gate steps.
6. **This file.**

---

## 1. The bug

The user opens a KMZ (via ⌘O / File menu / palette / empty-state button). The flow reaches the sidecar and `/parse-kmz` returns successfully. Evidence:

- **Top-bar breadcrumb updates** to the filename (e.g. `SolarLayout / kudlugi.kmz`).
- **Status-bar left-meta updates** to `"1 boundary · 2 obstacles"` (or equivalent counts for the KMZ in question).
- **No visible error in the UI.**

What **does not happen** (all of these are deliverables per [SPIKE_PLAN.md](../SPIKE_PLAN.md) § S8):

- **No "Parsing KMZ…" overlay flash.** Either the parse is too fast to notice, OR the `opening` state never toggles to true, OR the overlay is behind the MapLibre canvas.
- **No `fitBounds` animation.** The viewport stays at whatever MapLibre showed before the KMZ was picked — typically the default world view (zoom 1, center `[0, 0]`).
- **No boundary polygon visible.** No hairline dark stroke, no faint fill.
- **No obstacles or TL lines visible.**

Scale bar renders (since S8 init), so MapLibre itself IS mounted and rendering. Just the KMZ overlay isn't appearing.

User tested in **dev mode** (`bun run dev`) and specifically said it failed. Not yet re-tested in release after round 3.

---

## 2. Spike status

| Spike | Status |
|---|---|
| S0 → S7 | 🟢 passed (tags: `v0.0.0-s0` … `v0.0.8-s7`) |
| **S8** | 🟡 in progress, gate-blocked by this bug |

S8 shipped everything else:

- `@solarlayout/sidecar-client` gained `parseKmz(file)` + `ParsedKMZ` types (parse works — confirmed by the status-bar count).
- `MapCanvas` rewritten with real `maplibre-gl` — a scale bar is visible bottom-left (so MapLibre initialises and renders).
- `pv-light.json` and `pv-dark.json` authored under `apps/desktop/public/map-styles/` with six overlay layers each. Console is clean (no style-validation errors after round 2).
- Tauri plugins wired: `tauri-plugin-dialog`, `tauri-plugin-fs` with scoped read permissions.
- `App.tsx` owns `project` state + `projectGeoJson` memo; four open-KMZ entry points wired.
- ADR 0002 accepted, SPIKE_PLAN / ARCHITECTURE / CLAUDE updated, s08.md gate memo written, STATUS flipped to 🟡.

**Only rendering is open.** Do not rebuild the rest.

---

## 3. What's been tried and has failed

### Round 1 — Initial MapCanvas rewrite with MapLibre
- Wrote `MapCanvas.tsx` using `maplibregl.Map`, pre-declared GeoJSON sources in the style JSON, `hydrateSources` on prop change via `useEffect`, `fitToBoundariesIfNew` guard, `ScaleControl`, theme swap via `setStyle`.
- **Result:** MapLibre canvas renders, scale bar visible, but no boundary overlay when a KMZ loaded. DevTools showed MapLibre style validation errors.

### Round 2 — Fix MapLibre style validation + skip theme-swap on initial mount
- Moved `line-join` / `line-cap` from `paint` to `layout` in both style JSONs (they're **layout** properties per the MapLibre Style Spec).
- Gated the theme-swap `useEffect([styleUrl])` with an `initialStyleUrl` ref so it only fires on *subsequent* changes — on initial mount the init effect already loads the correct style, so re-calling `setStyle` was producing "Unable to perform style diff" warnings and double-loading.
- **Result:** Console clean — zero errors, zero warnings on a Playwright-against-vite-preview check. But the user's physical test in Tauri still showed no boundary overlay.

### Round 3 — Fix menu event name + MapLibre timing race (`mapReady` state + `propsRef`)
- **Menu event**: Tauri 2's event-name validator rejects `.` (allowed chars: alphanumerics, `-`, `/`, `:`, `_`). The Rust side was emitting `menu:file.open_kmz`, and `listen()` rejected it with "invalid args" — 5 instances in DevTools console. Translated `.` → `/` at the Rust emit boundary ([`src-tauri/src/menu.rs`](../../apps/desktop/src-tauri/src/menu.rs) `wire_events`), React listens to `menu:file/open_kmz`.
- **Race**: suspected the `useEffect([props])` data-update was firing BEFORE `map.on("load")` fired, with the original `!map.isStyleLoaded()` guard bailing silently. Replaced with a proper `mapReady` state + `propsRef` pattern so the `load` handler hydrates from refs (fresh data) and the effect gates on `mapReady`.
- **Result:** User ran again, no improvement. Same state as end of round 2 — parse works, breadcrumb + status update, no overlay, no fitBounds.

---

## 4. Observations worth acting on

The bug survives every plausible timing-race fix. That points away from timing and toward one of:

1. **`hydrateSources` is being called with empty FeatureCollections**, because `kmzToGeoJson` silently filters the user's boundary out. The `closeRing` guard in [`apps/desktop/src/project/kmzToGeoJson.ts`](../../apps/desktop/src/project/kmzToGeoJson.ts) requires `ring.length >= 4`; the status-bar counts use `countKmzFeatures` which counts **`parsed.boundaries.length`** directly (unrelated to the ring check). So the count can show 1 while the GeoJSON feature array is empty.

   **Verify first.** Drop a `console.log` inside `kmzToGeoJson` printing `boundaries.features.length` before return. If it's 0, the bug is in the conversion, not in MapCanvas at all. The `>= 4` filter is probably the culprit — `>= 3` would be more lenient (some KMZ parsers emit already-closed rings of `[A, B, C, A]` length 4, which passes; but a malformed short ring could fall through).

2. **`map.getSource("kmz-boundaries")` returns `undefined`**, because the style file's sources dict hasn't loaded yet. The `mapReady` state should fix this — but confirm by logging inside `hydrateSources` whether `src` is `undefined`.

3. **The map IS rendering the data but `fitBounds` isn't firing**, so the boundary is at sub-pixel size at zoom 1. Confirm by logging inside `fitToBoundariesIfNew` whether the guard clauses (`boundaries.features.length === 0` or `lastKey.current === key`) short-circuit. Manually calling `map.fitBounds([[73, 12], [74, 13]])` from DevTools should force a zoom-in; if that works, the issue is definitely in the fit path, not in the render path.

4. **`bounds[0]` and `bounds[1]` are swapped.** MapLibre's `fitBounds` takes `[[west, south], [east, north]]` = `[[minLon, minLat], [maxLon, maxLat]]`. `computeBounds` returns `[minLon, minLat, maxLon, maxLat]`. The passing `[[bounds[0], bounds[1]], [bounds[2], bounds[3]]]` is correct — `[[minLon, minLat], [maxLon, maxLat]]`. Probably fine, but double-check.

5. **Strict Mode double-mount is destroying the first MapLibre instance and creating a second one**, but the FIRST instance's `map.on("load")` fires after the first map is already destroyed. The second map's load never calls our handler if the effect body captured the first map reference wrong. This feels less likely given the scale bar renders, but worth checking by logging inside the init effect which `map` instance is "live" at each step.

6. **Tauri-specific `cross-origin` issue** on loading `/map-styles/pv-light.json`. In Tauri 2, the app is served from a custom scheme (`tauri://localhost/` or similar). A relative URL `/map-styles/pv-light.json` might resolve differently in Tauri vs vite dev. **Quick test**: in DevTools Network tab, confirm the style JSON loads with 200 OK when running under Tauri dev. If it 404s, the path resolution is the bug.

7. **MapLibre container has zero size** because Tailwind's `w-full h-full` on the inner `<div ref={containerRef} className="absolute inset-0" />` doesn't resolve to a real pixel size. MapLibre silently renders into a 0×0 canvas. **Quick test**: in DevTools, inspect the `.maplibregl-map` element; it should have non-zero `clientWidth` and `clientHeight`. If zero, `flex: 1 min-h-0` on an AppShell ancestor might not be propagating height.

8. **The user is testing with a specific KMZ that has atypical structure** — e.g. only obstacles, no outer boundary; or coordinates in a non-standard order (lat, lon instead of lon, lat). Would need to verify against one of the golden KMZs in [`python/pvlayout_engine/tests/golden/`](../../python/pvlayout_engine/tests/golden/) to rule out.

**Most likely root cause (personal priors):** **#1** — `kmzToGeoJson`'s `>= 4` filter or the `closeRing` logic is silently stripping the user's boundary. Status-bar count survives because it uses a different code path. Start there.

---

## 5. Explicitly do NOT do

- Do not re-move `line-join`/`line-cap` — they're already in `layout`. `apps/desktop/public/map-styles/pv-{light,dark}.json`.
- Do not re-gate the theme-swap effect — it already has the `initialStyleUrl` ref guard.
- Do not re-add the `mapReady` state or `propsRef` — they're in MapCanvas already.
- Do not change the menu event name — the `.` → `/` translation is already in [`menu.rs`](../../apps/desktop/src-tauri/src/menu.rs) `wire_events`.
- Do not rewrite `MapCanvas` from scratch. Diagnose what's actually happening first; only rewrite if the diagnosis proves the current shape fundamentally wrong.
- Do not scope-creep into S9. S9 is input panel + Generate Layout; do not start it.

---

## 6. What's on disk — current file map

Relevant files:

```
apps/desktop/
├── public/map-styles/
│   ├── pv-light.json                ← overlay style; 6 layers; no basemap
│   └── pv-dark.json                 ← draft overlay style (dark tokens)
├── src/
│   ├── App.tsx                      ← project state + handleOpenKmz + 4 entry points
│   └── project/
│       ├── kmzLoader.ts             ← dialog + fs + sidecar.parseKmz
│       └── kmzToGeoJson.ts          ← ParsedKMZ → 3 FeatureCollections (suspect #1)
├── src-tauri/
│   ├── Cargo.toml                   ← tauri-plugin-dialog, tauri-plugin-fs
│   ├── src/
│   │   ├── lib.rs                   ← both plugins init'd
│   │   ├── menu.rs                  ← emit uses id.replace('.', "/")
│   │   └── keyring.rs               ← unchanged from S7
│   └── capabilities/default.json    ← dialog:default, fs:allow-read-file scoped

packages/
├── sidecar-client/src/index.ts      ← parseKmz + ParsedKMZ types (works — confirmed)
├── ui/
│   ├── package.json                 ← maplibre-gl + @types/geojson as peer/dev deps
│   └── src/compositions/
│       ├── MapCanvas.tsx            ← primary suspect component
│       └── EmptyState.tsx           ← now has onOpen prop

docs/
├── adr/0002-no-basemap.md           ← ADR; canvas-first, no tile sources
└── gates/
    ├── STATUS.md                    ← S8 🟡
    ├── s08.md                       ← gate memo
    └── S8_KMZ_RENDER_BUG_HANDOFF.md ← this file
```

---

## 7. Git state

```
Current branch: main
Latest commit:  f561b39 (tag: v0.0.8-s7) s07: license key + entitlements + feature gating

Uncommitted S8 work on disk (not yet committed):
  M CLAUDE.md
  M apps/desktop/package.json
  M apps/desktop/src-tauri/Cargo.{lock,toml}
  M apps/desktop/src-tauri/capabilities/default.json
  M apps/desktop/src-tauri/gen/schemas/*.json          (auto-generated; commit)
  M apps/desktop/src-tauri/src/{lib,menu}.rs
  M apps/desktop/src/App.tsx
  M bun.lock
  M docs/ARCHITECTURE.md
  M docs/SPIKE_PLAN.md
  M docs/adr/README.md
  M docs/design/rendered/app/*.png                     (screenshots post-S7)
  M docs/gates/STATUS.md
  M packages/sidecar-client/src/index.ts
  M packages/ui/package.json
  M packages/ui/src/compositions/{EmptyState,MapCanvas}.tsx
  ?? apps/desktop/public/map-styles/
  ?? apps/desktop/src/project/
  ?? docs/adr/0002-no-basemap.md
  ?? docs/gates/s08.md
  ?? docs/gates/S8_KMZ_RENDER_BUG_HANDOFF.md           (this file)
```

**Do not commit** until the bug is fixed and the S8 gate passes. S8 closing commit should be one atomic commit, per spike protocol.

Remote on `origin/main` is at the S7 commit (`f561b39`) per the user's safety-net push. Local is unchanged in its commits.

---

## 8. Diagnostic approach for the new session

Before writing any fix:

1. **Read `apps/desktop/src/project/kmzToGeoJson.ts` end-to-end.** Verify the `closeRing` logic and the `>= 4` filter against a known-good KMZ shape.

2. **Reproduce headlessly** via Playwright against `bun run vite:dev`. In preview mode the app has a mocked entitlements flow but `handleOpenKmz` is no-op'd (because `!inTauri()`). So you'd need either:
   - A Tauri dev run + browser DevTools logged into the Tauri window.
   - A quick unit test for `kmzToGeoJson` with a hardcoded `ParsedKMZ` sample — this rules in/out conversion bugs without needing Tauri.

   **The unit test is the fastest diagnostic path.** Add one tomorrow.

3. **If conversion looks correct**, add `console.log` probes in MapCanvas:
   - Inside `hydrateSources` before `setSource`: log `id`, `src` (truthy?), `data.features.length`.
   - Inside `fitToBoundariesIfNew`: log `boundaries.features.length`, computed `bounds`, `lastKey`.
   - Inside the init effect's `map.on("load")`: log propsRef contents and mapReady transition.
   - Inside the data-update useEffect: log `mapReady` and the three prop FC lengths.

4. **Have the user open DevTools** (right-click → Inspect in Tauri dev) and paste the full console after loading a KMZ. That transcript will narrow the bug to one of the hypotheses in §4.

5. **If MapLibre is reporting data correctly but nothing visible** — check `map.getStyle().layers` for all 6 layers + their `visibility`, and inspect `.maplibregl-map` element dimensions.

6. **If style JSON isn't loading** — DevTools Network tab shows the XHR / fetch. Failure here (404 / CORS / scheme mismatch) would explain everything.

---

## 9. Verification after the fix

Baseline commands — re-run per [`docs/gates/s08.md`](./s08.md) gate steps 1–6 to confirm no regressions:

```bash
. "$HOME/.cargo/env"
cd /Users/arunkpatra/codebase/pv_layout_project

# Static gates
bun run lint && bun run typecheck && bun run build
cd python/pvlayout_engine && uv run pytest tests/ -q && cd ../..
cd packages/entitlements-client && bun test && cd ../..
# Expect: 7 typecheck / 4 build / 42 pytests / 14 bun tests.

# Headless preview — MapLibre canvas renders with no KMZ (no regressions)
cd docs/design && bun run render:app && cd ../..

# Native dev — the bug-fix target
cd apps/desktop && bun run dev
# Verify:
#   a. ⌘O opens native file dialog filtered for kmz/kml.
#   b. On pick: brief "Parsing KMZ…" overlay flashes over the canvas.
#   c. Overlay dismisses; MapLibre animates a fitBounds to the site.
#   d. Boundary polygon(s) visible in hairline dark stroke + faint fill.
#   e. Obstacles visible in mid-grey; line obstructions dashed red.
#   f. Top-bar breadcrumb reads "<filename>.kmz".
#   g. Status bar reads "N boundary · M obstacle" (real counts).
#   h. Pan/zoom smooth; scale bar updates.
#   i. Theme swap preserves viewport and re-hydrates data.
#   j. Second KMZ replaces cleanly with a fresh fitBounds.
#   k. DevTools console: zero errors, zero warnings.

# Release build round-trip
cd apps/desktop && bun run tauri:build && cd ../..
open apps/desktop/src-tauri/target/release/bundle/macos/SolarLayout.app
# Repeat a-k above.

# Close → Activity Monitor: no pvlayout-engine within 1s.
```

If the fix lands AND all other §2–§8 S8 gate steps (in `docs/gates/s08.md`) also pass, path to closing S8 is:

1. Remove/simplify the diagnostic `console.log` probes.
2. Mark `docs/gates/STATUS.md` S8 row 🟢; update `docs/gates/s08.md` Status → Passed.
3. (Optional) append a §10 "Resolution" section to this file, mirror of how `S6_DRAG_BUG_HANDOFF.md` was closed.
4. Commit: `s08: KMZ load + MapLibre canvas (light vector style)`.
5. Tag: `v0.0.9-s8`.
6. Hand off: "S8 passed, ready for S9."

---

## 10. User's working style (reminders)

- Precise about scope. Corrects misstatements; track the plan faithfully.
- Runs every physical gate. Will copy-paste output / screenshots back.
- Prefers opinionated defaults over open questions.
- Prefers automation. Does NOT want narrated deliberation — keep updates tight.
- Terse gate handoffs in the "What to run / Summary / Heads-up" format; commands grounded in SPIKE_PLAN.md.
- Has pushed `main` to `origin` as of S7's close (`f561b39`). All S8 work is **local only**.

---

**End of handoff. New session: read top to bottom, then start by investigating §4.1 (empty FeatureCollections from `kmzToGeoJson`). Do not repeat Rounds 1–3 from §3.**

---

## 10. Resolution (2026-04-24)

S8 passed. Two distinct bugs were found and fixed via diagnostic-driven debugging — none of the eight hypotheses in §4 were the actual root cause; the §4 ranking was based on the wrong mental model.

### Bug A — canvas collapsed to 300px tall (the "no boundary visible" bug)

**Hypothesis #1 was refuted first.** A standalone Node test against `phaseboundary2.kmz` (the exact KMZ behind the "1 boundary · 2 obstacles" status-bar count) confirmed `kmzToGeoJson` produced 1 boundary feature with a 72-vertex closed ring + 2 obstacles + 1 line — all FeatureCollections non-empty, all geometries well-formed. The conversion was never the problem.

**Diagnostic console probes** (added to `MapCanvas.tsx` + `App.tsx` per §8.3) then proved that every step of the data path was working: `setSource` reported `srcFound: true, featuresLen: 1/2/1`, `fitToBoundariesIfNew` was called with correct bounds (`[81.485, 21.708, 81.494, 21.715]`), and `queryRenderedFeatures` returned 2 boundary features post-`moveend`. The MapLibre camera animated to the correct center+zoom (`[81.49, 21.71]`, zoom 14). The boundary WAS being rendered — just into a 1068×**300** canvas instead of the full 1068×828 main slot.

**Root cause: a CSS Cascade Layers conflict.** MapLibre's `.maplibregl-map` rule (which the library adds to the container element on `new maplibregl.Map({container})`) ships unlayered:

```css
.maplibregl-map { ... position: relative; ... }   /* unlayered */
@layer utilities {
  .absolute { position: absolute }                 /* layered */
}
```

Per the CSS Cascade Layers spec, **unlayered styles beat layered styles at equal specificity**. So MapLibre's `position: relative` overrode our intended `.absolute { position: absolute }` from the container's Tailwind class. With `position: relative`, the `.inset-0` utility became a no-op (no positional offsets on a non-absolute element), the container collapsed to its content height (the absolute-positioned canvas), and MapLibre's measurement loop locked the canvas to ~300px (effectively the HTML5 default canvas width re-used as a height fallback when measuring an empty container).

**Fix:** `packages/ui/src/compositions/MapCanvas.tsx` — change the container's className from `"absolute inset-0"` to `"w-full h-full"`. This sidesteps the cascade entirely: MapLibre's `position: relative` is fine when the box has explicit width/height from the layered `w-full h-full` utilities (which MapLibre's stylesheet doesn't override). A long inline comment documents the WHY so a future reader doesn't "fix" it back.

**Confirmation:** post-fix probe showed `canvas client wxh: 1068 x 828`, boundary visibly rendered with the expected dark hairline + faint fill.

### Bug B — theme swap stuck after first toggle (the "white background never changes" bug)

Surfaced during gate run a-k after Bug A was fixed. For users whose OS started in dark mode, the first light/dark toggle would work but every subsequent attempt to return to the original theme silently no-op'd.

**Root cause: a stale-ref guard in the theme-swap effect.** Round 2 of the original debugging added `const initialStyleUrl = useRef(styleUrl)` and `if (styleUrl === initialStyleUrl.current) return` to skip the redundant `setStyle` call on initial mount. But `initialStyleUrl.current` is captured at first render and never updated, so the guard ALSO skipped any later transition back to the initial value:

- OS dark at startup → initial styleUrl = dark.
- Click 1 (light): `light !== dark` → `setStyle(light)` ✓.
- Click 2 (dark): `dark === dark` (the *initial*) → **early return** ✗. Map stuck on light.

The §5 "do not re-gate the theme-swap effect" directive was based on the assumption that the existing guard was correct. It wasn't.

**Fix:** `packages/ui/src/compositions/MapCanvas.tsx` — rename `initialStyleUrl` to `lastAppliedStyleUrl`, and add `lastAppliedStyleUrl.current = styleUrl` after `map.setStyle(styleUrl)`. Two-line change. Preserves StrictMode safety (initial value matches itself, so the very first effect run is still a safe no-op) but tracks the actual applied URL on every subsequent toggle.

### What worked, methodologically

- **Refuting hypothesis #1 with real data first** stopped the next round of guessing in its tracks. The Python core's `parse_kmz` was invoked in `uv run`, the JSON was dumped to disk, and `bunx tsx` ran `kmzToGeoJson` against it — 30 seconds of instrumentation eliminated 30 minutes of speculation.
- **The diagnostic probe suite** (init effect, `map.on("error")`, load handler, `setSource`, `fitToBoundariesIfNew`, data effect, `handleOpenKmz`) caught what blind fixing missed: the data path was 100% correct. Without the probes there was no path to root cause.
- **Exposing `window.__map__`** in the load handler let the user run `__map__.getCanvas().clientWidth + "x" + __map__.getCanvas().clientHeight` from DevTools — the "668x300" return value was the smoking gun.
- **Inspecting compiled CSS** (`grep -E "@layer|maplibregl-map|^\.absolute" dist/assets/index-*.css`) confirmed the cascade layer order in 1 second and validated the hypothesis statically before applying the fix.

### What this means for future debugging

- **Never trust a fix that ships without a test for the failure mode.** Both bugs were "guard logic added for a real reason but with a subtle invariant error." Round 1's silent `if (!src) return` masked the cascade-layer bug for three rounds; round 2's `initialStyleUrl` ref was a half-correct fix to a real problem (duplicate `setStyle` on mount) that introduced bug B.
- **Third-party stylesheets imported via TS (`import "x.css"`) are unlayered.** Any Tailwind utility that conflicts with them at equal specificity LOSES. Worth a global note in `docs/ARCHITECTURE.md` §12 — flagged for S13.5 polish.
- **In Tauri's WKWebView, the Network tab silently drops some custom-protocol fetches.** "No hit on /map-styles/pv-light.json" looked like evidence the style 404'd, but the load event firing + sources being registered proved the file did load — Network just didn't show it. Trust the runtime evidence (event handlers, `getSource`), not the Network tab, for Tauri assets.

Diagnostic probes were stripped before commit. Final `MapCanvas.tsx` carries inline comments at both fix sites.
