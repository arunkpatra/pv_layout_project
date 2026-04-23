# ADR 0002: Canvas-first MapLibre, no basemap tiles

Date: 2026-04-24
Spike: S8
Status: accepted

## Context

S8 wires the desktop's map canvas. The open question from [SPIKE_PLAN.md](../SPIKE_PLAN.md) § S8 and [ARCHITECTURE.md](../ARCHITECTURE.md) §11 was the *basemap strategy* — which tile source (if any) sits under the KMZ overlay and the tables / ICRs / cables the user will eventually lay out on top.

The plan's original framing assumed there *would* be a basemap, and enumerated online free tile providers (MapTiler, Stadia, Protomaps, OpenFreeMap) against a bundled-offline vector pack. The framing inherited an assumption that a "map" needs map tiles.

Revisiting the design references and user behaviour changed the default.

## Options considered

**Option A — Online vector tiles (MapTiler / Stadia / OpenFreeMap / Protomaps)**
- Pros: Rich geographic context (roads, labels, terrain). Zero local storage cost. Vector tiles are MapLibre-native and restyle-able.
- Cons: External runtime dependency on every launch — tile CDNs go down, throttle, or change pricing. Attribution text on the canvas competes with the engineering geometry. Some providers require an API key which adds signup + rotation friction. Doesn't match any of the quality-bar references (Claude Desktop, Linear, Figma — all basemap-less).
- Conflicts with [ADR 0001](./0001-online-required-entitlements.md)'s online-required-for-entitlements *scope* — we wanted the canvas itself to work regardless of entitlements-server reachability.

**Option B — No basemap. MapLibre on a solid surface-canvas background.**
- Pros: Zero external runtime dep. Canvas works offline even though the app as a whole requires online for entitlements (distinct failure modes). Matches every pattern-language reference — Claude Desktop, Linear, and Figma all have canvas-first UIs with no basemap under the domain geometry. Matches PVlayout_Advance's matplotlib canvas behaviour exactly (functional parity per CLAUDE.md). Faster startup, lower cost at scale, simpler MapLibre style to author and polish.
- Cons: Loss of "where in the world is my site?" context. Mitigated — the user just loaded a KMZ; they already know where the site is. Secondary view in Google Earth remains trivially available.

**Option C — Bundled offline vector pack (pmtiles of India)**
- Pros: Full geographic context, works offline.
- Cons: ~1-2 GB install bloat for a feature most users never notice. Maintenance burden — OSM refreshes. Still requires MapLibre style authoring plus a pmtiles extraction toolchain. Highest total cost-of-ownership for the least-argued-for option.

## Decision

**Option B.** The desktop's canvas is the **plant site**, not a view of the world. MapLibre renders our domain features (KMZ boundary, obstacles, TL corridors, and — from S9 onwards — tables, ICRs, inverters, cables, LAs) on a solid `--surface-canvas` background. No tile sources. No basemap.

Specifics:
- `pv-light.json` and `pv-dark.json` are minimal MapLibre styles: a `background` layer in the theme's canvas colour, plus placeholder layer definitions for the KMZ sources. No `glyphs`, no `sprite`, no tile endpoints.
- A hairline dot grid is composited as a CSS background on the map container (a visual reference for scale before any KMZ loads — preserved from the S6 MapCanvas placeholder).
- A scale bar is added to the bottom-left of the canvas (MapLibre's built-in `ScaleControl`) because users size plant geometry by metres.
- `fitBounds` centres the KMZ on load.
- Theme swap (light ↔ dark) replaces the MapLibre style JSON wholesale via `map.setStyle()`.

## Consequences

**Accepted:**
- No geographic reference outside the KMZ. If a user wants context, they open the KMZ in Google Earth (where they created it).
- Attribution text is not rendered on the canvas (there's nothing to attribute — no tile provider).
- A future "show basemap" user preference is a clean additive change: swap to [`Protomaps`](https://protomaps.com) hosted CDN (no API key, MapLibre-native, permissive attribution), or MapTiler / Stadia if we outgrow. The style authored under this ADR is the *overlay layer*; a basemap would sit under it without rewriting.

**Not implemented:**
- No MapTiler / Stadia / Protomaps / OpenFreeMap integration.
- No bundled offline pmtiles.
- No tile-cache layer, no online/offline detection for map content.
- No attribution UI.

**Revisitable:**
- If field feedback shows users actively want geographic context (e.g., visual confirmation of site location before starting a design), a follow-up spike can add an optional basemap layer. The S13.7 brainstorm is a natural reopening point — the subscription redesign touches user-onboarding surfaces where "see your site on a map" may land.

## Related

- [ADR 0001](./0001-online-required-entitlements.md) — online-required for *entitlements*; this ADR keeps the canvas unaffected by that network dependency.
- ARCHITECTURE.md §11 — removes the "basemap strategy" open question.
- SPIKE_PLAN.md → S8 — In-Scope updated to match (remove the "evaluate MapTiler / Stadia / Protomaps" language).
