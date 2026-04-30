# SolarDesign Brand Voice

## Who We Are Writing For

SolarDesign is used by two primary readers:

- **Design engineers** — responsible for layout, simulation, and technical deliverables. Familiar with GCR, tilt angles, string sizing, irradiance data, P50/P90, and IFC exports.
- **Project managers** — responsible for site timelines, client proposals, and contractor handover. Familiar with BoMs, yield reports, grid connection submissions, and EPC workflows.

Both are working professionals in the solar and energy industry. Many operate in an Indian context. They are not looking for decorative language, startup enthusiasm, or clever phrasing. They are looking for accurate, useful information delivered without waste.

---

## Voice Principles

### 1. Speak the industry's language

Use the terms practitioners already use. Do not invent softer substitutes or explain terms that any competent solar professional knows.

| Use | Not |
|-----|-----|
| Yield | Output, results, performance |
| Irradiance | Sunlight levels, solar energy |
| String | Panel group, module chain |
| Capacity (kWp / MWp) | Size, power |
| Generation (kWh / MWh) | Output, production figures |
| Shading loss | Shadow impact, shading effect |
| Tilt angle | Panel angle, slope setting |
| Setback | Buffer zone, margin |
| Commissioning | Go-live, launch |
| Grid connection | Connect to grid, network connection |
| EPC contractor | Builder, installer, contractor (generic) |
| BoM | Parts list, materials list |
| P50 / P90 | Best case / worst case |
| TMY data | Historical weather data |
| DNO / TSO | Network operator, grid authority |

### 2. No decorative language

Remove adjectives that do not add information. If a word could be cut without changing meaning, cut it.

| Write | Not |
|-------|-----|
| Export to DXF | Seamlessly export to DXF |
| Generates the BoM | Automatically generates a comprehensive BoM |
| Run a yield simulation | Run a powerful yield simulation |
| The layout is ready | Your layout is ready to go |

Do not use:
- Seamless, powerful, cutting-edge, world-class, innovative, robust, comprehensive
- Unlock, leverage, streamline (unless no simpler word fits)
- Game-changer, next-level, revolutionary
- Exclamation marks in UI copy or documentation

### 3. No idioms

SolarDesign serves a global audience including non-native English speakers. Idioms create friction.

| Write | Not |
|-------|-----|
| This will take time | Rome wasn't built in a day |
| Check the input values | Something seems off |
| Contact support | We're here for you |
| The simulation failed | Things didn't go as planned |

### 4. Professional, not mechanical

Copy should read like a knowledgeable colleague — not a legal document, not a chatbot. Use complete sentences. Avoid unnecessary abbreviations in prose. Do not omit subject from sentences to sound terse.

| Write | Not |
|-------|-----|
| The simulation could not complete because the irradiance dataset is missing. | Simulation failed: missing data. |
| Select the roof zone before running the layout. | Select zone first. |
| The project has no panels assigned to this string. | No panels found. |

### 5. Functional error messages

Errors must state three things: what happened, why it happened (if known), and what the user should do next. No softening, no apology unless an apology is warranted.

**Structure:** `[What failed]. [Reason, if known]. [Action to take].`

| Write | Not |
|-------|-----|
| Yield simulation failed. The irradiance file for this location could not be loaded. Upload a TMY3 file or select a location with available data. | Oops! Something went wrong. Please try again. |
| Export failed. The IFC schema version is not supported by this project type. Switch to DXF or contact support. | Export error. Please try again or contact support. |
| Layout generation stopped. Panel count exceeds the roof zone capacity at the current GCR setting. Reduce panel size or lower the GCR. | Too many panels. Please adjust your settings. |

### 6. No humour

SolarDesign does not use humour, wit, or personality-driven copy. This is a professional tool used in a professional context. Empty states, loading messages, and onboarding flows should be informative, not entertaining.

---

## Tone by Context

| Context | Tone |
|---------|------|
| Marketing pages | Direct, credible, factual. State what the tool does and who it is for. No hyperbole. |
| Onboarding / empty states | Instructional. Tell the user what to do next. |
| Error messages | Factual. State what failed and what to do. |
| Tooltips / help text | Concise. One or two sentences. Use correct technical terms. |
| Email notifications | Plain. Subject line states the event. Body gives the relevant detail. |
| Proposals / reports | Formal but not verbose. Suitable for sharing with clients and lenders. |

---

## Sentence Construction

- Prefer active voice: "The tool calculates shading loss" not "Shading loss is calculated by the tool."
- Keep sentences short. One idea per sentence.
- Do not use multiple exclamation marks. Avoid exclamation marks in functional UI copy entirely.
- Spell out numbers below ten in prose. Use numerals for measurements and technical values (e.g. 10 kWp, 3 panels, 45° tilt).
- Use the metric system. Where imperial units are relevant, show both.

---

## Quick Reference: Words to Avoid

| Avoid | Reason |
|-------|--------|
| Seamless | Meaningless filler |
| Powerful | Vague, overused |
| Cutting-edge | Marketing cliché |
| Innovative | Says nothing specific |
| Unlock | Startup-speak |
| Leverage | Jargon from a different industry |
| World-class | Unverifiable claim |
| Delightful | Wrong register for this product |
| Easy | Patronising; show don't tell |
| Simply / just | Dismisses real effort |
| Exciting | Not for professional B2B context |
| Game-changer | Never |
