# C2 — Extract `pvlayout_core` to standalone package — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `python/pvlayout_engine/pvlayout_core/` to `python/pvlayout_core/` as its own uv-managed Python package with its own `pyproject.toml`, tests, and CI gate. The engine layer keeps depending on it as an editable path-dep so the existing sidecar continues to work during cutover.

**Architecture:** Pure file-move + dependency-rewiring refactor. No code logic changes inside `pvlayout_core`. After this row: (1) `python/pvlayout_core/` is a standalone uv project owning all domain libs (shapely, pyproj, simplekml, matplotlib, numpy, ezdxf, Pillow, requests) + the 10 pure-core tests + the 4 KMZ fixtures; (2) `python/pvlayout_engine/` becomes thin (FastAPI + uvicorn + pydantic + python-multipart) and depends on `pvlayout-core` via `[tool.uv.sources]` editable path-dep; (3) CI gains a parallel `core` pytest job.

**Tech Stack:** Python 3.12+, uv (package manager + lockfile), pytest 8.3+, hatchling build backend, GitHub Actions.

**Spec source:** `docs/superpowers/specs/2026-05-03-cloud-offload-architecture.md` row C2 (§9), locked decisions D4 + D6.

**Verification baseline (captured 2026-05-03):** `cd python/pvlayout_engine && uv run pytest tests/ -q` → **128 passed, 7 skipped, 5 deselected** (the 5 are slow-marked; the 7 are environment-dependent skips like missing PVlayout_Advance fixtures). Post-row: same engine number must hold; new pvlayout_core gate must run a non-empty subset of these tests independently.

---

## File Structure

