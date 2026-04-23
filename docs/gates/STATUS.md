# Spike Status

**Last updated:** 2026-04-23

## Current state

**Active spike:** S3 — Sidecar: parse + layout + golden-file tests
**Status:** awaiting human gate verification
**Gate memo:** [`s03.md`](./s03.md)

## Progress

| Spike | Title | Status | Gate memo |
|---|---|---|---|
| S0    | Repo & tooling bootstrap                       | 🟢 passed | [s00.md](./s00.md) |
| S1    | Vendor Python core from PVlayout_Advance       | 🟢 passed | [s01.md](./s01.md) |
| S2    | FastAPI sidecar — health, schemas, auth        | 🟢 passed | [s02.md](./s02.md) |
| S3    | Sidecar: parse + layout + golden-file tests    | 🟡 awaiting gate | [s03.md](./s03.md) |
| S4    | Sidecar: PyInstaller single-binary build       | ⚪ pending | — |
| S5    | Tauri 2 shell + sidecar lifecycle              | ⚪ pending | — |
| S5.5  | Design Foundations (tokens + light mocks)      | ⚪ pending | — |
| S6    | Design system implementation (light polished)  | ⚪ pending | — |
| S7    | License key + entitlements + feature gating    | ⚪ pending | — |
| S8    | KMZ load + MapLibre canvas                     | ⚪ pending | — |
| S9    | Input panel + Generate Layout                  | ⚪ pending | — |
| S10   | Inverters, cables, LAs                         | ⚪ pending | — |
| S11   | ICR drag + obstruction drawing                 | ⚪ pending | — |
| S12   | Exports: KMZ + PDF                             | ⚪ pending | — |
| S13   | PRO_PLUS: DXF + energy yield + CSV             | ⚪ pending | — |
| S13.5 | Dark theme parity                              | ⚪ pending | — |
| S14   | Auto-updater + code signing + notarization     | ⚪ pending | — |
| S15   | Release pipeline + download delivery           | ⚪ pending | — |

**Legend:** ⚪ pending · 🟡 awaiting gate · 🟢 passed · 🔴 failed (in repair)

## How this file is kept current

Updated at the start of each spike (mark 🟡) and on gate sign-off (mark 🟢, move to next). Claude updates this on every transition; no out-of-band edits needed.
