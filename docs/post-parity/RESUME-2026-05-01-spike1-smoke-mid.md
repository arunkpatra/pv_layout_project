# Resume prompt — Spike 1 mid-smoke + post-Path-B (2026-05-01)

Copy the block between `--- BEGIN PROMPT ---` markers as the first
message in the resumed session. Reads in ~3 minutes.

---

--- BEGIN PROMPT ---

# Resuming SolarLayout work — Spike 1 done; mid-Session-3 smoke

You're resuming a multi-day push. **Spike 1 (cable-compute perf + UX hygiene + trench relabel) is code-complete, all eight phases shipped + pushed to `main`. CI release pipeline (Path B) is shipped. We are now mid-smoke (Session 3 in `docs/post-parity/SMOKE-LOG.md`). One UI bug surfaced + got a robust fix landed live (S3-01b). We're awaiting empirical verification that the fix works, then continuing the smoke checklist from step 2.**

## Critical state

**Working dir:** `/Users/arunkpatra/codebase/pv_layout_project` (folder name unchanged; GitHub repo is `SolarLayout/solarlayout`).

**Branch:** `main`. HEAD `e169d6a`, up-to-date with `origin/main`.

**Recent commits (newest first):**
```
e169d6a fix(layout-panel): single sticky parent for tabs + Generate (S3-01b)
6aa932d fix(layout-panel): pin tabs row alongside the Generate button (S3-01)
0cb86a2 docs(smoke): Session 3 plan — Spike 1 verification
d3e9642 ci: add cargo + bun caches to desktop build workflows
c5d2345 ci+docs: canonical Tauri 2 deps; non-negotiable cite-before-proceed
ddc115b fix(ci): drop libappindicator3-dev from Linux deps (conflicts with ayatana)
f3e020e ci: full desktop release pipeline + RELEASE.md update
1dea1e7 docs(release): clarify §3.2 — migration step is unconditional
6fb3ebb docs: rewrite RELEASE.md for the merged repo + Tauri desktop app
f254f76 ci: wire smoke_parallel.sh into sidecar-build matrix
fd5e427 feat(cable): trench-vs-BoM relabel sweep across UI + exports
c940ef5 feat(layout): live per-plot progress + cancel + pre-flight chip
993194b feat(layout-panel): pinned Generate + collapsible sections
6ac296f feat(sidecar-client): job-table types + total_ac_cable_trench_m field
271f880 feat(cable): surface total_ac_cable_trench_m on LayoutResult
876cd73 feat(sidecar): async layout job table — POST/GET/DELETE /layout/jobs
3a0cca2 fix(sidecar): freeze_support() + explicit spawn context for bundled parallel
c9ecc9b docs: Day 4 cascade — root CLAUDE.md + ARCHITECTURE.md updated for merged repo
9979124 docs: end-of-day resume prompt — post-merge, Day 3 complete
58208b7 Merge pull request #3 from SolarLayout/post-parity-v1-desktop
```

**App + services state at compaction time:**
- Arun is running everything locally — mvp_api + mvp_web + mvp_admin started by user, Tauri started by user. Don't auto-start anything.
- Tauri dev was running with the S3-01b fix loaded via Vite HMR. User was about to verify the scroll-jitter fix empirically.

## What's pending — the immediate next step

**Verify S3-01b live.** Robust fix landed in commit `e169d6a`. The user needs to:
1. Confirm Tauri is still running (or relaunch via `cd apps/desktop && bun run tauri dev`).
2. Open a project (any KMZ).
3. Scroll the LayoutPanel form down.
4. Confirm: tabs row + Generate button BOTH stay pinned, NO scroll-up-then-stick jitter, no form text bleed-through under the band.

If verified clean → move to **Session 3 smoke step 2: collapsible-sections persistence** (collapse Module + Site, reload Tauri, verify those two stay collapsed).

If still buggy → root-cause again. The single-sticky-parent approach is the robust answer; if it's still broken there's another hidden CSS contribution.

## Session 3 smoke plan (full checklist)

Lives in `docs/post-parity/SMOKE-LOG.md` § Session 3, 14 steps:

1. ✅ **(S3-01 + S3-01b)** Pinned Generate + tabs sticky (in flight, awaiting empirical verify)
2. Collapsible sections + localStorage persistence
3. Single-plot KMZ (`tests/golden/kmz/phaseboundary2.kmz`) — no chip, sequential
4. Toggle relabel — "Calculate AC cable trench"
5. Multi-plot KMZ (`tests/golden/kmz/complex-plant-layout.kmz`) — chip + parallel + per-plot list
6. Cancel mid-run
7. Full multi-plot completion
8. SummaryPanel: BoM + trench rows
9. VisibilitySection toggle: "Show AC cable trench"
10. KMZ export — two-line summary block
11. PDF export — BoM + trench columns
12. DXF export — `AC_CABLE_TRENCH` layer
13. Tier downgrade (BASIC → cable_calc disabled)
14. Sidecar lifecycle on app close — **already verified live**

