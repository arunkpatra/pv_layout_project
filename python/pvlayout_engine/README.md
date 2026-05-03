# pvlayout-engine

The Python sidecar. Bundled as a single-file PyInstaller binary and embedded in the Tauri desktop app.

## What goes here

- **`pvlayout_core/`** — extracted to its own package at `../pvlayout_core/` per cloud-offload C2 (spec D6). Engine consumes via editable path-dep declared in `[tool.uv.sources]`.
- **`pvlayout_engine/`** — FastAPI wrapper (server, routes, pydantic schemas). Landed in **S2 / S3**.
- **`pvlayout-engine.spec`** — single PyInstaller spec. Landed in **S4**.
- **`tests/`** — smoke tests (S1), golden-file tests (S3).

## Commands

```bash
# Setup (S0 and beyond)
uv sync

# Dev-mode sidecar (S2 and beyond)
uv run python -m pvlayout_engine.main

# Tests (S1 and beyond)
uv run pytest

# Build standalone binary (S4 and beyond)
uv run pyinstaller pvlayout-engine.spec
```

## Status

**S0 stub.** Only `pyproject.toml` and empty package exist. `uv sync` creates a venv with no runtime deps.

See [`docs/SPIKE_PLAN.md`](../../docs/SPIKE_PLAN.md) for the full plan.
