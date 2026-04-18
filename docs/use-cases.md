# SolarDesign — Target Audience, Use Cases, and Value Propositions

## Context

This document is the authoritative reference for product decisions, marketing copy, and feature prioritisation. It is based on domain research and direct input from solar industry practitioners in India.

All product features, UI copy, marketing pages, and roadmap decisions should be evaluated against the personas, workflows, and value propositions described here.

---

## Primary Market

**India. Utility-scale and large industrial solar. Greenfield projects.**

The primary customers are organisations involved in planning, designing, and delivering solar power plants in the range of **10 MW to 500 MW and above**. These include:

- Independent Power Producers (IPPs)
- EPC contractors (Engineering, Procurement, Construction)
- Solar development companies bidding on SECI, NTPC, and state DISCOM tenders
- Solar engineering consultants providing DPR and feasibility services

Commercial rooftop (offices, shopping centres) and small C&I installations are a secondary segment. They are not the primary design target.

---

## Primary Personas

### Persona 1 — Design Engineer (Solar PV)

**Who they are:**
A civil, electrical, or systems engineer with 3–10 years of experience in solar project design. Works at an EPC company, IPP, or solar consultancy. Handles all technical design deliverables from pre-feasibility through construction issue drawings. Their output directly feeds the BD team's bid submissions and the lender's technical due diligence.

**Typical titles:**
Design Engineer, Senior Design Engineer – Utility Scale, Solar PV Design Engineer, Systems Design Engineer

**Current toolchain:**
- Google Earth Pro — site scouting, KMZ import/export
- PVsyst — energy simulation, P50/P75/P90, CUF estimation
- AutoCAD / AutoCAD Electrical — DC/AC layout drawings, SLD, cable routing
- Microsoft Excel — cable schedules, BoM, BoQ, string counting
- Plex-Earth (AutoCAD plugin) — satellite imagery overlay in CAD
- Solargis / NASA POWER / Meteonorm — TMY irradiance data

**Day-to-day workflow (pre-bid phase):**
1. Receive KMZ file from BD or land team (site boundary, exclusion zones)
2. Open Google Earth Pro — inspect terrain, shadow obstructions, substation proximity
3. Estimate shadow-free usable area (manual visual estimate + rule-of-thumb deduction)
4. Re-enter site coordinates manually into PVsyst and AutoCAD
5. Run PVsyst simulation — configure module + inverter, input TMY data, set losses
6. Produce CUF estimate, P50/P75/P90 annual yield, PR
7. Draw DC yard layout in AutoCAD — module rows, row spacing, inverter platforms, IVT placement
8. Draw AC yard in AutoCAD — main step-up transformer, switchgear, evacuation line routing
9. Draft SLD manually in AutoCAD — 2–3 hours per project
10. Build cable schedule manually in Excel — error-prone, major rework risk
11. Compile pre-bid package or DPR for BD team or lender

**Key pain points:**
- No automated handoff from KMZ to design tools — coordinates re-entered manually at every step
- Shadow-free area calculation is a manual visual estimate, not computed
- PVsyst has no collaboration; teams email `.PVsyst` files with no version control
- SLD generation is fully manual in AutoCAD — bottleneck in pre-bid cycles
- Cable schedules in Excel are manually updated; any layout change requires full rework
- No tool in the standard India workflow integrates KMZ + terrain + layout + simulation in one place
- Global design tools (HelioScope, PVcase) are not calibrated for Indian regulatory formats

**What they care about:**
- Speed of pre-bid feasibility output (BD needs capacity + CUF in 24–48 hours)
- Accuracy of CUF and P50/P90 — these are contractual guarantees in PPAs
- ALMM-compliant module and inverter library — mandatory for government projects
- DISCOM-compliant SLD format — required for grid connectivity application
- IS-standard cable sizing (IS 732, IS 1255) — checked by state CEIG at inspection
- Lender-ready DPR output (IREDA, PFC, SBI Cap, Axis Bank technical advisor formats)

