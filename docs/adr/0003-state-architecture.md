# ADR 0003: State architecture — where each kind of state lives
Date: 2026-04-24
Spike: S8.8
Status: accepted

## Context

By S8 we have four state mechanisms in use across the desktop app:
- **`useState` / `useReducer`** (React local) — `sidecarPhase`, `paletteOpen`, `inspectorOpen`, dialog open/close, license dialog state, etc.
- **TanStack Query** — `useEntitlementsQuery` (server cache for `api.solarlayout.in/entitlements`).
- **`useRef`** — MapLibre map instance (`mapRef`), prop snapshots (`propsRef`), animation guards (`lastBoundariesKey`, `lastAppliedStyleUrl`).
- **No client-state store yet** — but S9 introduces `layoutParams` (form state) and `layoutResult` (compute output) that are shared across multiple sibling components (InputPanel ↔ MapCanvas ↔ SummaryPanel) and need to outlive any single mount. That's a Zustand fit.

Without an explicit policy, S10–S15 will each independently introduce another paradigm (jotai signals, Redux, context-only globals, even more refs), and by release we'll have a state architecture that requires a tour to onboard onto.

This ADR locks the policy NOW so all subsequent spikes follow it.

## Options considered

1. **No policy** — let each spike pick what fits. Rejected: leads to scatter and onboarding cost.
2. **Single store (Redux Toolkit / Zustand monolith)** — one mega-store for everything. Rejected: pushes inherently-server state (entitlements, layout result) into client cache, loses TanStack Query's request-dedup / refetch behavior; pushes ephemeral UI state (dialog open?) into a global, causing render churn.
3. **Layered policy: each kind of state in its natural home.** Accepted.

## Decision

Each kind of state lives in exactly one place, by category:

| State category | Mechanism | Examples |
|---|---|---|
| **Server cache** (responses from sidecar or `api.solarlayout.in`) | **TanStack Query** | `useEntitlementsQuery`, `useLayoutMutation` (S9), `useUsageReportMutation` (S12) |
| **Cross-component client state** (shared across siblings, survives navigation) | **Zustand**, sliced by domain | `layoutParams` (S9), `layoutResult` (S9), `selection` (S11), `editingState` (S11) |
| **Ephemeral UI state** (single component, no siblings care) | **`useState`** | `paletteOpen`, dialog open/close, hover state, transient form fields |
| **Imperative handles & RAF guards** (DOM nodes, animation keys, render snapshots) | **`useRef`** | `mapRef`, `containerRef`, `propsRef`, `lastAppliedStyleUrl` |
| **Browser-persistent preferences** (survives reload, not session) | **`localStorage` via small typed wrapper**, exposed through Zustand persist middleware where applicable | `theme` (already), `unitsPreference` (S9+), `recentProjects` (S12) |
| **OS-secret persistence** (survives reinstall) | **Tauri `keyring` plugin** | `licenseKey` (S7) |

**Conventions:**

1. **Zustand uses the slice pattern.** One store per domain (`useLayoutParamsStore`, `useLayoutResultStore`, `useSelectionStore`). Each store exports its own hook. Slice files live at `apps/desktop/src/state/<slice>.ts`.

2. **TanStack Query keys are structured arrays, prefixed by domain.** `["entitlements"]`, `["layout", parsedKmzId, paramsHash]`, `["usage", featureKey]`. A central `apps/desktop/src/state/queryKeys.ts` exports the key builders.

3. **No `Context.Provider` for state.** Context is used only for *configuration* injection (e.g., `EntitlementsProvider`, `ThemeProvider` — these inject computed values, not write APIs). Never use Context to share writable state — that's what Zustand is for.

4. **No `useReducer` for cross-component state.** If reducer logic is needed, it lives inside a Zustand slice action.

5. **Refs are documented at the declaration site** when they survive across renders for non-obvious reasons (e.g., `propsRef` in `MapCanvas.tsx` exists because async event handlers need fresh prop values). A one-line comment is enough.

6. **Test convention:** Zustand slices are tested with their actions in isolation. TanStack Query mutations are tested via a wrapper that mocks the sidecar client. UI state (`useState`) is tested via React Testing Library interactions.

## Consequences

- **S8.8 cleanup work:** Audit existing `useState` usages in `App.tsx` for any that are functionally cross-component (e.g., `project` state — used by MapCanvas + StatusBar + InspectorSkeleton). Migrate qualifying ones to Zustand slices. Document in S8.8 gate memo.
- **S9 onward:** Form state via `react-hook-form` is initialized FROM and writes BACK TO Zustand, not the other way around. RHF owns the form lifecycle; Zustand owns the persisted/shared snapshot.
- **S11 onward:** Editing state (selected feature, drag-in-progress geometry, undo stack) is a Zustand slice from day one. No mid-spike refactoring.
- **Future contributor onboarding:** A 5-minute read of this ADR is sufficient to know where any new state belongs. Eliminates "should this be Zustand or Context?" debates.
- **Lock-in cost:** If we ever decide TanStack Query was wrong, migration is contained to query hook files. Same for Zustand. Each layer has a clean swap surface.

## Non-decisions (deliberately deferred)

- **Devtools setup** is decided per-store; default is "enabled in dev only". Not worth an ADR clause.
- **Persistence strategy** for any specific Zustand slice is decided when the slice is built. Theme persists; layout params probably don't (per-project, not per-user); selection definitely doesn't.
- **Server-state real-time sync** (e.g., live entitlements push) is not in scope. Any such future feature would extend TanStack Query, not introduce a new paradigm.
