# Spike 4c — Version Submission Form Design

**Date:** 2026-04-20  
**Branch:** spike-4c  
**Depends on:** Spike 4b (projects list + create project)

---

## Goal

Build the version submission form at `/dashboard/projects/[projectId]/new-version`. Engineers fill in 27 layout and energy parameters, optionally upload a KMZ boundary file, and submit to create a new version. On success they are redirected to the version detail page.

## Architecture

Two files:

- `apps/web/app/(main)/dashboard/projects/[projectId]/new-version/page.tsx` — client component; fetches project name for breadcrumb via `useProject(projectId)`; renders `<NewVersionForm projectId={projectId} />`
- `apps/web/components/new-version-form.tsx` — self-contained form; owns all react-hook-form state, KMZ file state, auto-override switch state, and submit logic

**Form library:** `react-hook-form` + `zod` (new dependency). The Zod schema defines the submit shape; react-hook-form handles field registration, validation, and error state.

**Submit flow:** `useCreateVersion` mutation hook (new) → `api.createVersion({ projectId, label?, inputSnapshot, kmzFile? })` → on success redirect to `/dashboard/projects/${projectId}/versions/${version.id}`.

**Tech stack:** Next.js 16 App Router, React 19, shadcn/ui, Tailwind v4, TanStack Query v5, Clerk v7.

---

## Layout

### Desktop (≥1024px)

Two-column layout:
- **Left column (200px, sticky):** Section nav — 6 anchor links (Run setup, Module, Table config, Layout, Inverter, Energy losses). "Run layout" submit button pinned below the nav links. Active section highlighted as user scrolls via `IntersectionObserver`.
- **Right column (flex-1, scrollable):** Form sections stacked vertically, each a `<section id="...">` with a heading.

### Mobile/tablet (<1024px)

Single column:
- Horizontally scrollable chip row at top — one chip per section, active chip styled `default`, inactive `outline`. Chips scroll the page to the corresponding section anchor.
- "Run layout" button at bottom of form.
- Left-nav hidden.

---

## Form Sections and Fields

### Run setup

| Field | Type | Required | Notes |
|---|---|---|---|
| KMZ file | File upload | Yes | `.kmz` only; drag-and-drop zone + click to browse; shows filename + size once selected; `×` to clear |
| Run label | Text input | No | Free-text, placeholder "e.g. Phase 1 baseline" |