---

### Persona 2 — BD (Business Development) Engineer / Manager

**Who they are:**
A commercial or technical professional responsible for bid preparation, client proposals, and project pipeline management. They are the first point of contact when a new project site is identified. They depend entirely on the design engineer for the technical inputs that go into a bid.

**What they need from the design engineer (and the tool):**
- Net MW AC / MW DC capacity (usable shadow-free area × module density)
- CUF estimate (%) — the primary metric in every SECI / DISCOM PPA
- P50 annual yield (MWh) — for revenue projection in the financial model
- DC:AC ratio — determines inverter cost and clipping loss assumptions
- Indicative BoS cost and BoM — for bid tariff calculation (₹/kWh)
- Evacuation voltage and line length — evacuation cost is 5–15% of project cost
- Land requirement (acres per MW) — cross-check against available parcel
- PR (Performance Ratio) — included in DPR for lender technical due diligence

**BD timeline pressure:**
SECI and state tender bid deadlines are typically 15–30 days after tender release. The BD team needs a complete pre-bid feasibility package — capacity, CUF, evacuation option, indicative project cost — within **24–48 hours** of receiving the site KMZ.

---

### Persona 3 — Solar Consultant / Independent Engineer

**Who they are:**
An independent consultant or boutique firm providing feasibility studies, DPRs, lender technical due diligence, and owner's engineer services. Works across multiple client projects simultaneously.

**What they need:**
- Fast multi-scenario comparison (fixed tilt vs. tracker, central vs. string inverter, different module wattage)
- P50/P75/P90 output in formats accepted by IREDA, PFC, and international lenders
- Bankable simulation methodology documentation
- Ability to manage multiple project files independently
- Export formats compatible with AutoCAD for client handover

---

## Primary Workflow: Pre-Bid to DPR

This is the core workflow SolarDesign must support. Every feature decision should be evaluated against how well it compresses or improves a step in this pipeline.

```
Step 1: Site Identification
  └─ BD / land team shares KMZ file (site boundary, exclusions)
  └─ Design engineer imports KMZ, identifies shadow-free area

Step 2: Capacity Estimation
  └─ Shadow-free area + module density → MW DC capacity
  └─ DC:AC ratio → MW AC (inverter sizing)
  └─ Quick CUF estimate for BD team

Step 3: Energy Simulation
  └─ TMY irradiance data input (Meteonorm / NASA POWER / Solargis)
  └─ PVsyst-equivalent simulation → P50 / P75 / P90 annual yield
  └─ CUF, PR, loss breakdown
  └─ Multi-scenario comparison (tilt, tracker, module, DC:AC ratio)

Step 4: DC Layout Design
  └─ Module row layout within KMZ boundary
  └─ Row spacing (inter-row pitch for target GCR)
  └─ Fixed tilt or single-axis tracker
  └─ String layout, combiner box placement
  └─ Inverter platform locations

Step 5: AC Layout and Electrical Design
  └─ IVT placement (400V → 33/66 kV)
  └─ AC switchgear and pooling substation
  └─ Main step-up transformer (33/66/132/220 kV)
  └─ Evacuation line routing to DISCOM/PGCIL substation

Step 6: Electrical Schedules
  └─ Stringing schedule (modules per string, strings per inverter)
  └─ DC cable schedule (string cables, combiner to inverter)
  └─ AC cable schedule (inverter to IVT, IVT to main transformer)
  └─ Cable sizing to IS 732 / IS 1255

Step 7: SLD Generation
  └─ Single Line Diagram — DC and AC sides
  └─ DISCOM-compliant format for grid connectivity application

Step 8: BoM / BoQ Generation
  └─ Bill of Materials — modules, inverters, transformers, cables, structures
  └─ Bill of Quantities — civil works quantities for EPC contracting

Step 9: DPR Compilation
  └─ Lender-ready Detailed Project Report
  └─ Sections: site data, simulation report, design drawings, BoM, BoQ, evacuation option
  └─ Accepted by IREDA, PFC, SBI Cap, Axis Bank technical advisors
```

