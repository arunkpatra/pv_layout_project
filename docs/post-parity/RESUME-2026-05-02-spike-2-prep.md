# Resume prompt — 2026-05-02, post-E1, awaiting complex-plant capture

Copy the block between `--- BEGIN PROMPT ---` markers as the first
message in the resumed session. Reads in ~3 minutes.

---

--- BEGIN PROMPT ---

# Resuming SolarLayout — E1 done, complex-plant capture running overnight, B27 next

You're picking up after a long Session-3-smoke + E1 day. **All scoped work for today
is done and pushed.** Two threads are open: a background legacy capture that should
land overnight, and B27 (refund-policy decision memo) tomorrow.

## Critical state

**Working dir:** `/Users/arunkpatra/codebase/pv_layout_project`. **Branch:** `main`.

**Recent commits (newest first, all pushed unless noted):**
```
79aa8df docs(smoke): log S3-06 — cable_calc=false runs are partial deliverables   ← may be ahead of origin
06609aa fix(dxf): persist extents through saveas — set msp.dxf.extmin first
07eb0fa plan(exports): E3 — PDF page 1 server-side layout figure
6ec58ad fix(dxf): write valid extents + set modelspace viewport on export
7728b3f fix(pdf): skip page 1 when layout_figure is None — drop misleading copy
3748c0b fix(tauri): grant fs:allow-write-file + shell:allow-open paths for E1
a417a41 feat(layout-panel): E1 — KMZ / PDF / DXF export buttons
```

Run `git log --oneline origin/main..HEAD` to confirm what's ahead of remote.

## Background process — DO NOT KILL

`PID 65484` running `capture_legacy_baseline.py --plant complex-plant-layout` against
`/Users/arunkpatra/codebase/PVlayout_Advance` at branch `baseline-v1-20260429`. Started
2026-05-01 18:43; was at 1h 46m / 99.6% CPU when last checked. **Expected to run
for hours** (maybe overnight). Arun has explicitly authorized this — quote:
*"i will let the darn script kept running and burning my computer overnight. I want
this stupid decison around whether legacy code for cable calc is good or bad silenced
by facts and hard number once and for ever."*

Check status with:
```
ps -p 65684 -o etime=,pcpu=,stat=
ls -la /tmp/legacy-capture-complex.log
ls -la docs/parity/baselines/baseline-v1-20260429/ground-truth/complex-plant-layout/
```

When `numeric-baseline.json` appears in the ground-truth dir, the capture is done.
**Tell Arun immediately**, then run the two follow-up steps:

1. Overshoot detection:
   ```
   cd python/pvlayout_engine && uv run python scripts/parity/detect_legacy_overshoots.py \
     --plant complex-plant-layout \
     --legacy-repo /Users/arunkpatra/codebase/PVlayout_Advance \
     --baseline baseline-v1-20260429
   ```
   Output: `docs/parity/baselines/baseline-v1-20260429/ground-truth/complex-plant-layout/overshoot-analysis-reconstructed.json`.

2. Companion compliance PDF:
   ```
   cd python/pvlayout_engine && uv run python scripts/parity/generate_overshoot_report_pdf.py \
     --plant complex-plant-layout \
     --output ../../docs/post-parity/findings/complex-plant-layout-overshoot-compliance-report.pdf
   ```

Same script, same template, drop-in. Together with the already-shipped phaseboundary2
PDF, this gives Arun the **two-plant defense dossier** he needs to give Prasanta —
small + large fixtures, both showing the same legacy overshoot pathology empirically.

## What's done as of today

- **E1 (Export buttons UI)** shipped + smoke 10/11/12 fully verified live (KMZ + PDF + DXF
  all working, opening cleanly in their native viewers). Per `apps/desktop/src/panels/
  DeliverablesBand.tsx`. Closes the deferred 3 smoke steps.
- **S3-02 / S3-03 / S3-05** all fixed + verified live (cancel-flow trio, run-params
  hydration on open, license-key swap hygiene with sidecar `DELETE /layout/jobs` flush).
- **S3-04** (export buttons missing) closed by E1.
- **S3-06** logged (cable_calc=false runs are partial deliverables — UX gap, not a bug).
- **Two new PLAN rows** added: B27 (refund-policy decision memo, P0), B28 (visible
  cancelled runs UX, coordinated with B27), E3 (PDF page 1 server-side rendering).
