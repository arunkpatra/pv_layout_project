# Spike Status

**Last updated:** 2026-04-24

## Current state

**Active spike:** S10 — Inverters, cables, LAs (PRO features, read-only)
**Status:** ⚪ pending start
**Previous gate:** S9 passed 2026-04-24 — [`s09.md`](./s09.md)

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
| S10   | Inverters, cables, LAs                         | ⚪ pending | — |
| S10.5 | Drawing/editing pipeline ADR                   | ⚪ pending | — |
| S11   | ICR drag + obstruction drawing                 | ⚪ pending | — |
| S12   | Exports: KMZ + PDF                             | ⚪ pending | — |
| S13   | PRO_PLUS: DXF + energy yield + CSV             | ⚪ pending | — |
| S13.5 | Dark theme parity                              | ⚪ pending | — |
| S13.7 | Subscription model redesign (brainstorm)       | ⚪ pending | — |
| S14   | Auto-updater + code signing + notarization     | ⚪ pending | — |
| S15   | Release pipeline + download delivery           | ⚪ pending | — |
| S15.5 | Sidecar bundle slimming (deferred opt)         | ⚪ pending | — |

**Legend:** ⚪ pending · 🟡 awaiting gate · 🟢 passed · 🔴 failed (in repair)

## How this file is kept current

Updated at the start of each spike (mark 🟡) and on gate sign-off (mark 🟢, move to next). Claude updates this on every transition; no out-of-band edits needed.