---

## Regulatory and Compliance Context (India)

All product features that touch equipment selection, output formats, or report generation must account for the following:

| Requirement | Detail |
|---|---|
| **ALMM compliance** | All modules and inverters for government-backed projects must be on MNRE's Approved List of Models and Manufacturers. Mandatory since April 2024. Non-compliant equipment = bid disqualification. |
| **DISCOM SLD format** | The Single Line Diagram is a statutory document submitted with the grid connectivity application. Each state DISCOM has its own format requirements. |
| **CEA Regulations 2024** | Technical standards for grid connectivity, metering, protection, and safety. Design must comply with the current CEA compendium. |
| **IS 732 / IS 1255** | Indian Standards for cable sizing (IS 732: electric cables; IS 1255: HV cables). State CEIG inspectors check compliance before commissioning approval. |
| **CEIG inspection** | Chief Electrical Inspector to Government — state-level inspector who approves electrical installations before commissioning. SLD and cable schedule are primary inspection documents. |
| **PPA / CUF guarantee** | Power Purchase Agreements with SECI or state DISCOMs specify a minimum guaranteed CUF. Design engineers are responsible for the CUF estimate that becomes the PPA obligation. |
| **P50/P90 lender standard** | IREDA, PFC, and commercial bank technical advisors require P50/P90 yield estimates. PVsyst is the de facto standard; any competing simulation must produce equivalent outputs. |

---

## Key Industry Terminology

These terms must be used correctly in all product copy, UI labels, and documentation. Do not substitute generic software terms.

| Term | Use In |
|---|---|
| **CUF** (Capacity Utilization Factor) | Yield simulation output, PPA context, BD handoff |
| **P50 / P75 / P90** | Yield confidence levels for simulation output and lender reports |
| **PR** (Performance Ratio) | Efficiency metric in simulation output and DPR |
| **KMZ / KML** | Site boundary file format from Google Earth; the starting point of every project |
| **Shadow-free area** | Net usable land area after exclusions and shading obstructions |
| **DC:AC ratio** | Inverter sizing ratio; typically 1.2–1.4 in India |
| **GCR** (Ground Coverage Ratio) | Panel density on available land |
| **Inter-row pitch** | Distance between module rows; controls inter-row shading loss |
| **TMY data** | Typical Meteorological Year irradiance data for simulation |
| **Irradiance** | Solar radiation resource (not "sunlight levels") |
| **SLD** (Single Line Diagram) | Statutory electrical schematic — DC and AC sides |
| **IVT** (Inverter Transformer) | Step-up transformer at inverter level (400V → 33 kV) |
| **Pooling substation** | Internal substation aggregating multiple IVT outputs |
| **Evacuation line** | HV line from plant to DISCOM/PGCIL substation |
| **Evacuation voltage** | Voltage at plant boundary: 33/66/132/220 kV |
| **BoM** (Bill of Materials) | Itemised equipment list |
| **BoQ** (Bill of Quantities) | Civil/structural quantities for EPC contracting |
| **DPR** (Detailed Project Report) | Master project document for lender and regulatory submission |
| **ALMM** | MNRE's approved module and inverter list |
| **DISCOM** | State electricity distribution company |
| **SECI** | Solar Energy Corporation of India — conducts national reverse auctions |
| **ISTS** | Inter-State Transmission System (national PGCIL grid) |
| **RPO / RCO** | Renewable Purchase / Consumption Obligation |
| **PPA** | Power Purchase Agreement |
| **IPP** | Independent Power Producer |
| **EPC** | Engineering, Procurement, Construction contractor |
| **CEA** | Central Electricity Authority |
| **CEIG** | Chief Electrical Inspector to Government (state-level) |
| **Fixed tilt** | Static module mounting at fixed angle |
| **Single-axis tracker** | Motorised east-west tracking mounting system |
| **Bifacial module** | Module that captures irradiance on both front and rear surfaces |
| **String inverter** | Inverter connected to one or more strings; common in utility-scale India |
| **Central inverter** | Large inverter connected to multiple combiners; used in very large plants |