KMZ held in `useState<File | null>` outside react-hook-form (File objects don't serialize to Zod). Validated on submit — required; shows inline error if missing.

### Module

| Field | Key | Default | Unit | Range |
|---|---|---|---|---|
| Length (long side) | `module_length` | 2.38 | m | 0.5–5.0 |
| Width (short side) | `module_width` | 1.13 | m | 0.5–3.0 |
| Wattage | `module_wattage` | 580 | Wp | 100–1000 |

### Table config

| Field | Key | Default | Type |
|---|---|---|---|
| Orientation | `orientation` | Portrait | Select: Portrait / Landscape |
| Modules per row | `modules_in_row` | 28 | Integer, 1–100 |
| Rows per table | `rows_per_table` | 2 | Integer, 1–10 |
| East–west gap | `table_gap_ew` | 1.0 | m, 0–20 |

### Layout

Three fields use the auto-override pattern (see below). One plain numeric field.

| Field | Key | Default | Unit | Range |
|---|---|---|---|---|
| Tilt angle | `tilt_angle` | Auto | ° | 5–40, override only |
| Row pitch | `row_spacing` | Auto | m | 1–50, override only |
| GCR | `gcr` | Auto | — | 0.1–0.9, override only |
| Perimeter road width | `perimeter_road_width` | 6.0 | m | 0–50 |

### Inverter

| Field | Key | Default | Range |
|---|---|---|---|
| Max strings per inverter | `max_strings_per_inverter` | 20 | 1–500 |

### Energy losses

**Irradiance** (2 fields — no pre-filled default; hint shown):

| Field | Key | Default | Unit |
|---|---|---|---|
| GHI | `ghi_kwh_m2_yr` | 0.0 | kWh/m²/yr |
| GTI (in-plane) | `gti_kwh_m2_yr` | 0.0 | kWh/m²/yr |

Hint below both fields: "Enter site irradiance values. Leave 0 to skip energy calculation."

**Performance ratio breakdown** (10 fields):

| Field | Key | Default | Unit |
|---|---|---|---|
| Inverter efficiency | `inverter_efficiency_pct` | 97.0 | % |
| DC cable losses | `dc_cable_loss_pct` | 2.0 | % |
| AC cable losses | `ac_cable_loss_pct` | 1.0 | % |
| Soiling losses | `soiling_loss_pct` | 4.0 | % |
| Temperature losses | `temperature_loss_pct` | 6.0 | % |
| Module mismatch | `mismatch_loss_pct` | 2.0 | % |
| Shading losses | `shading_loss_pct` | 2.0 | % |
| Availability | `availability_pct` | 98.0 | % |
| Transformer losses | `transformer_loss_pct` | 1.0 | % |
| Other losses | `other_loss_pct` | 1.0 | % |

**Degradation** (3 fields):

| Field | Key | Default | Unit |
|---|---|---|---|
| 1st year degradation | `first_year_degradation_pct` | 2.0 | % |
| Annual degradation | `annual_degradation_pct` | 0.5 | %/yr |
| Plant lifetime | `plant_lifetime_years` | 25 | years |

---

## Auto-Override Pattern

`tilt_angle`, `row_spacing`, and `gcr` are nullable — the engine computes them from site geometry when `null`. They use a consistent two-part control:

```
[Switch off]  Tilt angle    [disabled input — placeholder "Auto"]
[Switch on ]  Row pitch     [ 7.00   m ]   ← activates on switch
```

- Switch off (default): input disabled, placeholder "Auto", value submitted as `null`
- Switch on: input active, pre-filled with a sensible starting value (tilt: 20°, row pitch: 7.0 m, GCR: 0.40)
- Switch state lives in `useState` per field, outside the Zod schema

**Zod schema types:**
```ts
tilt_angle: z.number().min(5).max(40).nullable()
row_spacing: z.number().min(1).max(50).nullable()
gcr: z.number().min(0.1).max(0.9).nullable()
```

---

## Tooltips

Every parameter field has a `Tooltip` (shadcn) on an info icon. Tooltip content: explanation + default value + when to override. Source: `input_panel.py` tooltips from the desktop app, adapted for web.

---

## KMZ Upload UX

Custom drag-and-drop zone (no external library):
- `div` with `onDragOver` / `onDrop` + hidden `<input type="file" accept=".kmz">`
- Empty state: dashed border, icon, "Drop KMZ file here or click to browse"
- File selected: filename + formatted size (e.g. "site-boundary.kmz · 42 KB") + `×` clear button
- Error state: red border + "KMZ file is required" if submit attempted without file

---

## Submit Flow

1. react-hook-form `handleSubmit` validates all 27 fields via Zod
2. KMZ file presence validated separately (not in Zod)
3. If valid: call `mutateAsync({ projectId, label, inputSnapshot, kmzFile })`
   - `inputSnapshot` = Zod-validated values with nullable overrides resolved
   - `label` = trimmed string or `undefined`
4. On success: `router.push(`/dashboard/projects/${projectId}/versions/${version.id}`)`
5. During submission: "Run layout" button shows spinner + disabled; form fields remain enabled

### Error messages

| Scenario | Message |
|---|---|
| Network failure | "Layout submission failed. Could not reach the server. Check your connection and try again." |
| HTTP 4xx | "Layout submission failed. The server rejected the request. Check your inputs and try again." |
| Any other | "Layout submission failed. An unexpected error occurred. Try again or contact support." |

Shown as shadcn `Alert` (destructive variant) above the submit button. Cleared on next submit attempt.

---

## New Hook: `useCreateVersion`

`apps/web/hooks/use-create-version.ts` — mirrors `use-create-project.ts`:

```ts
export function useCreateVersion() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (params: CreateVersionParams) => api.createVersion(params),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.versions.all(projectId) })
    },
  })
}
```

`CreateVersionParams` imported from `@renewable-energy/api-client`.

---

## Testing

### `hooks/use-create-version.test.tsx`

- Mocks `useApi`, `useAuth` (Clerk)
- Verifies `createVersion` called with correct args
- Verifies `invalidateQueries` called on success

### `components/new-version-form.test.tsx`

- Renders form, verifies all 5 section headings present
- Verifies default values populated correctly (spot-check key fields)
- Submitting without KMZ → shows "KMZ file is required"
- Submitting with all defaults + KMZ → calls `useCreateVersion` mutate with correct `inputSnapshot`
- Auto-override switch off → `tilt_angle: null` in submitted payload
- Auto-override switch on + value entered → `tilt_angle: <value>` in submitted payload
- API error → shows destructive Alert with correct message

---

## Files Created or Modified

| Action | Path |
|---|---|
| Create | `apps/web/app/(main)/dashboard/projects/[projectId]/new-version/page.tsx` |
| Create | `apps/web/components/new-version-form.tsx` |
| Create | `apps/web/hooks/use-create-version.ts` |
| Create | `apps/web/hooks/use-create-version.test.tsx` |
| Create | `apps/web/components/new-version-form.test.tsx` |
| Modify | `apps/web/package.json` — add `react-hook-form`, `@hookform/resolvers`, `zod` |

---

## Acceptance Criteria

- [ ] `bun run lint && bun run typecheck && bun run test && bun run build` all pass
- [ ] All 27 parameters visible with correct defaults on page load
- [ ] Every parameter has a tooltip — verified by clicking each one
- [ ] Auto-override fields show "Auto" when switch off; activate on switch on
- [ ] KMZ drag-and-drop: drop a `.kmz` file → filename and size displayed
- [ ] Submitting without KMZ → inline error shown
- [ ] Submitting with defaults → version created → redirected to version detail page
- [ ] Desktop (≥1024px): sticky left-nav visible and scrolls to section on click
- [ ] Mobile (≤768px): chip nav visible, left-nav hidden
- [ ] Error on failed submission: domain-specific message, not raw HTTP error
- [ ] Verified in local dev and production
