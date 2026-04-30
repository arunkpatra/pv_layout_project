# SolarDesign Feature Catalog

This document is the authoritative reference for feature availability across plans.
It drives:
- Pricing page comparison table
- In-app feature gating (enable / disable per plan)
- "Upgrade to Professional" prompt triggers
- Roadmap prioritisation

**Plans:** Free (Starter) · Professional · Enterprise
**Last updated:** 2026-04-18

---

## Feature Availability Table

| # | Feature | Free | Professional | Enterprise | Notes |
|---|---------|:----:|:------------:|:----------:|-------|
| **SITE INPUT** |
| 1 | KMZ / KML site boundary import | ✓ | ✓ | ✓ | Core entry point for all projects |
| 2 | DXF boundary import | — | ✓ | ✓ | Survey / CAD boundary files |
| 3 | GPS coordinate input | ✓ | ✓ | ✓ | Manual lat/long entry |
| 4 | Satellite imagery overlay | ✓ | ✓ | ✓ | Background reference only in Free |
| 5 | Terrain / DEM data import | — | ✓ | ✓ | Required for slope analysis |
| 6 | Exclusion zone definition | ✓ | ✓ | ✓ | Roads, water bodies, forest, corridors |
| 7 | Shadow-free area calculation | ✓ | ✓ | ✓ | From KMZ boundary + terrain |
| 8 | Preliminary capacity estimate (MW DC/AC) | ✓ | ✓ | ✓ | Area-based, quick estimate |
| **DC LAYOUT** |
| 9 | Basic DC layout editor — fixed tilt | ✓ | ✓ | ✓ | Manual placement |
| 10 | Auto-layout generation — fixed tilt | — | ✓ | ✓ | Triggers "Upgrade to Pro" in Free |
| 11 | Single-axis tracker layout | — | ✓ | ✓ | E-W tracking configuration |
| 12 | Inter-row pitch / GCR optimisation | — | ✓ | ✓ | Shading loss vs. density trade-off |
| 13 | Bifacial module layout support | — | ✓ | ✓ | Rear irradiance and albedo inputs |
| 14 | DC:AC ratio analysis | — | ✓ | ✓ | Clipping loss vs. yield benefit |
| 15 | Stringing schedule | — | ✓ | ✓ | Modules per string, strings per inverter |
| 16 | Combiner box placement | — | ✓ | ✓ | DC combiner layout |
| **AC YARD DESIGN** |
| 17 | IVT (Inverter Transformer) placement | — | ✓ | ✓ | 400V → 33/66 kV step-up |
| 18 | Pooling substation design | — | ✓ | ✓ | Busbar, MV switchgear |
| 19 | Main step-up transformer sizing | — | ✓ | ✓ | 33/66/132/220 kV |
| 20 | Evacuation line routing | — | ✓ | ✓ | Plant to DISCOM / PGCIL substation |
| 21 | GIS substation support | — | ✓ | ✓ | Constrained-site indoor switchgear |
| **SIMULATION** |
| 22 | CUF (Capacity Utilisation Factor) | — | ✓ | ✓ | Triggers "Upgrade to Pro" in Free |
| 23 | P50 annual yield simulation | — | ✓ | ✓ | |
| 24 | P75 annual yield simulation | — | ✓ | ✓ | |
| 25 | P90 annual yield simulation | — | ✓ | ✓ | |
| 26 | PR (Performance Ratio) | — | ✓ | ✓ | |
| 27 | Full loss breakdown | — | ✓ | ✓ | Soiling, wiring, inverter, transformer, availability |
| 28 | TMY data — Meteonorm | — | ✓ | ✓ | |
| 29 | TMY data — NASA POWER | — | ✓ | ✓ | |
| 30 | TMY data — Solargis | — | ✓ | ✓ | |
| 31 | Near horizon shading analysis | — | ✓ | ✓ | Surrounding structures |
| 32 | Far horizon shading analysis | — | ✓ | ✓ | Terrain horizon |
| 33 | Inter-row shading analysis | — | ✓ | ✓ | Row-to-row loss |
| 34 | String-level mismatch analysis | — | ✓ | ✓ | Inverter / optimiser selection |
| 35 | Multi-scenario comparison | — | ✓ | ✓ | Tilt type, inverter type, DC:AC, module Wp |
| **ELECTRICAL DESIGN** |
| 36 | DISCOM-compliant SLD — DC side | — | ✓ | ✓ | Triggers "Upgrade to Pro" in Free |
| 37 | DISCOM-compliant SLD — AC side | — | ✓ | ✓ | Grid connectivity application format |
| 38 | IS 732 DC cable schedule | — | ✓ | ✓ | String cables, combiner to inverter |
| 39 | IS 1255 AC / HV cable schedule | — | ✓ | ✓ | Inverter to IVT, IVT to main transformer, HV |
| 40 | Earthing and lightning protection design | — | ✓ | ✓ | |
| 41 | ALMM-compliant module library | — | ✓ | ✓ | MNRE list; non-listed equipment flagged |
| 42 | ALMM-compliant inverter library | — | ✓ | ✓ | MNRE list; non-listed equipment flagged |
| **OUTPUTS AND EXPORTS** |
| 43 | BoM (Bill of Materials) — auto-generated | — | ✓ | ✓ | Updates on design change |
| 44 | BoQ (Bill of Quantities) — civil works | — | ✓ | ✓ | Foundation, civil, structures |
| 45 | Pre-bid feasibility package export | — | ✓ | ✓ | Capacity, CUF, evacuation summary, indicative cost |
| 46 | Lender-ready DPR export (IREDA / PFC format) | — | ✓ | ✓ | Triggers "Upgrade to Pro" in Free |
| 47 | PDF layout drawing export | — | ✓ | ✓ | |
| 48 | DXF export (AutoCAD-compatible) | — | ✓ | ✓ | |
| 49 | IFC export (BIM-compatible) | — | ✓ | ✓ | Structural / civil handover |
| 50 | Simulation report PDF | — | ✓ | ✓ | P50/P90, CUF, loss breakdown |
| **COLLABORATION** |
| 51 | Number of users | 1 | Up to 10 | Unlimited | |
| 52 | Number of active projects | 3 | Unlimited | Unlimited | |
| 53 | Cloud-based project access | ✓ | ✓ | ✓ | |
| 54 | Version history | — | ✓ | ✓ | |
| 55 | Design comments and annotations | — | ✓ | ✓ | |
| 56 | Role-based access (owner / editor / viewer) | — | ✓ | ✓ | |
| 57 | Advanced RBAC (custom roles, team hierarchy) | — | — | ✓ | Enterprise only |
| **SECURITY AND COMPLIANCE** |
| 58 | SSO via SAML 2.0 | — | — | ✓ | Enterprise only |
| 59 | Audit logs — all project activity | — | — | ✓ | Enterprise only |
| 60 | Private cloud deployment | — | — | ✓ | Enterprise only |
| 61 | On-premise deployment | — | — | ✓ | Enterprise only |
| 62 | Custom ALMM list integration | — | — | ✓ | For orgs maintaining own approved list |
| 63 | Custom DISCOM SLD format integration | — | — | ✓ | State-specific format variants |
| 64 | Data residency controls | — | — | ✓ | Enterprise only |
| 65 | SLA guarantee | — | — | ✓ | Enterprise only |
| **SUPPORT** |
| 66 | Community forum | ✓ | ✓ | ✓ | |
| 67 | Email support | — | ✓ | ✓ | |
| 68 | Live chat support | — | ✓ | ✓ | |
| 69 | Dedicated customer success manager | — | — | ✓ | Enterprise only |
| 70 | INR invoicing with GST compliance | ✓ | ✓ | ✓ | All plans |
| 71 | Annual billing | — | ✓ | ✓ | |

---

## "Upgrade to Professional" Trigger Points

These are the features where a Free user should see an inline "Upgrade to Professional" prompt when they attempt to use them:

| # | Feature | Trigger context |
|---|---------|----------------|
| 10 | Auto-layout generation | User clicks "Generate layout" button |
| 22 | CUF simulation | User opens simulation panel |
| 36 | SLD generation | User clicks "Generate SLD" |
| 46 | DPR export | User clicks "Export DPR" |
| 54 | Version history | User opens version panel |

Additional soft triggers (feature visible but locked with upgrade prompt):
- Scenario comparison tab
- ALMM library tab
- BoM / BoQ export buttons
- Tracker layout mode toggle

---

## Plan Limits Summary

| Limit | Free | Professional | Enterprise |
|-------|------|-------------|------------|
| Users | 1 | Up to 10 | Unlimited |
| Active projects | 3 | Unlimited | Unlimited |
| Simulations per project | — | Unlimited | Unlimited |
| Export formats | — | PDF, DXF, IFC | PDF, DXF, IFC + custom |
| Data storage | 500 MB | 50 GB | Custom |
| API access | — | — | ✓ |