---

## What the Product Must Do — Core Value Propositions

Listed in priority order for the primary Indian utility-scale audience.

### 1. KMZ import → capacity estimate pipeline
Import a KMZ site boundary, calculate shadow-free usable area automatically, and output DC/AC capacity and a quick CUF estimate. This is the single most time-consuming manual step in the pre-bid workflow and no existing tool in India does it end-to-end.

### 2. CUF and P50/P75/P90 yield simulation
Run energy simulations using TMY irradiance data and produce CUF, P50/P75/P90 annual yield, PR, and loss breakdown. Output must meet the standard expected by IREDA, PFC, and commercial bank technical advisors. PVsyst is the current lender standard; the simulation methodology must be documented and defensible.

### 3. DC layout generation
Produce a compliant DC yard layout within the KMZ boundary — module rows, inter-row pitch for target GCR, fixed tilt or single-axis tracker, string layout, combiner placement, and inverter platform locations.

### 4. DISCOM-compliant SLD generation
Auto-generate the Single Line Diagram (DC and AC sides) in a format acceptable for grid connectivity applications. Eliminates 2–3 hours of manual AutoCAD drafting per project.

### 5. IS-standard cable schedule
Generate DC and AC cable schedules with sizing calculated to IS 732 / IS 1255. Replaces the error-prone Excel spreadsheet that is currently the primary source of design errors and CEIG inspection failures.

### 6. ALMM-compliant equipment library
Module and inverter selection from an MNRE ALMM-listed library, updated as the ALMM list changes. Non-compliant equipment selection in a government project causes bid disqualification.

### 7. BoM and BoQ generation
Produce itemised Bill of Materials and Bill of Quantities directly from the design — not from a parallel Excel spreadsheet. Any design change must automatically update the BoM and BoQ.

### 8. Lender-ready DPR export
Compile the complete pre-bid or detailed design package — site data, simulation report, layout drawings, BoM, BoQ, evacuation option — in a format acceptable to IREDA, PFC, SBI Cap, and Axis Bank technical advisors.

### 9. Multi-scenario comparison
Compare design scenarios side by side: fixed tilt vs. tracker, central vs. string inverter, different module wattage, different DC:AC ratios. Critical for BD team bid decisions and for consultant feasibility studies.

### 10. Collaboration and version control
Cloud-based project access for distributed teams. PVsyst has no collaboration capability — teams currently email `.PVsyst` files with no version history. This is a gap across the entire existing toolchain.

---

## What the Product Is Not (Scope Boundaries)

- Not a financial modelling tool. LCOE, IRR, NPV, and tariff calculations belong in a financial model, not in SolarDesign.
- Not a SCADA or O&M platform. Post-commissioning monitoring is out of scope.
- Not a procurement tool. BoM generation is in scope; vendor management and purchase orders are not.
- Not a structural engineering tool. Foundation design (pile sizing, concrete volumes) is not in scope beyond civil quantities in BoQ.
- Not a land acquisition tool. Land ownership, revenue records, and conveyancing are out of scope.

---

## Segment Priority for Marketing and Product

| Segment | Priority | Notes |
|---|---|---|
| Utility-scale IPP / developer (India) | Primary | 50–500 MW projects; SECI/NTPC/state tenders |
| Solar EPC contractor (India) | Primary | Design-to-construction handover; BoM, SLD, DPR |
| Solar engineering consultant (India) | Primary | DPR, feasibility, lender due diligence |
| Large C&I / open access (India) | Secondary | 1–50 MW; simpler workflow, lower regulatory burden |
| Commercial rooftop (India) | Tertiary | Different workflow, different tool requirements |
| International utility-scale | Future | After India product-market fit is established |