## Locked decisions during this session

**S3-01 → S3-01b chain (sticky tabs + Generate band):**
- First attempt was two independent sticky elements with `top-[58px]` on the pinned area. Hardcoded value-matching was fragile because `TabsContent` (`packages/ui-desktop/src/components/Tabs.tsx`) has a built-in `mt-[16px]` we didn't account for; natural Y was 75, sticky was 58, so 17px of pre-stick scroll.
- **Robust replacement (e169d6a):** single sticky parent containing TabsList + a forceMount TabsContent wrapping `PinnedActionArea`. Height self-determined; no measurement. Architecture:
  - `apps/desktop/src/state/layoutFormStatus.ts` — new Zustand slice mirrors RHF `hasErrors` + `enableCableCalc` up.
  - `apps/desktop/src/panels/LayoutPanel.tsx` — `PinnedActionArea` exported, no longer sticky, reads from slice. `<form id="layout-form">` + Generate button uses `form="layout-form"` HTML5 form-association so the button can live outside the form physically. `LayoutPanelProps` slimmed to `{ onGenerate }`.
  - `apps/desktop/src/App.tsx` — single sticky parent holds TabsList + `<TabsContent forceMount>` containing `<PinnedActionArea ... />` (gated to layout tab via Radix data-state hide).

**Cite-before-proceed (non-negotiable, codified in CLAUDE.md §2 + memory):**
- Triggered by claims with far-reaching effect / customer impact / deep-tech specifics. Required to fetch authoritative sources, cite URLs in chat, only THEN act.
- Established 2026-05-01 after the unsubstantiated "Windows is most-tested PyInstaller integration" claim and the Tauri Linux deps conflict (libappindicator3-dev vs libayatana-appindicator3-dev).
- Memory file: `feedback_verify_with_citations.md`.

**Smoke protocol (carried from earlier memory):**
- One check per prompt during smoke. Wait for response. Never bundle multiple checks into one numbered list.
- The Session 3 plan above is the FULL list, but it's a planning artifact — execution goes one at a time.

## Spike 1 phase summary (for context)

| Phase | Commit | What |
|---|---|---|
| 1 | `3a0cca2` | PyInstaller `freeze_support()` + explicit spawn for bundled parallel |
| 2 | `876cd73` | Async `/layout/jobs` endpoints (sidecar) |
| 3 | `271f880` | `total_ac_cable_trench_m` surfaced on LayoutResult |
| 4 | `6ac296f` | TS sidecar-client adapter |
| 5 | `993194b` | LayoutPanel pinned + collapsible sections |
| 6 | `c940ef5` | Pinned-area UI: progress, cancel, chip, expand |
| 7 | `fd5e427` | Trench-vs-BoM relabel sweep |
| 8 | `f254f76` | smoke_parallel.sh wired into matrix CI |

Plus Path B (CI release pipeline): `f3e020e` (3 platform workflows + extended release.yml) → `ddc115b` + `c5d2345` (Tauri Linux deps fixes) → `d3e9642` (cargo + bun caches).

## Quality gates at HEAD (e169d6a)

- `bun run lint` 8/8 ✅
- `bun run typecheck` 13/13 ✅
- `bun run test` 9/9 ✅
- `bun run build` 10/10 (last verified at d3e9642; e169d6a is React-only, very low regression risk)
- Sidecar pytest 127 passed + 7 skipped (last verified at fd5e427; no Python touched since)

## CI workflows now in place

- `ci.yml` — full gates on every push to main + PRs
- `sidecar-build.yml` — matrix bundle build for the sidecar (macos arm64 + macos x64 + ubuntu + windows), with `smoke_parallel.sh` on macOS + Linux
- `build-windows.yml` / `build-macos.yml` / `build-linux.yml` — Tauri installer builds, workflow_call + workflow_dispatch
- `release.yml` — tag-triggered orchestrator that calls the three build workflows + downloads + versions + sha256-checksums + creates a GitHub Release with all 6 assets
- `platform-deployment.yml` — manual workflow_dispatch for cloud (mvp_*) deploys

`docs/RELEASE.md` documents the full pipeline. `docs/post-parity/SMOKE-LOG.md` § Session 3 has the smoke plan + S3-01 + S3-01b observations.

## Standing by

Pick up at: **verify S3-01b empirically in the running Tauri dev app**. Then move to smoke step 2 (collapsible-section persistence). Bite-sized, one check per prompt.

If user says "re-cap status" or similar, point at this resume doc. If user wants to push to a tag and trigger the full Tauri release matrix → `git tag v0.0.1 && git push origin v0.0.1` per `docs/RELEASE.md` §4. (Note: the desktop `tauri.conf.json` version is still `0.0.0` — bump first if cutting a real prerelease.)

--- END PROMPT ---
