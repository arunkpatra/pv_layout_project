# pvlayout-core

SolarLayout's domain-logic library. The single source of solar-domain truth — layout engine, parsers, exporters, energy yield, satellite-water detection. Consumed by the Tauri sidecar (`python/pvlayout_engine/`) today; consumed by AWS Lambda container images post-cloud-offload (per `docs/superpowers/specs/2026-05-03-cloud-offload-architecture.md` D6).

## Subpackages

- `pvlayout_core.core` — layout engine, parsers, exporters, edition flags
- `pvlayout_core.models` — dataclasses (`LayoutParameters`, `LayoutResult`, …)
- `pvlayout_core.utils` — geo helpers (UTM/WGS84)

## Provenance

Vendored verbatim from `PVlayout_Advance/{core,models,utils}` at S1. Do not modify these modules to add features that don't exist in the legacy app without recording the divergence in `docs/post-parity/findings/`. Cross-engine parity tests under `tests/parity/` enforce bit-equality with the legacy reference at `/Users/arunkpatra/codebase/PVlayout_Advance` (branch `baseline-v1-20260429`).

## Commands

```bash
# From this directory
uv sync --extra dev
uv run pytest tests/ -q
```

## Status

Standalone since C2 (cloud-offload arc). Engine consumes via editable path-dep in `python/pvlayout_engine/pyproject.toml`'s `[tool.uv.sources]`.