**Create:**
- `python/pvlayout_core/pyproject.toml` — package manifest, owns domain deps + dev extras
- `python/pvlayout_core/README.md` — short blurb; cite spec D6
- `python/pvlayout_core/.python-version` — pin (mirror engine's, if present)
- `python/pvlayout_core/pvlayout_core/__init__.py` (moved with src)
- `python/pvlayout_core/pvlayout_core/core/` (moved)
- `python/pvlayout_core/pvlayout_core/models/` (moved)
- `python/pvlayout_core/pvlayout_core/utils/` (moved)
- `python/pvlayout_core/tests/__init__.py`
- `python/pvlayout_core/tests/unit/__init__.py`
- `python/pvlayout_core/tests/parity/__init__.py`
- `python/pvlayout_core/tests/integration/__init__.py`
- `python/pvlayout_core/tests/golden/__init__.py`
- `python/pvlayout_core/tests/golden/kmz/*.kmz` (4 KMZ files moved)
- `python/pvlayout_core/tests/unit/test_visibility_graph.py` (moved)
- `python/pvlayout_core/tests/parity/test_*_parity.py` (8 files moved)
- `python/pvlayout_core/tests/integration/test_cable_routing_constraints.py` (moved)

**Modify:**
- `python/pvlayout_engine/pyproject.toml` — strip domain deps; add `pvlayout-core` path-dep; drop `pvlayout_core` from wheel `packages`
- `python/pvlayout_engine/README.md` — remove the `pvlayout_core/` sub-folder line; cite the new location
- `python/pvlayout_engine/uv.lock` — regenerate after pyproject change
- `python/pvlayout_engine/tests/golden/test_layout_parity.py` — update `KMZ_DIR` to point at `python/pvlayout_core/tests/golden/kmz/`
- `python/pvlayout_engine/tests/integration/test_export_dxf.py` — update `KMZ_FIXTURE` parents reference
- `python/pvlayout_engine/tests/integration/test_export_kmz.py` — update `KMZ_FIXTURE` parents reference
- `python/pvlayout_engine/tests/integration/test_export_pdf.py` — update `KMZ_FIXTURE` parents reference
- `python/pvlayout_engine/tests/integration/test_layout_thumbnail.py` — update `KMZ_FIXTURE` parents reference
- `.github/workflows/ci.yml` — add a parallel `core` job
- `docs/superpowers/specs/2026-05-03-cloud-offload-architecture.md` — flip C2 status `todo` → `done`, append commit ref

**Delete (via `git mv`):**
- `python/pvlayout_engine/pvlayout_core/` (entire directory; moved to new location)
- `python/pvlayout_engine/tests/golden/kmz/` (entire directory; moved to new location)
- `python/pvlayout_engine/tests/unit/test_visibility_graph.py` (moved)
- `python/pvlayout_engine/tests/unit/` (now empty — directory removed if empty)
- `python/pvlayout_engine/tests/parity/test_*_parity.py` (8 files moved)
- `python/pvlayout_engine/tests/parity/` (now empty after `__init__.py` migrates with — see Task 4 for details)
- `python/pvlayout_engine/tests/integration/test_cable_routing_constraints.py` (moved)

---

## Task 1: Scaffold `python/pvlayout_core/` package skeleton

**Files:**
- Create: `python/pvlayout_core/pyproject.toml`
- Create: `python/pvlayout_core/README.md`

- [ ] **Step 1.1: Create the new package directory and pyproject.toml**

```bash
mkdir -p /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_core
```

Then write `python/pvlayout_core/pyproject.toml`:

```toml
[project]
name = "pvlayout-core"
version = "0.0.0"
description = "SolarLayout domain logic — layout engine, parsers, exporters, energy yield. Vendored from PVlayout_Advance/{core,models,utils} at S1; extracted to a standalone package per cloud-offload spec D6."
readme = "README.md"
requires-python = ">=3.12"
license = { text = "Proprietary" }
authors = [
    { name = "SolarLayout" }
]
# Runtime dependencies — the domain libs the engine + future Lambdas
# both consume. Kept here (not in pvlayout-engine) per cloud-offload
# spec D4 + D6: pvlayout_core is the single source of solar-domain
# truth and owns its own dep graph.
dependencies = [
    "shapely>=2.0",
    "pyproj>=3.5",
    "simplekml>=1.3",
    "matplotlib>=3.7",
    "numpy>=1.24",
    "ezdxf>=1.0",
    "Pillow>=10.0",     # satellite tile fetch + preview PNG generation
    "requests>=2.32",   # PVGIS / NASA POWER irradiance fetch in energy_calculator
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3",
    "ruff>=0.8",
    "mypy>=1.13",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["pvlayout_core"]

[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "N", "UP", "B", "A", "C4", "SIM"]

[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]
# Slow tests are opt-in. Default `pytest tests/` (CI + local) skips
# anything marked `slow`. Mirrors pvlayout_engine's convention.
markers = [
    "slow: long-running test; opt-in (default skipped). One-time correctness audits, full PV engine on real KMZ fixtures, etc. Run on demand only.",
]
addopts = ["-m", "not slow"]
```

- [ ] **Step 1.2: Write the README**

Write `python/pvlayout_core/README.md`:

```markdown
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
```

- [ ] **Step 1.3: Verify directory + files exist**

Run:
```bash
ls -la /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_core/
```
Expected: `pyproject.toml` and `README.md` listed; nothing else yet.

- [ ] **Step 1.4: WIP commit**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git add python/pvlayout_core/pyproject.toml python/pvlayout_core/README.md
git commit -m "wip(c2): scaffold pvlayout_core package skeleton"
```

---

## Task 2: Move `pvlayout_core` source tree (core/, models/, utils/, __init__.py)

**Files:**
- Move: `python/pvlayout_engine/pvlayout_core/` → `python/pvlayout_core/pvlayout_core/`

- [ ] **Step 2.1: Move the package source via `git mv`**

`git mv` preserves history. Use it for the entire directory.

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git mv python/pvlayout_engine/pvlayout_core python/pvlayout_core/pvlayout_core
```

- [ ] **Step 2.2: Verify the move**

```bash
ls /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_core/pvlayout_core/
ls /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/ | grep -v pvlayout_core
```

Expected (first command): `__init__.py  core  models  utils` (and `__pycache__` if not gitignored — fine).
Expected (second command): everything except a `pvlayout_core` directory entry.

- [ ] **Step 2.3: Confirm no stray `__pycache__` in tracked tree**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git status --porcelain | grep pycache || echo "no pycache tracked"
```

Expected: `no pycache tracked` (pycache is gitignored — confirmed by inspecting `.gitignore` if uncertain).

- [ ] **Step 2.4: WIP commit**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git add python/pvlayout_core python/pvlayout_engine
git commit -m "wip(c2): move pvlayout_core source tree to python/pvlayout_core/"
```

---

## Task 3: Move KMZ fixtures + create test directory skeleton

**Files:**
- Move: `python/pvlayout_engine/tests/golden/kmz/` → `python/pvlayout_core/tests/golden/kmz/`
- Create: `python/pvlayout_core/tests/__init__.py`
- Create: `python/pvlayout_core/tests/{unit,parity,integration,golden}/__init__.py`

- [ ] **Step 3.1: Create the test directory skeleton**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
mkdir -p python/pvlayout_core/tests/unit
mkdir -p python/pvlayout_core/tests/parity
mkdir -p python/pvlayout_core/tests/integration
mkdir -p python/pvlayout_core/tests/golden
```

- [ ] **Step 3.2: Create empty `__init__.py` files**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
touch python/pvlayout_core/tests/__init__.py
touch python/pvlayout_core/tests/unit/__init__.py
touch python/pvlayout_core/tests/parity/__init__.py
touch python/pvlayout_core/tests/integration/__init__.py
touch python/pvlayout_core/tests/golden/__init__.py
```

- [ ] **Step 3.3: Move KMZ fixtures via `git mv`**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git mv python/pvlayout_engine/tests/golden/kmz python/pvlayout_core/tests/golden/kmz
```

- [ ] **Step 3.4: Verify the move**

```bash
ls /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_core/tests/golden/kmz/
ls /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/tests/golden/
```

Expected (first): 4 KMZ files: `Kudlugi Boundary (89 acres).kmz  complex-plant-layout.kmz  phaseboundary.kmz  phaseboundary2.kmz`.
Expected (second): `__init__.py  expected  test_layout_parity.py` (no `kmz/` subdir).

- [ ] **Step 3.5: WIP commit**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git add python/pvlayout_core/tests python/pvlayout_engine/tests/golden
git commit -m "wip(c2): create pvlayout_core test skeleton; relocate KMZ fixtures"
```

---

## Task 4: Move pure-core tests from engine to pvlayout_core

**Files:**
- Move 10 test files via `git mv` (history preserved).

- [ ] **Step 4.1: Move the unit test**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git mv python/pvlayout_engine/tests/unit/test_visibility_graph.py python/pvlayout_core/tests/unit/test_visibility_graph.py
```

- [ ] **Step 4.2: Move the 8 parity tests**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git mv python/pvlayout_engine/tests/parity/test_kmz_parser_parity.py python/pvlayout_core/tests/parity/test_kmz_parser_parity.py
git mv python/pvlayout_engine/tests/parity/test_la_placement_parity.py python/pvlayout_core/tests/parity/test_la_placement_parity.py
git mv python/pvlayout_engine/tests/parity/test_layout_engine_parity.py python/pvlayout_core/tests/parity/test_layout_engine_parity.py
git mv python/pvlayout_engine/tests/parity/test_p00_bundled_mst_parity.py python/pvlayout_core/tests/parity/test_p00_bundled_mst_parity.py
git mv python/pvlayout_engine/tests/parity/test_tracker_layout_engine_parity.py python/pvlayout_core/tests/parity/test_tracker_layout_engine_parity.py
git mv python/pvlayout_engine/tests/parity/test_solar_transposition_parity.py python/pvlayout_core/tests/parity/test_solar_transposition_parity.py
git mv python/pvlayout_engine/tests/parity/test_satellite_water_detector_parity.py python/pvlayout_core/tests/parity/test_satellite_water_detector_parity.py
git mv python/pvlayout_engine/tests/parity/test_energy_calculator_parity.py python/pvlayout_core/tests/parity/test_energy_calculator_parity.py
```

- [ ] **Step 4.3: Move the integration test (cable routing)**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git mv python/pvlayout_engine/tests/integration/test_cable_routing_constraints.py python/pvlayout_core/tests/integration/test_cable_routing_constraints.py
```

- [ ] **Step 4.4: Verify the engine's now-empty test dirs**

```bash
ls /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/tests/unit/
ls /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/tests/parity/
```

Both directories should now be effectively empty (only `__init__.py` and `__pycache__` remaining; no test files). Pytest's parametrization in the engine no longer touches these — that's correct.

- [ ] **Step 4.5: Remove now-empty unit/ and parity/ dirs from engine (delete `__init__.py`)**

These directories no longer carry any tests; their `__init__.py` files become dead weight. Remove them.

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git rm python/pvlayout_engine/tests/unit/__init__.py
git rm python/pvlayout_engine/tests/parity/__init__.py
# Remove the now-empty directories (will fail silently if anything still in them — that's a signal to investigate)
rmdir python/pvlayout_engine/tests/unit 2>/dev/null || echo "unit/ not empty or already gone"
rmdir python/pvlayout_engine/tests/parity 2>/dev/null || echo "parity/ not empty or already gone"
```

- [ ] **Step 4.6: Verify path-relative references in moved tests still resolve**

The moved tests use two path patterns. Spot-check both:

Pattern A — `KMZ_DIR = REPO_ROOT / "python/pvlayout_engine/tests/golden/kmz"` (parity tests at `python/pvlayout_core/tests/parity/`). After move, `parents[4]` from the new location is still repo root, but the path string still says `python/pvlayout_engine/...` — this is **stale and must be updated** in Step 4.7.

Pattern B — `KMZ_DIR = Path(__file__).resolve().parents[1] / "golden" / "kmz"` (test_cable_routing_constraints.py). After move to `python/pvlayout_core/tests/integration/`, `parents[1]` = `python/pvlayout_core/tests/`, so `/golden/kmz` resolves to `python/pvlayout_core/tests/golden/kmz` — **correct, no edit needed**.

- [ ] **Step 4.7: Update KMZ_DIR string in the 5 parity tests that reference engine path**

Files with the stale `python/pvlayout_engine/tests/golden/kmz` string (verified by grep in pre-plan recon):
- `python/pvlayout_core/tests/parity/test_kmz_parser_parity.py:26`
- `python/pvlayout_core/tests/parity/test_la_placement_parity.py:33`
- `python/pvlayout_core/tests/parity/test_layout_engine_parity.py:20`
- `python/pvlayout_core/tests/parity/test_p00_bundled_mst_parity.py:40`
- `python/pvlayout_core/tests/parity/test_tracker_layout_engine_parity.py:25`

For each file, change the line:
```python
KMZ_DIR = REPO_ROOT / "python/pvlayout_engine/tests/golden/kmz"
```
to:
```python
KMZ_DIR = REPO_ROOT / "python/pvlayout_core/tests/golden/kmz"
```

Use the Edit tool on each file with old_string = the line shown above, new_string = the updated line.

- [ ] **Step 4.8: Confirm no remaining stale references**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
grep -rEn "python/pvlayout_engine/tests/golden/kmz" python/pvlayout_core/ python/pvlayout_engine/
```

Expected: no matches in `python/pvlayout_core/`. The engine side may still have hits — those get fixed in Task 7.

- [ ] **Step 4.9: WIP commit**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git add python/pvlayout_core python/pvlayout_engine/tests
git commit -m "wip(c2): move pure-core tests + KMZ fixture-path references"
```

---

## Task 5: Verify pvlayout_core standalone — `uv sync` + `pytest` clean

This is the first acceptance gate: the new package builds + tests pass in isolation.

- [ ] **Step 5.1: Initialize the venv + sync deps**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_core
uv sync --extra dev
```

Expected: uv resolves shapely, pyproj, simplekml, matplotlib, numpy, ezdxf, Pillow, requests, pytest, ruff, mypy + transitive deps; creates `.venv/`; writes `uv.lock`. No errors.

- [ ] **Step 5.2: Run pytest collection-only — no slow tests**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_core
uv run pytest tests/ -q --collect-only 2>&1 | tail -20
```

Expected: 9 test files discovered (1 unit + 8 parity; cable_routing_constraints is `slow` and deselected). Test count > 0; no collection errors.

- [ ] **Step 5.3: Run the full default pytest**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_core
uv run pytest tests/ -q
```

Expected: All non-slow tests pass. Some `parity/` tests will be SKIPPED on machines lacking the legacy `PVlayout_Advance` repo at `/Users/arunkpatra/codebase/PVlayout_Advance` — that's correct behavior (their `sys.path.insert` + try/except `ImportError` causes a `pytest.skip`). On Arun's machine the legacy repo IS present, so most/all should run.

If any test fails for a reason other than environment (missing legacy repo, missing baseline JSON): **STOP**. Investigate. The move-only refactor must not change test outcomes.

- [ ] **Step 5.4: Sanity check — confirm `pvlayout_core` imports work from inside the new venv**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_core
uv run python -c "from pvlayout_core.core.layout_engine import run_layout_multi; from pvlayout_core.models.project import LayoutParameters; from pvlayout_core.utils.geo_utils import wgs84_to_utm; print('imports OK')"
```

Expected: `imports OK`.

- [ ] **Step 5.5: WIP commit (lockfile)**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git add python/pvlayout_core/uv.lock
git commit -m "wip(c2): pvlayout_core standalone — uv sync + pytest pass"
```

---

## Task 6: Re-wire `pvlayout_engine/pyproject.toml` to consume `pvlayout_core` as path-dep

**Files:**
- Modify: `python/pvlayout_engine/pyproject.toml`

- [ ] **Step 6.1: Rewrite the engine's pyproject.toml**

Use the Edit tool to make these changes to `python/pvlayout_engine/pyproject.toml`:

**Change 1** — replace the `dependencies` block. Old:

```toml
dependencies = [
    # Domain libs (vendored from PVlayout_Advance)
    "shapely>=2.0",
    "pyproj>=3.5",
    "simplekml>=1.3",
    "matplotlib>=3.7",
    "numpy>=1.24",
    "ezdxf>=1.0",
    "Pillow>=10.0",  # row #5: satellite tile fetch + preview PNG generation
    "requests>=2.32",  # row #8: PVGIS / NASA POWER irradiance fetch in energy_calculator

    # HTTP sidecar
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "pydantic>=2.9",
    "python-multipart>=0.0.20",  # /parse-kmz multipart upload support
]
```

New:

```toml
dependencies = [
    # Domain library (path-dep — see [tool.uv.sources] below). Brings
    # in shapely / pyproj / simplekml / matplotlib / numpy / ezdxf /
    # Pillow / requests transitively. Owned by python/pvlayout_core/
    # per cloud-offload spec D6.
    "pvlayout-core",

    # HTTP sidecar deps — engine-only.
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "pydantic>=2.9",
    "python-multipart>=0.0.20",  # /parse-kmz multipart upload support
]

[tool.uv.sources]
pvlayout-core = { path = "../pvlayout_core", editable = true }
```

**Change 2** — update the wheel-packages list. Old:

```toml
[tool.hatch.build.targets.wheel]
packages = ["pvlayout_engine", "pvlayout_core"]
```

New:

```toml
[tool.hatch.build.targets.wheel]
packages = ["pvlayout_engine"]
```

- [ ] **Step 6.2: Read back the modified file to confirm**

```bash
cat /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/pyproject.toml
```

Confirm: `dependencies` lists `pvlayout-core` first; domain libs no longer appear; `[tool.uv.sources]` block exists; wheel `packages` is just `["pvlayout_engine"]`.

- [ ] **Step 6.3: Re-sync the engine venv against the new pyproject**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv sync --extra dev
```

Expected: uv resolves the path-dep against `../pvlayout_core`, installs `pvlayout-core` editable, regenerates `uv.lock`. Domain libs come in transitively. No errors.

- [ ] **Step 6.4: Sanity check — engine venv can still import both packages**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run python -c "from pvlayout_core.core.layout_engine import run_layout_multi; from pvlayout_engine.server import build_app; print('imports OK')"
```

Expected: `imports OK`.

- [ ] **Step 6.5: WIP commit**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git add python/pvlayout_engine/pyproject.toml python/pvlayout_engine/uv.lock
git commit -m "wip(c2): pvlayout_engine consumes pvlayout_core via editable path-dep"
```

---

## Task 7: Update KMZ fixture paths in remaining engine tests

The KMZs moved to `python/pvlayout_core/tests/golden/kmz/`; 4 engine integration tests + 1 engine golden test still reference the old location.

**Files (all under `python/pvlayout_engine/tests/`):**
- Modify: `golden/test_layout_parity.py:38` — `KMZ_DIR = GOLDEN_DIR / "kmz"`
- Modify: `integration/test_export_dxf.py:35-38` — `KMZ_FIXTURE = parents[2] / "tests/golden/kmz/phaseboundary2.kmz"`
- Modify: `integration/test_export_kmz.py:30-33` — same shape
- Modify: `integration/test_export_pdf.py:34-37` — same shape
- Modify: `integration/test_layout_thumbnail.py:38-41` — same shape

- [ ] **Step 7.1: Update the engine's golden test KMZ_DIR**

In `python/pvlayout_engine/tests/golden/test_layout_parity.py`, change:

```python
GOLDEN_DIR = Path(__file__).resolve().parent
KMZ_DIR = GOLDEN_DIR / "kmz"
EXPECTED_DIR = GOLDEN_DIR / "expected"
```

to:

```python
GOLDEN_DIR = Path(__file__).resolve().parent
EXPECTED_DIR = GOLDEN_DIR / "expected"
# KMZ fixtures moved to pvlayout_core (their natural home) per cloud-offload C2.
# parents[3] from this file = repo_root/python/.
KMZ_DIR = (
    Path(__file__).resolve().parents[3]
    / "pvlayout_core/tests/golden/kmz"
)
```

Use the Edit tool with old_string = the 3-line block, new_string = the 8-line block (preserving exact indentation).

- [ ] **Step 7.2: Update test_export_dxf.py**

In `python/pvlayout_engine/tests/integration/test_export_dxf.py`, change:

```python
KMZ_FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "tests/golden/kmz/phaseboundary2.kmz"
)
```

to:

```python
# KMZ fixtures moved to pvlayout_core per cloud-offload C2.
# parents[3] from this file = repo_root/python/.
KMZ_FIXTURE = (
    Path(__file__).resolve().parents[3]
    / "pvlayout_core/tests/golden/kmz/phaseboundary2.kmz"
)
```

- [ ] **Step 7.3: Update test_export_kmz.py**

Same change as Step 7.2, but in `python/pvlayout_engine/tests/integration/test_export_kmz.py`.

- [ ] **Step 7.4: Update test_export_pdf.py**

Same change as Step 7.2, but in `python/pvlayout_engine/tests/integration/test_export_pdf.py`.

- [ ] **Step 7.5: Update test_layout_thumbnail.py**

Same change as Step 7.2, but in `python/pvlayout_engine/tests/integration/test_layout_thumbnail.py`.

- [ ] **Step 7.6: Verify no stale references remain in engine**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
grep -rEn "tests/golden/kmz" python/pvlayout_engine/ | grep -v "pvlayout_core/tests/golden/kmz"
```

Expected: no output. Every reference to `tests/golden/kmz` in the engine should now be prefixed with `pvlayout_core/`.

- [ ] **Step 7.7: WIP commit**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git add python/pvlayout_engine/tests
git commit -m "wip(c2): re-point engine tests at relocated KMZ fixtures"
```

---

## Task 8: Update `pvlayout_engine/README.md`

**Files:**
- Modify: `python/pvlayout_engine/README.md`

- [ ] **Step 8.1: Edit the README**

In `python/pvlayout_engine/README.md`, change the line:

```markdown
- **`pvlayout_core/`** — exact copy of `PVlayout_Advance/{core,models,utils}`. **Never modify.** Landed in **S1**.
```

to:

```markdown
- **`pvlayout_core/`** — extracted to its own package at `../pvlayout_core/` per cloud-offload C2 (spec D6). Engine consumes via editable path-dep declared in `[tool.uv.sources]`.
```

- [ ] **Step 8.2: Verify**

```bash
grep -A1 "pvlayout_core" /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/README.md
```

Expected: the new line shown above.

- [ ] **Step 8.3: WIP commit**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git add python/pvlayout_engine/README.md
git commit -m "wip(c2): update engine README to reflect pvlayout_core extraction"
```

---

## Task 9: Verify `pvlayout_engine` tests still pass post-extraction

This is the second acceptance gate: the engine's test suite is unchanged in outcome.

- [ ] **Step 9.1: Run the full engine test suite**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run pytest tests/ -q
```

Expected: **passed count drops by exactly the count we moved to pvlayout_core** (the moved tests are no longer collected here). The engine baseline was 128 passed, 7 skipped, 5 deselected. After the move, the engine should report ~120 passed (depending on how many of the moved tests were actually passing pre-move) + the same skip/deselect behavior on what remains. **No FAILURES.**

If any test fails: **STOP**. Most likely cause is a missed KMZ-path update — re-check Task 7's grep result.

- [ ] **Step 9.2: Spot-check one of the engine integration tests that uses the relocated KMZ**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run pytest tests/integration/test_export_kmz.py -q
```

Expected: pass (or appropriate skip). The KMZ fixture now lives in pvlayout_core; the test resolves the new path correctly.

- [ ] **Step 9.3: Spot-check the engine's golden parity test**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run pytest tests/golden/test_layout_parity.py -q
```

Expected: pass. The golden test parametrizes over `KMZ_DIR.glob("*.kmz")` — now points at pvlayout_core's location, finds the same 4 KMZ files, runs the same 4 parameterized tests against the same 4 expected JSONs (still in engine).

- [ ] **Step 9.4: No commit yet — verification only**

---

## Task 10: Add CI gate for `pvlayout_core`

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 10.1: Add the new job to ci.yml**

In `.github/workflows/ci.yml`, append a `core` job parallel to the existing `sidecar` job. Add this block at the bottom of the `jobs:` section (after the existing `sidecar` job's last step):

```yaml
  core:
    name: pvlayout_core (pytest)
    runs-on: ubuntu-22.04
    defaults:
      run:
        shell: bash
        working-directory: python/pvlayout_core
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install uv
        uses: astral-sh/setup-uv@v4
        with:
          enable-cache: true

      - name: Install Python deps
        run: uv sync --extra dev

      - name: pytest
        run: uv run pytest tests/ -q
```

Use the Edit tool with old_string = the last `- name: pytest` step from the existing `sidecar` job (with its surrounding context to make it unique), new_string = same step plus the new `core:` block above.

A safe edit shape: find the unique tail of `ci.yml`:

```yaml
      - name: pytest
        run: uv run pytest tests/ -q
```

(There's only one `- name: pytest` in the current file — that's the sidecar's. After this edit, there will be two: sidecar's and core's.)

Replace with:

```yaml
      - name: pytest
        run: uv run pytest tests/ -q

  core:
    name: pvlayout_core (pytest)
    runs-on: ubuntu-22.04
    defaults:
      run:
        shell: bash
        working-directory: python/pvlayout_core
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install uv
        uses: astral-sh/setup-uv@v4
        with:
          enable-cache: true

      - name: Install Python deps
        run: uv sync --extra dev

      - name: pytest
        run: uv run pytest tests/ -q
```

- [ ] **Step 10.2: Lint the YAML**

```bash
python3 -c "import yaml; yaml.safe_load(open('/Users/arunkpatra/codebase/pv_layout_project/.github/workflows/ci.yml'))" && echo "yaml OK"
```

Expected: `yaml OK`.

- [ ] **Step 10.3: Confirm both jobs are visible**

```bash
grep -E "^  [a-z]+:$" /Users/arunkpatra/codebase/pv_layout_project/.github/workflows/ci.yml
```

Expected: `frontend:`, `sidecar:`, `core:` (three job names).

- [ ] **Step 10.4: WIP commit**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git add .github/workflows/ci.yml
git commit -m "wip(c2): add pvlayout_core pytest job to ci.yml"
```

---

## Task 11: Run the full pre-commit gate

CLAUDE.md §8 defines this gate: lint + typecheck + test + build (frontend) plus pytest (sidecar). Now also pytest (core).

- [ ] **Step 11.1: Frontend gate**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all four green. If any fail, investigate — but lint/typecheck/test/build of the JS workspaces should be untouched by this row (it only modifies Python and one CI YAML).

- [ ] **Step 11.2: pvlayout_core pytest**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_core
uv run pytest tests/ -q
```

Expected: same as Step 5.3 — green.

- [ ] **Step 11.3: pvlayout_engine pytest**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine
uv run pytest tests/ -q
```

Expected: same as Step 9.1 — green.

- [ ] **Step 11.4: No commit — verification only**

If all four checks above are green, proceed to Task 12 for the row-close commit. If any fail, fix in place; do not flip C2 status until green.

---

## Task 12: Flip C2 status to `done` + atomic row-close commit

**Files:**
- Modify: `docs/superpowers/specs/2026-05-03-cloud-offload-architecture.md` (C2 row in §9)

- [ ] **Step 12.1: Edit the spec — flip C2 status**

In `docs/superpowers/specs/2026-05-03-cloud-offload-architecture.md`, find the C2 row's `Status:` line:

```
Status:   todo
```

Change to:

```
Status:   done (2026-05-03)
```

- [ ] **Step 12.2: Append plan + ship references at the end of the C2 row body**

Just before the `Out of scope` line of C2, after the `Acceptance` block, append:

```
Plan:     docs/superpowers/plans/2026-05-03-c2-extract-pvlayout-core.md
Shipped:  2026-05-03 — atomic commit `chore(c2): extract pvlayout_core to standalone package`
```

(Place them inside the row's outer code-block, as a plain text addition before `Out of scope` — match the visual convention used by C1's `Shipped:` footer.)

- [ ] **Step 12.3: Verify the spec edit**

```bash
grep -A2 "^#### C2" /Users/arunkpatra/codebase/pv_layout_project/docs/superpowers/specs/2026-05-03-cloud-offload-architecture.md | head -5
```

Expected: shows `Status:   done (2026-05-03)`.

- [ ] **Step 12.4: Squash WIP commits into one atomic row-close commit**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git log --oneline | head -15
```

Identify the commit immediately BEFORE the first `wip(c2):` commit; let's call its SHA `BASE_SHA`. Then:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git reset --soft <BASE_SHA>
git status
```

Expected: all C2 changes staged, no commits ahead of BASE_SHA.

(NOTE: `git reset --soft` is destructive in the sense that it changes branch state. Per CLAUDE.md "Executing actions with care": ASK ARUN BEFORE RUNNING THIS RESET — confirm BASE_SHA is correct and that he wants WIP commits squashed.)

- [ ] **Step 12.5: Create the atomic row-close commit**

After Arun confirms the squash:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git add -A
git commit -m "$(cat <<'EOF'
chore(c2): extract pvlayout_core to standalone package

Implements cloud-offload spec row C2 (locked decisions D4 + D6).

- Move python/pvlayout_engine/pvlayout_core/ → python/pvlayout_core/.
- New pvlayout_core pyproject owns domain deps (shapely/pyproj/
  simplekml/matplotlib/numpy/ezdxf/Pillow/requests) + dev extras.
- Move 10 pure-core tests (1 unit + 8 parity + 1 cable-routing
  integration) + 4 KMZ fixtures into pvlayout_core/tests/.
- Engine pyproject reduced to FastAPI sidecar deps; consumes
  pvlayout-core via [tool.uv.sources] editable path-dep.
- 4 engine integration tests + 1 engine golden test re-pointed
  at the relocated KMZ fixture path.
- New parallel `core` job in .github/workflows/ci.yml.

Engine sidecar continues to work unchanged during cutover; no
runtime behavior changes inside pvlayout_core (move only).

Plan: docs/superpowers/plans/2026-05-03-c2-extract-pvlayout-core.md

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 12.6: Final verification**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
git log --oneline | head -5
git status
```

Expected: top commit is the chore(c2) commit; working tree clean.

Then re-run the full gate one more time as paranoia:

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
bun run lint && bun run typecheck && bun run test && bun run build && \
  cd python/pvlayout_core && uv run pytest tests/ -q && \
  cd ../pvlayout_engine && uv run pytest tests/ -q
```

Expected: all green.

---

## Self-Review (post-write checklist)

**Spec coverage:**
- ✅ Acceptance: `python/pvlayout_core/pyproject.toml` exists; `uv sync` clean → Tasks 1, 5
- ✅ Acceptance: All existing tests under `pvlayout_core/tests/` pass under `cd python/pvlayout_core && uv run pytest` → Task 5.3
- ✅ Acceptance: `python/pvlayout_engine/pyproject.toml` updated to reference `pvlayout_core` as `{path = "../pvlayout_core", editable = true}` → Task 6.1
- ✅ Acceptance: All sidecar tests still pass → Task 9.1
- ✅ Acceptance: CI gate added: `python/pvlayout_core/` has its own pytest job → Task 10
- ✅ Out of scope respected: no code changes inside pvlayout_core (only moves); no Lambda use; engine path-dep maintained
- ✅ Locked decisions D4 + D6 honored

**Placeholder scan:**
- No "TBD" / "TODO" / "implement later"
- No "add appropriate error handling" stubs
- Every step has the actual command or content

**Type/path consistency:**
- KMZ_DIR after-state path consistent across all 5 affected engine tests + 5 affected core parity tests
- pyproject.toml [tool.uv.sources] table syntax matches uv 0.5+ convention
- ci.yml job structure matches existing `sidecar` job's pattern

**Risk callouts:**
- Step 12.4 (`git reset --soft` to squash WIPs) is the only destructive action; explicitly flagged for human confirmation. CLAUDE.md "Executing actions with care" applies.
- Tasks 5 + 9 are the verification gates — if either fails, the row is not done.
