# Spike 5a — Stats Dashboard

## Goal

Expand the version detail page `CompleteState` to show all 11 layout stat cards (adding row pitch, GCR, inverter capacity) and add an energy stats section (UI shell — always shows "pending" until Spike 7 implements the energy job).

## Architecture

Two file changes. No API, shared types, api-client, or hook changes.

| File | Role |
|---|---|
| `apps/layout-engine/src/handlers.py` | Add 3 fields to `_build_stats()` |
| `apps/web/components/version-detail.tsx` | Expand layout stats + add energy stats section |

**Tests:**

| File | Role |
|---|---|
| `apps/layout-engine/src/tests/test_handlers_prod.py` | Extend existing `_build_stats` coverage for new fields |
| `apps/web/components/version-detail.test.tsx` | Extend existing tests for new stat cards + energy section |

## `handlers.py` — `_build_stats()` change

Add three fields to the returned dict. These are scalar spec-level values set by the engine per boundary; for multi-boundary runs they are the same across all boundaries (same layout parameters applied to each), so `results[0]` is correct:

```python
def _build_stats(results: List[LayoutResult]) -> dict:
    return {
        # existing fields (unchanged)
        "total_tables":        sum(len(r.placed_tables) for r in results),
        "total_modules":       sum(r.total_modules for r in results),
        "total_capacity_mwp":  round(sum(r.total_capacity_mwp for r in results), 3),
        "total_area_acres":    round(sum(r.total_area_acres for r in results), 3),
        "num_icrs":            sum(len(r.placed_icrs) for r in results),
        "num_string_inverters":sum(r.num_string_inverters for r in results),
        "total_dc_cable_m":    round(sum(r.total_dc_cable_m for r in results), 1),
        "total_ac_cable_m":    round(sum(r.total_ac_cable_m for r in results), 1),
        "num_las":             sum(r.num_las for r in results),
        # new fields
        "row_pitch_m":         round(results[0].row_pitch_m, 2),
        "gcr_achieved":        round(results[0].gcr_achieved, 3),
        "inverter_capacity_kwp": round(results[0].inverter_capacity_kwp, 2),
    }
```

Guard: if `results` is empty (no boundaries placed), `results[0]` would raise `IndexError`. The existing code already calls `_build_stats(results)` after layout completes with at least one boundary — this is safe. No change needed to the caller.

## `version-detail.tsx` changes

### `LayoutStats` interface — add 3 fields

```ts
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
```

### `METRIC_LABELS` — add 3 entries

```ts
{ key: "row_pitch_m",          label: "Row pitch",         unit: "m"   },
{ key: "gcr_achieved",         label: "GCR",               unit: ""    },
{ key: "inverter_capacity_kwp",label: "Inverter capacity",  unit: "kWp" },
```

### `EnergyStats` interface — new local type

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

const ENERGY_LABELS: { key: keyof EnergyStats; label: string; unit: string }[] = [
  { key: "irradiance_source",        label: "Irradiance source",  unit: ""              },
  { key: "ghi_kwh_m2_yr",            label: "GHI",                unit: "kWh/m²/yr"     },
  { key: "gti_kwh_m2_yr",            label: "GTI (in-plane)",     unit: "kWh/m²/yr"     },
  { key: "performance_ratio",        label: "Performance ratio",  unit: ""              },
  { key: "specific_yield_kwh_kwp_yr",label: "Specific yield",     unit: "kWh/kWp/yr"    },
  { key: "year1_energy_mwh",         label: "Year 1 energy",      unit: "MWh"           },
  { key: "cuf_pct",                  label: "CUF",                unit: "%"             },
  { key: "lifetime_energy_mwh",      label: "25-year energy",     unit: "MWh"           },
]
```

### `CompleteState` — energy section

Below the existing layout stats grid, add a section heading "Energy" and either:

- **Pending state** (always in Spike 5a — `energyJob` is `null` or `energyJob.statsJson` is absent):
  ```tsx
  <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
    Energy calculation not yet available
  </div>
  ```

- **Complete state** (when `energyJob?.status === "COMPLETE"` and `energyJob.statsJson` is present):
  Same grid pattern as layout stats — one card per `ENERGY_LABELS` entry.

For `irradiance_source` the value is a string, not a number — display directly without unit suffix.

**Polling note:** The existing `getVersionRefetchInterval` polls while `version.status` is `QUEUED` or `PROCESSING`. Once layout completes (`COMPLETE`), polling stops. Energy polling (continuing to poll while `energyJob.status` is active) is a Spike 7 concern — that spike will update the refetch interval logic.

## Error Handling

| Scenario | Behaviour |
|---|---|
| `statsJson` is null | Existing fallback: "Statistics are not available for this run." Energy section not rendered. |
| New fields absent from `statsJson` (old runs) | Delete all old records from DB before testing — no backwards compat needed. |
| `energyJob` is null | Energy pending state shown |
| `energyJob.statsJson` is null | Energy pending state shown |
| `energyJob.status !== "COMPLETE"` | Energy pending state shown |

## Testing

### `test_handlers_prod.py` additions

Extend the existing test file with a test for `_build_stats()` directly, verifying all 12 keys are present and the 3 new fields come from `results[0]`:

```python
def test_build_stats_includes_all_fields():
    from handlers import _build_stats
    r = MagicMock()
    r.placed_tables = [1, 2, 3]
    r.total_modules = 100
    r.total_capacity_mwp = 0.058
    r.total_area_acres = 1.5
    r.placed_icrs = [1]
    r.num_string_inverters = 4
    r.total_dc_cable_m = 500.0
    r.total_ac_cable_m = 120.0
    r.num_las = 3
    r.row_pitch_m = 6.5
    r.gcr_achieved = 0.3456
    r.inverter_capacity_kwp = 29.12

    stats = _build_stats([r])

    assert stats["total_tables"] == 3
    assert stats["row_pitch_m"] == 6.5
    assert stats["gcr_achieved"] == 0.346
    assert stats["inverter_capacity_kwp"] == 29.12
    assert len(stats) == 12
```

### `version-detail.test.tsx` additions

1. Update `COMPLETE_VERSION.statsJson` fixture to include the 3 new fields (`row_pitch_m`, `gcr_achieved`, `inverter_capacity_kwp`) so existing tests continue to pass.

2. Add test: new stat cards render in complete state:
   ```ts
   test("renders new layout stat cards in complete state", () => { ... })
   // assert: "Row pitch", "6.5 m", "GCR", "0.346", "Inverter capacity", "29.12 kWp"
   ```

3. Add test: energy pending state renders when energyJob is null:
   ```ts
   test("renders energy pending state when energyJob is null", () => { ... })
   // assert: getByText(/energy calculation not yet available/i)
   ```

4. Add test: energy stats render when energyJob is COMPLETE with statsJson:
   ```ts
   test("renders energy stats when energyJob is complete", () => { ... })
   // assert: "Year 1 energy", "GHI", "CUF"
   ```

## Out of Scope

- Energy job implementation — Spike 7
- Energy polling when `energyJob.status` is active — Spike 7
- SVG preview — Spike 5b
- Input summary (27 `inputSnapshot` params) — deferred indefinitely