- **PRD post-merge cleanup** (`docs/post-parity/PRD-cable-compute-strategy.md`) —
  flagged stale cross-repo references with POST-MERGE notes, didn't redesign (Spike 2
  kickoff handles that).
- **phaseboundary2 overshoot compliance PDF** + technical memo + reproducible scripts
  ready for Prasanta. Headline: 38/62 cables (61%) violate `usable_polygon` in legacy
  with 1,276.6m total outside; new app's Pattern V routes 100% inside by construction.

## Tomorrow's queue

| Priority | Item | Effort |
|---|---|---|
| 1 | If `bzejftoe8` finished overnight → run companion overshoot PDF (5 min) | ~5 min |
| 2 | **B27 — refund-policy decision memo draft** (8 questions, hard recommendations, Prasanta ratifies) | ~2 hrs |
| 3 | After B27 lands → pick next PLAN row (likely Spike 2 kickoff, or a smaller T1) | varies |

## Locked non-negotiables to remember

1. **One question at a time during design / brainstorming.** Same rule as smoke
   verification. Never dump a numbered decision sheet. `feedback_one_question_at_a_time.md`
   memory.
2. **Cite-before-proceed.** For any far-reaching / customer-impact / deep-tech claim:
   fetch authoritative sources, cite URLs, only THEN proceed. Codified in CLAUDE.md §2.
3. **External contracts process.** Even post-merge, Tauri webview ↔ sidecar ↔ mvp_api
   are separate runtimes; read the source of truth before writing any boundary name.
4. **Bite-sized smoke chunks.** During UI verification: one check per prompt, wait for
   response.

## Working dynamic note (read this — it informs how Arun wants to be helped)

Arun is co-founder with Prasanta (30-year-friend dynamic; both repo co-owners; informal
direct comms). Prasanta is the solar-domain authority + VP Eng but is NOT a software
person. Late 2026-05-01: Arun vented about the friction of working with industry/domain
experts who confidently opine on software topics they don't understand. His response
strategy is the right one: replace opinion with hard numbers + reproducible scripts,
end the argument permanently. The compliance PDF + parity scripts + B27 memo are all
instruments of that strategy. **Frame your work in that mode** — facts + numbers +
reproducibility, no hand-waving, no marketing tone.

## Files / paths to know

- E1 implementation: `apps/desktop/src/panels/DeliverablesBand.tsx`,
  `packages/sidecar-client/src/index.ts` (export* methods),
  `apps/desktop/src-tauri/capabilities/default.json`
- Compliance PDF + scripts: `docs/post-parity/findings/phaseboundary2-overshoot-
  compliance-report.pdf`, `python/pvlayout_engine/scripts/parity/detect_legacy_overshoots.py`,
  `python/pvlayout_engine/scripts/parity/generate_overshoot_report_pdf.py`
- Pattern V technical memo: `docs/post-parity/findings/2026-05-01-002-pattern-v-justification.md`
- Smoke log (master observation table, S3-01 through S3-06):
  `docs/post-parity/SMOKE-LOG.md`
- B27 + B28 + B23/B24/B25 etc.: `docs/initiatives/post-parity-v2-backend-plan.md`
- PRD with post-merge notes: `docs/post-parity/PRD-cable-compute-strategy.md`
- Memory: `/Users/arunkpatra/.claude/projects/-Users-arunkpatra-codebase-pv-layout-project/memory/`

## Standing by for

Pick up by checking `bzejftoe8`. If finished → run the overshoot script + PDF + tell
Arun. If still running → continue waiting; pick up B27 unless Arun directs otherwise.

## Sibling RESUME files (audit trail of prior pickups)

All under `docs/post-parity/`, newest first — read for context if you need to
reconstruct what shipped on a prior session:

- `RESUME-2026-05-01-spike1-smoke-mid.md` — mid-Spike-1 smoke (Session 3 kicked off
  from this one, then ran through E1 today)
- `RESUME-2026-05-01-post-merge.md` — post `renewable_energy` merge state
- `RESUME-2026-04-30-end-of-day.md`, `RESUME-2026-04-30-mid-S4.md`,
  `RESUME-2026-04-30-mid-SP1.md`, `RESUME-2026-04-30.md` — multi-checkpoint day
  during SP1/SP4 thumbnails work

Convention: `RESUME-YYYY-MM-DD-<context-slug>.md`. Don't delete prior files —
they're the audit trail.

--- END PROMPT ---
