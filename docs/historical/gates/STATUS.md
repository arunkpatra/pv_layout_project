# Spike Status

**Last updated:** 2026-04-24

## Current state

**Active spike:** S12 — Exports: KMZ + PDF (next)
**Status:** ⚪ pending start.
**Previous gate:** S11 passed 2026-04-24 (preliminary). Rigorous gate-walkthrough (steps d–k on `docs/gates/s11.md` §4, plus cables-on parity) deferred to a future scoped spike (TBD, user to scope).
**Also recently passed:** S11.5 passed 2026-04-24 — [`s11_5.md`](./s11_5.md). Spec: [`docs/superpowers/specs/2026-04-24-s11_5-cable-calc-requirements.md`](../superpowers/specs/2026-04-24-s11_5-cable-calc-requirements.md). ADR: [`docs/adr/0007-pvlayout-core-s11-5-exception.md`](../adr/0007-pvlayout-core-s11-5-exception.md).

## Progress

| Spike | Title | Status | Gate memo |
|---|---|---|---|
| S0    | Repo & tooling bootstrap                       | 🟢 passed | [s00.md](./s00.md) |
| S1    | Vendor Python core from PVlayout_Advance       | 🟢 passed | [s01.md](./s01.md) |
| S2    | FastAPI sidecar — health, schemas, auth        | 🟢 passed | [s02.md](./s02.md) |
| S3    | Sidecar: parse + layout + golden-file tests    | 🟢 passed | [s03.md](./s03.md) |
| S4    | Sidecar: PyInstaller single-binary build       | 🟢 passed | [s04.md](./s04.md) |
| S5    | Tauri 2 shell + sidecar lifecycle              | 🟢 passed | [s05.md](./s05.md) |
| S5.5  | Design Foundations (tokens + light mocks)      | 🟢 passed | [s05_5.md](./s05_5.md) |
| S6    | Design system implementation (light polished)  | 🟢 passed | [s06.md](./s06.md) |
| S7    | License key + entitlements + feature gating    | 🟢 passed | [s07.md](./s07.md) |
| S8    | KMZ load + MapLibre canvas                     | 🟢 passed | [s08.md](./s08.md) |
| S8.7  | Frontend test harness + CI                     | 🟢 passed | [s08_7.md](./s08_7.md) |
| S8.8  | State architecture cleanup (ADR-0003 + 0004)   | 🟢 passed | [s08_8.md](./s08_8.md) |
| S9    | Input panel + Generate Layout                  | 🟢 passed | [s09.md](./s09.md) |
| S10   | Inverters, cables, LAs                         | 🟢 passed | [s10.md](./s10.md) |
| S10.2 | Feature-key alignment with backend seed        | 🟢 passed | [s10_2.md](./s10_2.md) |
| S10.5 | Drawing/editing pipeline ADR                   | 🟢 passed | [s10_5.md](./s10_5.md) |
| S11   | ICR drag + obstruction drawing                 | 🟢 passed (preliminary; rigorous deferred) | [S11_PAUSED_FOR_CABLES.md](./S11_PAUSED_FOR_CABLES.md) |
| S11.5 | Cable calc correctness (industry requirements) | 🟢 passed | [s11_5.md](./s11_5.md) |
| S12   | Exports: KMZ + PDF                             | ⚪ pending | — |
| S13   | PRO_PLUS: DXF + energy yield + CSV             | ⚪ pending | — |
| S13.5 | Dark theme parity                              | ⚪ pending | — |
| S13.7 | Subscription model redesign (brainstorm)       | ⚪ pending | — |
| S13.8 | Parity & gates end-to-end verification         | ⚪ pending | — |
| S14   | Auto-updater + code signing + notarization     | ⚪ pending | — |
| S15   | Release pipeline + download delivery           | ⚪ pending | — |
| S15.5 | Sidecar bundle slimming (deferred opt)         | ⚪ pending | — |

**Legend:** ⚪ pending · 🟡 awaiting gate · 🟢 passed · 🔴 failed (in repair) · ⏸ paused

## How this file is kept current

Updated at the start of each spike (mark 🟡) and on gate sign-off (mark 🟢, move to next). Claude updates this on every transition; no out-of-band edits needed.
