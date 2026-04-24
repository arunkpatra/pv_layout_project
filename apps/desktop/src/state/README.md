# `apps/desktop/src/state/` — state architecture

This directory is the canonical home for **cross-component client state**.
Slice files are named by domain (`project.ts`, `layoutParams.ts`, `layoutResult.ts`, …).

The full policy is in [`docs/adr/0003-state-architecture.md`](../../../../docs/adr/0003-state-architecture.md). One-page summary:

| State category | Mechanism | Lives where |
|---|---|---|
| Server cache | TanStack Query | hooks at the call site (e.g. `useEntitlementsQuery`) — keys come from [`./queryKeys.ts`](./queryKeys.ts) |
| Cross-component client state | **Zustand** (this directory) | `state/<slice>.ts` |
| Ephemeral UI state | `useState` | inside the component that owns it |
| Imperative handles & RAF guards | `useRef` | inside the component |
| Persistent preferences | `localStorage` (typed) or Zustand `persist` middleware | per-slice decision |
| OS-secret persistence | Tauri `keyring` plugin | `auth/licenseKey.ts` |

## Slice convention

```ts
import { create } from "zustand"
import { subscribeWithSelector } from "zustand/middleware"

interface FooState {
  // Plain data fields.
  bar: string | null

  // Action functions live next to the data they mutate.
  setBar: (next: string | null) => void
  reset: () => void
}

export const useFooStore = create<FooState>()(
  subscribeWithSelector((set) => ({
    bar: null,
    setBar: (next) => set({ bar: next }),
    reset: () => set({ bar: null }),
  }))
)
```

**Rules:**
- One slice per file. Filename = camelCase of the domain (`project.ts`, `layoutParams.ts`).
- Hook export is `use<Domain>Store`.
- `subscribeWithSelector` middleware always — enables fine-grained selectors that don't rerender on unrelated field changes.
- Co-located `<slice>.test.ts` — tests slice actions in isolation (Vitest, see S8.7 harness).
- No `Context.Provider` wrapping a slice. Components import the hook directly.
- No persistence by default. Add Zustand `persist` middleware only if state must survive reload (and document why).

## Selector usage

Always select narrowly so unrelated state churn doesn't trigger rerenders:

```ts
// Good — only rerenders when project changes.
const project = useProjectStore((s) => s.project)

// Bad — rerenders on every action call across the slice.
const { project, setProject, clearProject } = useProjectStore()
```

For multi-field selectors, use the `useShallow` hook or destructure narrowly:

```ts
import { useShallow } from "zustand/react/shallow"
const { boundaries, obstacles } = useLayoutResultStore(
  useShallow((s) => ({
    boundaries: s.result?.[0]?.boundary_wgs84,
    obstacles: s.result?.[0]?.obstacle_polygons_wgs84,
  }))
)
```

## TanStack Query keys

Live in [`./queryKeys.ts`](./queryKeys.ts) so they're discoverable and don't drift. Pattern:

```ts
export const queryKeys = {
  entitlements: (licenseKey: string | null) => ["entitlements", licenseKey] as const,
  layout: (projectId: string, paramsHash: string) =>
    ["layout", projectId, paramsHash] as const,
} as const
```

Use `as const` so TypeScript infers literal-tuple types (TanStack Query's structural deduping is exact-match).
