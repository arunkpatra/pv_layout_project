# Spike 5a — Stats Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the version detail page to show all 11 layout stat cards (adding row pitch, GCR, inverter capacity) and add an energy stats section (pending shell until Spike 7).

**Architecture:** Two source files changed — `_build_stats()` in the Python Lambda handler gains 3 new fields; `version-detail.tsx` in the web app gains the matching `LayoutStats` fields, 3 new stat cards, and an energy stats section below the layout grid. No API, shared types, api-client, or hook changes needed.

**Tech Stack:** Python 3.x + pytest (layout engine), Next.js 16 App Router, React 19, TanStack Query v5, Vitest + React Testing Library (web).

---

## Scene

**Branch:** `spike/5a-stats-dashboard`  
**Spec:** `docs/superpowers/specs/2026-04-20-spike-5a-stats-dashboard-design.md`

**Existing patterns to follow:**
- Layout engine tests: `apps/layout-engine/src/tests/test_handlers_prod.py` — uses `unittest.mock.patch` and `MagicMock`; imports directly from `handlers`
- Web component tests: `apps/web/components/version-detail.test.tsx` — uses `vi.mock`, `vi.mocked`, `render` + `screen` from React Testing Library
- `LayoutStats` interface is local to `version-detail.tsx` — `statsJson` is typed `unknown` at the shared boundary; cast locally

**Test run commands:**
```bash
# Layout engine only (from repo root):
cd apps/layout-engine && uv run pytest src/tests/test_handlers_prod.py -v && cd ../..

# Web only (from repo root):
bunx turbo test --filter=@renewable-energy/web -- --reporter=verbose

# All gates (from repo root):
bun run lint && bun run typecheck && bun run test && bun run build
```

---

## Task 1: Extend `_build_stats()` in the Lambda handler

**Files:**
- Modify: `apps/layout-engine/src/handlers.py:62-73`
- Modify: `apps/layout-engine/src/tests/test_handlers_prod.py`

- [ ] **Step 1: Write the failing test**

Open `apps/layout-engine/src/tests/test_handlers_prod.py` and add this test at the bottom of the file:

```python
def test_build_stats_includes_all_12_fields():
    """_build_stats returns row_pitch_m, gcr_achieved, inverter_capacity_kwp from results[0]."""
    from handlers import _build_stats
    from unittest.mock import MagicMock

    r = MagicMock()
    r.placed_tables = [object(), object(), object()]  # len 3
    r.total_modules = 100
    r.total_capacity_mwp = 0.058
    r.total_area_acres = 1.5
    r.placed_icrs = [object()]  # len 1
    r.num_string_inverters = 4
    r.total_dc_cable_m = 500.0
    r.total_ac_cable_m = 120.0
    r.num_las = 3
    r.row_pitch_m = 6.5
    r.gcr_achieved = 0.3456
    r.inverter_capacity_kwp = 29.12

    stats = _build_stats([r])

    assert stats["total_tables"] == 3
    assert stats["total_modules"] == 100
    assert stats["total_capacity_mwp"] == 0.058
    assert stats["total_area_acres"] == 1.5
    assert stats["num_icrs"] == 1
    assert stats["num_string_inverters"] == 4
    assert stats["total_dc_cable_m"] == 500.0
    assert stats["total_ac_cable_m"] == 120.0
    assert stats["num_las"] == 3
    assert stats["row_pitch_m"] == 6.5
    assert stats["gcr_achieved"] == 0.346
    assert stats["inverter_capacity_kwp"] == 29.12
    assert len(stats) == 12
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/layout-engine && uv run pytest src/tests/test_handlers_prod.py::test_build_stats_includes_all_12_fields -v && cd ../..
```

Expected: FAIL — `AssertionError` on `len(stats) == 12` (currently 9) or `KeyError` on `row_pitch_m`.

- [ ] **Step 3: Update `_build_stats()` in `handlers.py`**

Replace lines 62–73 in `apps/layout-engine/src/handlers.py` with:

```python
def _build_stats(results: List[LayoutResult]) -> dict:
    return {
        "total_tables":          sum(len(r.placed_tables) for r in results),
        "total_modules":         sum(r.total_modules for r in results),
        "total_capacity_mwp":    round(sum(r.total_capacity_mwp for r in results), 3),
        "total_area_acres":      round(sum(r.total_area_acres for r in results), 3),
        "num_icrs":              sum(len(r.placed_icrs) for r in results),
        "num_string_inverters":  sum(r.num_string_inverters for r in results),
        "total_dc_cable_m":      round(sum(r.total_dc_cable_m for r in results), 1),
        "total_ac_cable_m":      round(sum(r.total_ac_cable_m for r in results), 1),
        "num_las":               sum(r.num_las for r in results),
        "row_pitch_m":           round(results[0].row_pitch_m, 2),
        "gcr_achieved":          round(results[0].gcr_achieved, 3),
        "inverter_capacity_kwp": round(results[0].inverter_capacity_kwp, 2),
    }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/layout-engine && uv run pytest src/tests/test_handlers_prod.py -v && cd ../..
```

Expected: ALL tests pass including the new `test_build_stats_includes_all_12_fields`.

- [ ] **Step 5: Commit**

```bash
git add apps/layout-engine/src/handlers.py apps/layout-engine/src/tests/test_handlers_prod.py
git commit -m "feat: add row_pitch_m, gcr_achieved, inverter_capacity_kwp to _build_stats"
```

---

## Task 2: Expand layout stats in `version-detail.tsx`

**Files:**
- Modify: `apps/web/components/version-detail.tsx`
- Modify: `apps/web/components/version-detail.test.tsx`

- [ ] **Step 1: Update the test fixture and write the new layout stats test**

In `apps/web/components/version-detail.test.tsx`:

1. Update `COMPLETE_VERSION.layoutJob.statsJson` to include the 3 new fields (so existing tests don't break when the component is updated):

```ts
const COMPLETE_VERSION: VersionDetailType = {
  ...BASE_VERSION,
  status: "COMPLETE",
  layoutJob: {
    id: "lj_1",
    status: "COMPLETE",
    kmzArtifactS3Key: "output/layout.kmz",
    svgArtifactS3Key: "output/layout.svg",
    dxfArtifactS3Key: "output/layout.dxf",
    statsJson: {
      total_tables: 120,
      total_modules: 3360,
      total_capacity_mwp: 1.949,
      total_area_acres: 8.4,
      num_icrs: 6,
      num_string_inverters: 42,
      total_dc_cable_m: 5200.5,
      total_ac_cable_m: 800.2,
      num_las: 12,
      row_pitch_m: 6.5,
      gcr_achieved: 0.346,
      inverter_capacity_kwp: 29.12,
    },
    errorDetail: null,
    startedAt: "2026-04-20T00:00:00Z",
    completedAt: "2026-04-20T00:05:00Z",
  },
  energyJob: null,
}
```

2. Add this new test at the bottom of the file:

```ts
test("renders row pitch, GCR, and inverter capacity stat cards when COMPLETE", () => {
  mockUseVersion.mockReturnValue({
    data: COMPLETE_VERSION,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useVersion>)
  render(<VersionDetail projectId="prj_123" versionId="ver_1" />, {
    wrapper: createWrapper(),
  })
  expect(screen.getByText("Row pitch")).toBeInTheDocument()
  expect(screen.getByText("6.5 m")).toBeInTheDocument()
  expect(screen.getByText("GCR")).toBeInTheDocument()
  expect(screen.getByText("0.346")).toBeInTheDocument()
  expect(screen.getByText("Inverter capacity")).toBeInTheDocument()
  expect(screen.getByText("29.12 kWp")).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify the new test fails**

```bash
bunx turbo test --filter=@renewable-energy/web -- --reporter=verbose 2>&1 | tail -20
```

Expected: The new test FAILS (stat cards not in component yet). All existing tests still PASS (fixture updated).

- [ ] **Step 3: Update `LayoutStats` interface and `METRIC_LABELS` in `version-detail.tsx`**

Replace the `LayoutStats` interface and `METRIC_LABELS` constant (lines 13–39) with:

```ts
// Local type for layout stats — shared type uses `unknown` intentionally
interface LayoutStats {
  total_tables: number
  total_modules: number
  total_capacity_mwp: number
  total_area_acres: number
  num_icrs: number
  num_string_inverters: number
  total_dc_cable_m: number
  total_ac_cable_m: number
  num_las: number
  row_pitch_m: number
  gcr_achieved: number
  inverter_capacity_kwp: number
}

const METRIC_LABELS: {
  key: keyof LayoutStats
  label: string
  unit: string
}[] = [
  { key: "total_capacity_mwp",    label: "Capacity",          unit: "MWp" },
  { key: "total_modules",         label: "Modules",           unit: ""    },
  { key: "total_tables",          label: "Tables",            unit: ""    },
  { key: "total_area_acres",      label: "Area",              unit: "acres" },
  { key: "row_pitch_m",           label: "Row pitch",         unit: "m"   },
  { key: "gcr_achieved",          label: "GCR",               unit: ""    },
  { key: "num_string_inverters",  label: "String inverters",  unit: ""    },
  { key: "inverter_capacity_kwp", label: "Inverter capacity", unit: "kWp" },
  { key: "num_icrs",              label: "ICRs",              unit: ""    },
  { key: "num_las",               label: "Lightning arresters", unit: "" },
  { key: "total_dc_cable_m",      label: "DC cable",          unit: "m"   },
  { key: "total_ac_cable_m",      label: "AC cable",          unit: "m"   },
]
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bunx turbo test --filter=@renewable-energy/web -- --reporter=verbose 2>&1 | tail -20
```

Expected: ALL tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/version-detail.tsx apps/web/components/version-detail.test.tsx
git commit -m "feat: add row pitch, GCR, inverter capacity to layout stats grid"
```

---

## Task 3: Add energy stats section

**Files:**
- Modify: `apps/web/components/version-detail.tsx`
- Modify: `apps/web/components/version-detail.test.tsx`

- [ ] **Step 1: Write failing tests for the energy section**

Add the following to `apps/web/components/version-detail.test.tsx`:

First, add a new fixture constant after `COMPLETE_VERSION`:

```ts
const ENERGY_COMPLETE_VERSION: VersionDetailType = {
  ...COMPLETE_VERSION,
  energyJob: {
    id: "ej_1",
    status: "COMPLETE",
    pdfArtifactS3Key: "output/report.pdf",
    statsJson: {
      irradiance_source: "PVGIS",
      ghi_kwh_m2_yr: 1850,
      gti_kwh_m2_yr: 2100,
      performance_ratio: 0.82,
      specific_yield_kwh_kwp_yr: 1722,
      year1_energy_mwh: 3356.7,
      cuf_pct: 19.7,
      lifetime_energy_mwh: 77450,
    },
    irradianceSource: "PVGIS",
    errorDetail: null,
    startedAt: "2026-04-20T00:05:00Z",
    completedAt: "2026-04-20T00:06:00Z",
  },
}
```

Then add two new tests at the bottom of the file:

```ts
test("renders energy pending state when energyJob is null", () => {
  mockUseVersion.mockReturnValue({
    data: COMPLETE_VERSION,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useVersion>)
  render(<VersionDetail projectId="prj_123" versionId="ver_1" />, {
    wrapper: createWrapper(),
  })
  expect(
    screen.getByText(/energy calculation not yet available/i),
  ).toBeInTheDocument()
})

test("renders energy stat cards when energyJob is COMPLETE", () => {
  mockUseVersion.mockReturnValue({
    data: ENERGY_COMPLETE_VERSION,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useVersion>)
  render(<VersionDetail projectId="prj_123" versionId="ver_1" />, {
    wrapper: createWrapper(),
  })
  expect(screen.getByText("Year 1 energy")).toBeInTheDocument()
  expect(screen.getByText("3356.7 MWh")).toBeInTheDocument()
  expect(screen.getByText("GHI")).toBeInTheDocument()
  expect(screen.getByText("1850 kWh/m²/yr")).toBeInTheDocument()
  expect(screen.getByText("CUF")).toBeInTheDocument()
  expect(screen.getByText("19.7 %")).toBeInTheDocument()
  expect(screen.getByText("Irradiance source")).toBeInTheDocument()
  expect(screen.getByText("PVGIS")).toBeInTheDocument()
})
```

- [ ] **Step 2: Run tests to verify the new tests fail**

```bash
bunx turbo test --filter=@renewable-energy/web -- --reporter=verbose 2>&1 | tail -20
```

Expected: 2 new tests FAIL. All existing tests PASS.

- [ ] **Step 3: Add `EnergyStats` interface, `ENERGY_LABELS`, and update `CompleteState` in `version-detail.tsx`**

After the closing `]` of `METRIC_LABELS`, add:

```ts
interface EnergyStats {
  irradiance_source: string
  ghi_kwh_m2_yr: number
  gti_kwh_m2_yr: number
  performance_ratio: number
  specific_yield_kwh_kwp_yr: number
  year1_energy_mwh: number
  cuf_pct: number
  lifetime_energy_mwh: number
}

const ENERGY_LABELS: {
  key: keyof EnergyStats
  label: string
  unit: string
}[] = [
  { key: "irradiance_source",         label: "Irradiance source", unit: ""           },
  { key: "ghi_kwh_m2_yr",             label: "GHI",               unit: "kWh/m²/yr"  },
  { key: "gti_kwh_m2_yr",             label: "GTI (in-plane)",    unit: "kWh/m²/yr"  },
  { key: "performance_ratio",         label: "Performance ratio", unit: ""           },
  { key: "specific_yield_kwh_kwp_yr", label: "Specific yield",    unit: "kWh/kWp/yr" },
  { key: "year1_energy_mwh",          label: "Year 1 energy",     unit: "MWh"        },
  { key: "cuf_pct",                   label: "CUF",               unit: "%"          },
  { key: "lifetime_energy_mwh",       label: "25-year energy",    unit: "MWh"        },
]
```

Then replace the entire `CompleteState` function with:

```tsx
function CompleteState({ version }: { version: VersionDetailType }) {
  const stats = version.layoutJob?.statsJson as LayoutStats | null
  const energyStats =
    version.energyJob?.status === "COMPLETE"
      ? (version.energyJob.statsJson as EnergyStats | null)
      : null

  return (
    <div className="flex flex-col gap-6">
      <VersionStatusBadge status="COMPLETE" />
      {stats ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {METRIC_LABELS.map(({ key, label, unit }) => (
            <div key={key} className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-lg font-semibold">
                {stats[key]}
                {unit ? ` ${unit}` : ""}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Layout complete. Statistics are not available for this run.
        </p>
      )}
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">Energy</p>
        {energyStats ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {ENERGY_LABELS.map(({ key, label, unit }) => (
              <div key={key} className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-lg font-semibold">
                  {String(energyStats[key])}
                  {unit ? ` ${unit}` : ""}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Energy calculation not yet available
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify all tests pass**

```bash
bunx turbo test --filter=@renewable-energy/web -- --reporter=verbose 2>&1 | tail -20
```

Expected: ALL tests pass (including the 2 new energy tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/version-detail.tsx apps/web/components/version-detail.test.tsx
git commit -m "feat: add energy stats section to version detail complete state"
```

---

## Task 4: Final gates

- [ ] **Step 1: Run all gates from repo root**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all pass. If any fail, fix before proceeding.

- [ ] **Step 2: Commit any fixes (if needed)**

```bash
git add -p
git commit -m "fix: address lint/typecheck issues"
```
