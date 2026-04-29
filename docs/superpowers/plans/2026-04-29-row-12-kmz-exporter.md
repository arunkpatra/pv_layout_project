# Row #12 Implementation Plan — KMZ exporter wiring

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing `pvlayout_core.core.kmz_exporter.export_kmz` into a new `POST /export-kmz` sidecar route, and verify legacy ↔ new produce byte-identical inner KML XML.

**Architecture:** Pure integration — no changes to `pvlayout_core/core/kmz_exporter.py` (legacy diff is empty; only import-prefix differs and the new app's `pvlayout_core.X` prefix is correct). Add `ExportKmzRequest` schema, `routes/kmz.py` (mirrors `routes/dxf.py` from row #10 and `routes/pdf.py` from row #11), and one server-side registration line. Three integration tests: HTTP smoke + empty-input 422 + byte-equivalence against legacy via sys.path bootstrap on `phaseboundary2.kmz`.

**Tech Stack:** Python 3.13, FastAPI, simplekml 1.3+ (already in deps), pytest, stdlib `zipfile`. uv-managed venv. No new deps.

**Spec:** [docs/superpowers/specs/2026-04-29-row-12-kmz-exporter-design.md](../specs/2026-04-29-row-12-kmz-exporter-design.md)

**Note:** This is the **last row of the parity sweep**. After this lands, all 12 rows are `done` and the accumulated T3 memos route to Prasanta in a single end-of-port pass.

---

## File map

- **Modify:** `python/pvlayout_engine/pvlayout_engine/schemas.py` — add `ExportKmzRequest` after `ExportPdfRequest`.
- **Create:** `python/pvlayout_engine/pvlayout_engine/routes/kmz.py` — `POST /export-kmz` endpoint.
- **Modify:** `python/pvlayout_engine/pvlayout_engine/server.py` — import + register `kmz_router`.
- **Create:** `python/pvlayout_engine/tests/integration/test_export_kmz.py` — 3 tests.
- **Modify:** `docs/PLAN.md` — row #12 status `todo` → `done`; header `11 / 12 done` → `12 / 12 done`.
- **No changes** to `pvlayout_core/core/kmz_exporter.py`.

---

## Pre-flight (one-time)

- [ ] **Step 0.1: Verify legacy repo state**

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance && git rev-parse baseline-v1-20260429
```

Expected: `397aa2ab460d8f773376f51b393407e5be67dca0`.

- [ ] **Step 0.2: Verify clean working tree on main**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git status -s && git rev-parse --abbrev-ref HEAD
```

Expected: empty status, `main` branch.

- [ ] **Step 0.3: Verify baseline pytest is green**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: `111 passed, 6 skipped, 0 failed` (post-row-#11 baseline).

- [ ] **Step 0.4: Verify required KMZ fixture exists**

```bash
ls /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/tests/golden/kmz/phaseboundary2.kmz
```

Expected: file listed.

- [ ] **Step 0.5: Verify no diff in kmz_exporter.py vs legacy**

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance && git show baseline-v1-20260429:core/kmz_exporter.py > /tmp/legacy_kmz_exporter.py
diff -q /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/pvlayout_core/core/kmz_exporter.py /tmp/legacy_kmz_exporter.py 2>&1 | head
```

Expected: files differ (because of import-prefix). The actual diff content should be limited to the import-prefix lines:

```bash
diff /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine/pvlayout_core/core/kmz_exporter.py /tmp/legacy_kmz_exporter.py | grep -E "^[<>]"
```

Expected output: only 4 lines, two changed-from / two changed-to:
```
< from pvlayout_core.models.project import LayoutResult, LayoutParameters, DesignMode
< from pvlayout_core.utils.geo_utils import utm_to_wgs84
> from models.project import LayoutResult, LayoutParameters, DesignMode
> from utils.geo_utils import utm_to_wgs84
```

If anything else differs, **stop** and surface to the user — the row's "no legacy drift" premise is wrong and the spec needs to be revisited.

---

## Task 1: Add `ExportKmzRequest` schema

**Files:**
- Modify: `python/pvlayout_engine/pvlayout_engine/schemas.py`

`ExportPdfRequest` (added in row #11) is the immediate-prior anchor. Add `ExportKmzRequest` immediately after it, before the `# Health + error payloads` block.

- [ ] **Step 1.1: Add the schema**

Open `python/pvlayout_engine/pvlayout_engine/schemas.py`. Locate the closing of `ExportPdfRequest` (the line `    edition: str = "pro_plus"`). Immediately after that line and before the `# ---` comment block for "Health + error payloads", insert:

```python


class ExportKmzRequest(_Model):
    """POST /export-kmz body — multi-result layout to KMZ.

    Per ADR-0005 + session.py:105, exports are ungated (no require_feature
    dependency on the route). No toggle flags — KMZ exporter renders all
    layout elements unconditionally (matches legacy behavior).
    """

    results: list[LayoutResult]
    params: LayoutParameters
```

- [ ] **Step 1.2: Verify the schema imports cleanly**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run python -c "
from pvlayout_engine.schemas import ExportKmzRequest
print('fields:', list(ExportKmzRequest.model_fields))
print('ok')
"
```

Expected: `fields: ['results', 'params']` then `ok`.

- [ ] **Step 1.3: Commit (wip)**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git add python/pvlayout_engine/pvlayout_engine/schemas.py && git commit -m "wip: row #12 — add ExportKmzRequest schema"
```

---

## Task 2: Create `routes/kmz.py`

**Files:**
- Create: `python/pvlayout_engine/pvlayout_engine/routes/kmz.py`

- [ ] **Step 2.1: Write the route module**

Create `python/pvlayout_engine/pvlayout_engine/routes/kmz.py` with this exact content:

```python
"""POST /export-kmz — export multi-result layout to KMZ.

Row #12 of docs/PLAN.md. Wraps pvlayout_core.core.kmz_exporter.export_kmz
in a FastAPI route. Per ADR-0005 + session.py:105, exports are ungated.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response

from pvlayout_engine.adapters import params_to_core, result_to_core
from pvlayout_engine.schemas import ExportKmzRequest


router = APIRouter(tags=["export"])


@router.post(
    "/export-kmz",
    summary="Export multi-result layout to a KMZ file",
    response_class=Response,
    responses={200: {"content": {"application/vnd.google-earth.kmz": {}}}},
)
def export_kmz_route(request: ExportKmzRequest) -> Response:
    """Convert wire LayoutResult[] back to core, write KMZ to tempfile,
    return as application/vnd.google-earth.kmz binary.
    """
    from pvlayout_core.core.kmz_exporter import export_kmz

    if not request.results:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="results must be non-empty",
        )

    core_results = [result_to_core(r) for r in request.results]
    core_params = params_to_core(request.params)

    with tempfile.NamedTemporaryFile(suffix=".kmz", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    try:
        export_kmz(core_results, core_params, str(tmp_path))
        data = tmp_path.read_bytes()
    finally:
        tmp_path.unlink(missing_ok=True)

    return Response(
        content=data,
        media_type="application/vnd.google-earth.kmz",
        headers={"Content-Disposition": 'attachment; filename="layout.kmz"'},
    )
```

The handler is named `export_kmz_route` to avoid shadowing the imported `export_kmz`.

- [ ] **Step 2.2: Verify the route module imports cleanly**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run python -c "
from pvlayout_engine.routes.kmz import router as kmz_router
print('routes:', [r.path for r in kmz_router.routes])
"
```

Expected: `routes: ['/export-kmz']`.

- [ ] **Step 2.3: Commit (wip)**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git add python/pvlayout_engine/pvlayout_engine/routes/kmz.py && git commit -m "wip: row #12 — add POST /export-kmz route"
```

---

## Task 3: Wire `kmz_router` in `server.py`

**Files:**
- Modify: `python/pvlayout_engine/pvlayout_engine/server.py`

- [ ] **Step 3.1: Add the import**

Open `python/pvlayout_engine/pvlayout_engine/server.py`. Locate the route imports block (which currently includes `dxf_router`, `layout_router`, `pdf_router`, `session_router`, `water_router` after rows #10 and #11). Add the `kmz_router` import in alphabetical order — between `dxf_router` and `layout_router`:

```python
from pvlayout_engine.routes.dxf import router as dxf_router
from pvlayout_engine.routes.kmz import router as kmz_router
from pvlayout_engine.routes.layout import router as layout_router
from pvlayout_engine.routes.pdf import router as pdf_router
from pvlayout_engine.routes.session import router as session_router
from pvlayout_engine.routes.water import router as water_router
```

- [ ] **Step 3.2: Register the router under `authed`**

Locate the existing PDF block (added in row #11):

```python
    # --- Export route (Row #11) ---------------------------------------------
    # /export-pdf — multi-result layout to PDF (summary pages); token-gated.
    # Page 1 (layout plot) is omitted — no server-side equivalent for legacy's
    # PyQt5 figure yet. Per ADR-0005, exports are ungated at the entitlements
    # layer.
    authed.include_router(pdf_router)

    app.include_router(authed)
```

Insert the KMZ block immediately after the PDF block, before `app.include_router(authed)`:

```python
    # --- Export route (Row #11) ---------------------------------------------
    # /export-pdf — multi-result layout to PDF (summary pages); token-gated.
    # Page 1 (layout plot) is omitted — no server-side equivalent for legacy's
    # PyQt5 figure yet. Per ADR-0005, exports are ungated at the entitlements
    # layer.
    authed.include_router(pdf_router)

    # --- Export route (Row #12) ---------------------------------------------
    # /export-kmz — multi-result layout to KMZ; token-gated. Per ADR-0005,
    # exports are ungated at the entitlements layer (no require_feature).
    # KMZ exporter has no toggle flags — renders all layout elements
    # unconditionally.
    authed.include_router(kmz_router)

    app.include_router(authed)
```

- [ ] **Step 3.3: Verify the app builds and exposes /export-kmz**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run python -c "
from pvlayout_engine.config import SidecarConfig
from pvlayout_engine.server import build_app

cfg = SidecarConfig(host='127.0.0.1', port=0, token='probe', version='0.0.0+probe')
app = build_app(cfg)
paths = sorted(r.path for r in app.routes if hasattr(r, 'path'))
print([p for p in paths if 'export' in p])
"
```

Expected: `['/export-dxf', '/export-kmz', '/export-pdf']`.

- [ ] **Step 3.4: Run existing pytest (no regression)**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: `111 passed, 6 skipped, 0 failed`.

- [ ] **Step 3.5: Commit (wip)**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git add python/pvlayout_engine/pvlayout_engine/server.py && git commit -m "wip: row #12 — register kmz_router in server.py"
```

---

## Task 4: Integration tests

**Files:**
- Create: `python/pvlayout_engine/tests/integration/test_export_kmz.py`

3 tests: HTTP smoke + empty-results 422 + byte-equivalence vs legacy via sys.path bootstrap.

- [ ] **Step 4.1: Build the test module**

Create `python/pvlayout_engine/tests/integration/test_export_kmz.py` with this exact content:

```python
"""Sidecar /export-kmz route + byte-equivalence vs legacy (Row #12 of docs/PLAN.md).

Endpoint tests: smoke (HTTP contract + zip+KML sniff), empty-input 422.
Byte-equivalence: legacy ↔ new export_kmz on the same LayoutResult[]
produce identical inner KML XML. Sys.path bootstrap fixture mirrors
rows #6/#7/#8/#9/#10 patterns. The new app's kmz_exporter.py has no
diff against legacy (only import-prefix differs), so byte-equality is
the strongest claim — any drift would be either a port bug or
upstream simplekml nondeterminism.
"""

from __future__ import annotations

import sys
import zipfile
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from pvlayout_engine.adapters import result_from_core
from pvlayout_engine.config import SidecarConfig
from pvlayout_engine.server import build_app


TEST_TOKEN = "row12-export-kmz-test-token-abcdefghij"
LEGACY_REPO = Path("/Users/arunkpatra/codebase/PVlayout_Advance")
KMZ_FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "tests/golden/kmz/phaseboundary2.kmz"
)


# ---------------------------------------------------------------------------
# Module-scoped fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def client() -> TestClient:
    config = SidecarConfig(
        host="127.0.0.1",
        port=0,
        token=TEST_TOKEN,
        version="0.0.0+row12-test",
    )
    return TestClient(build_app(config))


def auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {TEST_TOKEN}"}


@pytest.fixture(scope="module")
def core_layout_results() -> list:
    """Run parse_kmz + run_layout_multi on phaseboundary2.kmz; filter to
    valid (usable_polygon non-None) results."""
    from pvlayout_core.core.kmz_parser import parse_kmz
    from pvlayout_core.core.layout_engine import run_layout_multi
    from pvlayout_core.models.project import LayoutParameters

    parsed = parse_kmz(str(KMZ_FIXTURE))
    params = LayoutParameters()
    results = run_layout_multi(
        boundaries=parsed.boundaries,
        params=params,
        centroid_lat=parsed.centroid_lat,
        centroid_lon=parsed.centroid_lon,
    )
    valid = [r for r in results if r.usable_polygon is not None]
    assert valid, "expected at least one valid LayoutResult from phaseboundary2.kmz"
    return valid


@pytest.fixture(scope="module")
def export_request_body(core_layout_results) -> dict[str, Any]:
    """Wire-shape body for POST /export-kmz."""
    from pvlayout_engine.schemas import LayoutParameters as WireParams

    wire_results = [result_from_core(r) for r in core_layout_results]
    return {
        "results": [r.model_dump(mode="json") for r in wire_results],
        "params": WireParams().model_dump(mode="json"),
    }


def _purge_legacy_modules() -> None:
    """Remove cached bare-namespace modules so legacy and new-app
    namespaces don't collide. Legacy's kmz_exporter imports from
    models.* and utils.*; layout_engine imports from core.*."""
    for m in list(sys.modules):
        if (
            m == "core" or m.startswith("core.")
            or m == "models" or m.startswith("models.")
            or m == "utils" or m.startswith("utils.")
        ):
            del sys.modules[m]


@pytest.fixture(scope="module")
def legacy_kmz():
    """Module-scoped sys.path bootstrap → yields legacy export_kmz +
    parse_kmz / run_layout_multi / project module so the byte-equivalence
    test can build a legacy LayoutResult[] of equivalent shape."""
    if not LEGACY_REPO.exists():
        pytest.skip(f"legacy repo not at {LEGACY_REPO}")
    _purge_legacy_modules()
    sys.path.insert(0, str(LEGACY_REPO))
    try:
        from core.kmz_exporter import export_kmz as legacy_export
        from core import kmz_parser as legacy_parser
        from core import layout_engine as legacy_engine
        from models import project as legacy_project
        yield (legacy_export, legacy_parser, legacy_engine, legacy_project)
    finally:
        try:
            sys.path.remove(str(LEGACY_REPO))
        except ValueError:
            pass
        _purge_legacy_modules()


def _read_kml_from_kmz(kmz_path: Path) -> bytes:
    """KMZ is a zip; the main KML is conventionally the first .kml member
    (simplekml writes 'doc.kml' by default). Returns the raw KML XML bytes."""
    with zipfile.ZipFile(kmz_path, "r") as zf:
        kml_names = [n for n in zf.namelist() if n.endswith(".kml")]
        assert len(kml_names) == 1, f"expected exactly one .kml member, got {kml_names}"
        return zf.read(kml_names[0])


# ---------------------------------------------------------------------------
# Endpoint tests
# ---------------------------------------------------------------------------


def test_export_kmz_smoke(
    client: TestClient,
    export_request_body: dict[str, Any],
    tmp_path: Path,
) -> None:
    """POST /export-kmz returns a valid KMZ (zip with one .kml member)."""
    resp = client.post("/export-kmz", headers=auth(), json=export_request_body)
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "application/vnd.google-earth.kmz"
    assert "layout.kmz" in resp.headers.get("content-disposition", "")
    # Zip magic bytes: PK\x03\x04
    assert resp.content.startswith(b"PK\x03\x04"), "missing zip magic header"

    # Write to tmp file and verify it parses as a zip with one .kml member
    out_path = tmp_path / "out.kmz"
    out_path.write_bytes(resp.content)
    kml_bytes = _read_kml_from_kmz(out_path)
    assert kml_bytes.startswith(b"<?xml"), "KML missing XML declaration"
    assert b"<kml" in kml_bytes[:200], "KML missing <kml> root tag near start"


def test_export_kmz_empty_results_returns_422(client: TestClient) -> None:
    """results=[] returns 422 with explicit message."""
    from pvlayout_engine.schemas import LayoutParameters as WireParams

    body = {
        "results": [],
        "params": WireParams().model_dump(mode="json"),
    }
    resp = client.post("/export-kmz", headers=auth(), json=body)
    assert resp.status_code == 422
    assert resp.json()["detail"] == "results must be non-empty"


# ---------------------------------------------------------------------------
# Legacy byte-equivalence — the row's acceptance bar
# ---------------------------------------------------------------------------


def test_export_kmz_byte_equivalent_to_legacy(
    legacy_kmz, tmp_path: Path
) -> None:
    """Legacy ↔ new export_kmz produce byte-identical inner KML XML.

    The new app's pvlayout_core/core/kmz_exporter.py has no diff against
    legacy (only import-prefix differs). With identical input results +
    same simplekml version, the generated KML XML should match byte-for-byte.

    Fallback if simplekml is non-deterministic: normalize before
    comparing, e.g. `re.sub(rb"<TimeStamp>.*?</TimeStamp>", b"", kml)`.
    Default is strict equality; only loosen on observed drift.
    """
    legacy_export, legacy_parser, legacy_engine, legacy_project = legacy_kmz

    # --- Build legacy core LayoutResult[] from the same KMZ fixture ---
    legacy_parsed = legacy_parser.parse_kmz(str(KMZ_FIXTURE))
    legacy_params = legacy_project.LayoutParameters()
    legacy_results = legacy_engine.run_layout_multi(
        boundaries=legacy_parsed.boundaries,
        params=legacy_params,
        centroid_lat=legacy_parsed.centroid_lat,
        centroid_lon=legacy_parsed.centroid_lon,
    )
    legacy_valid = [r for r in legacy_results if r.usable_polygon is not None]

    # --- Build new core LayoutResult[] from the same fixture ---
    # pvlayout_core.* is a different namespace from bare `core.*`, so it
    # resolves cleanly even with LEGACY_REPO on sys.path.
    from pvlayout_core.core.kmz_parser import parse_kmz as new_parse_kmz
    from pvlayout_core.core.layout_engine import run_layout_multi as new_run_layout_multi
    from pvlayout_core.core.kmz_exporter import export_kmz as new_export
    from pvlayout_core.models.project import LayoutParameters as NewParams

    new_parsed = new_parse_kmz(str(KMZ_FIXTURE))
    new_params = NewParams()
    new_results = new_run_layout_multi(
        boundaries=new_parsed.boundaries,
        params=new_params,
        centroid_lat=new_parsed.centroid_lat,
        centroid_lon=new_parsed.centroid_lon,
    )
    new_valid = [r for r in new_results if r.usable_polygon is not None]

    assert len(legacy_valid) == len(new_valid), (
        f"valid-result count drift: legacy {len(legacy_valid)} vs new {len(new_valid)}"
    )

    # --- Write both KMZs ---
    legacy_kmz_path = tmp_path / "legacy.kmz"
    new_kmz_path = tmp_path / "new.kmz"

    legacy_export(legacy_valid, legacy_params, str(legacy_kmz_path))
    new_export(new_valid, new_params, str(new_kmz_path))

    # --- Extract inner KML and compare bytes ---
    legacy_kml = _read_kml_from_kmz(legacy_kmz_path)
    new_kml = _read_kml_from_kmz(new_kmz_path)

    if legacy_kml != new_kml:
        # Helpful diagnostic on mismatch — find the first differing byte.
        n = min(len(legacy_kml), len(new_kml))
        for i in range(n):
            if legacy_kml[i] != new_kml[i]:
                ctx_start = max(0, i - 40)
                ctx_end = min(n, i + 40)
                pytest.fail(
                    f"inner KML diverges at byte {i} "
                    f"(legacy len {len(legacy_kml)} vs new len {len(new_kml)}). "
                    f"Legacy ctx: {legacy_kml[ctx_start:ctx_end]!r}; "
                    f"New ctx:    {new_kml[ctx_start:ctx_end]!r}"
                )
        pytest.fail(
            f"inner KML length drift: legacy {len(legacy_kml)} vs new {len(new_kml)} "
            f"(prefix-equal up to byte {n})"
        )
```

- [ ] **Step 4.2: Run only the new test file**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run pytest tests/integration/test_export_kmz.py -v 2>&1 | tail -15
```

Expected: 3 tests pass — `test_export_kmz_smoke`, `test_export_kmz_empty_results_returns_422`, `test_export_kmz_byte_equivalent_to_legacy`.

If the **smoke test** fails on `_read_kml_from_kmz`'s assertion `expected exactly one .kml member`: simplekml may have changed its output format. Inspect the raw response with `zipfile.ZipFile(out_path).namelist()` to see what's actually in the archive.

If the **byte-equivalence test** fails with a diff at a specific position: read the assertion's diagnostic output to find the differing context. Common culprits:
- `<TimeStamp>` element with a runtime stamp → add `re.sub(rb"<TimeStamp>.*?</TimeStamp>", b"", kml)` normalization to both sides before compare. Document the magnitude in a comment.
- A `<atom:link>` element with a URL that includes a session ID → strip similarly.
- A version-stamp drift (different simplekml versions on the two sides) → ensure both fixtures use the same simplekml installation. The fixtures both run inside the same venv/process, so this shouldn't happen, but if it does, the legacy reference repo may be using a different simplekml than the sidecar.

If the byte-equivalence test fails with a *real port bug* (e.g., a placemark missing in one side): treat as a regression in `kmz_exporter.py` — re-read the file against legacy.

- [ ] **Step 4.3: Run full pytest suite**

```bash
uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: `114 passed, 6 skipped, 0 failed` (was 111 → +3 new tests).

- [ ] **Step 4.4: Commit (wip)**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git add python/pvlayout_engine/tests/integration/test_export_kmz.py && git commit -m "wip: row #12 — integration tests for /export-kmz (smoke, 422, byte-equivalence vs legacy)"
```

---

## Task 5: Flip PLAN.md, run final pytest, squash to `parity:` commit

This row's commit history at this point:

```
[wip 4] integration tests for /export-kmz
[wip 3] register kmz_router in server.py
[wip 2] add POST /export-kmz route
[wip 1] add ExportKmzRequest schema
[plan]  docs: row #12 plan — KMZ exporter wiring     ← will be created in Step 5.4
[spec]  docs: row #12 spec — KMZ exporter wiring     ← already pushed
```

Wait — this plan file *itself* is committed before this task runs. So at this point the actual history is:

```
[wip 4]
[wip 3]
[wip 2]
[wip 1]
[plan]  docs: row #12 plan — KMZ exporter wiring     ← committed when the writing-plans skill saved this file
[spec]  docs: row #12 spec — KMZ exporter wiring
```

The `parity:` commit squashes only **wip 1–4** plus the **PLAN.md edit**. Soft-reset target is the `[plan]` commit, so spec + plan stay as separate commits.

- [ ] **Step 5.1: Update PLAN.md row #12 status and header**

Open `docs/PLAN.md`. Two edits:

(a) Header status — change:

```markdown
**Status:** 11 / 12 done.
```

to:

```markdown
**Status:** 12 / 12 done.
```

(b) Row #12 — change:

```markdown
| 12 | KMZ exporter — wiring | T1 | `core/kmz_exporter.py` (no legacy drift; integration gap) | Exporter wired; new app produces legacy-equivalent KMZ. | todo |
```

to:

```markdown
| 12 | KMZ exporter — wiring | T1 | `core/kmz_exporter.py` (no legacy drift; integration gap) | Exporter wired; new app produces legacy-equivalent KMZ. | **done** |
```

- [ ] **Step 5.2: Final pytest gate**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project/python/pvlayout_engine && uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: `114 passed, 6 skipped, 0 failed`.

- [ ] **Step 5.3: Inspect commits to squash**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git log --oneline origin/main..HEAD
```

Expected ordering (top = most recent):
1. `wip: row #12 — integration tests for /export-kmz (smoke, 422, byte-equivalence vs legacy)`
2. `wip: row #12 — register kmz_router in server.py`
3. `wip: row #12 — add POST /export-kmz route`
4. `wip: row #12 — add ExportKmzRequest schema`
5. `docs: row #12 plan — KMZ exporter wiring`
6. `docs: row #12 spec — KMZ exporter wiring`

The plan commit (5) and spec commit (6) are *not* squashed — they stay as separate commits.

- [ ] **Step 5.4: Soft reset to the *plan* commit (not the spec commit)**

This is the row #11 squash bug fixed: target the **plan** commit, not the spec commit, so the plan stays as a separate commit and only wips + PLAN.md edit get squashed.

```bash
PLAN_COMMIT=$(git log --grep="docs: row #12 plan" --format=%H -n 1) && \
echo "Reset target (plan commit): $PLAN_COMMIT" && \
git reset --soft $PLAN_COMMIT
```

Expected: `Reset target (plan commit): <some sha>`. Verify with:

```bash
git log --oneline -3
```

Expected:
```
<plan sha>  docs: row #12 plan — KMZ exporter wiring
<spec sha>  docs: row #12 spec — KMZ exporter wiring
<...prior parity:row#11 commit and earlier...>
```

(The 4 wip commits are gone from history; their contents are now in the staging area + working tree.)

Stage all five row-#12 outputs (PLAN.md edit + 4 squashed-from-wip files):

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git add \
    docs/PLAN.md \
    python/pvlayout_engine/pvlayout_engine/schemas.py \
    python/pvlayout_engine/pvlayout_engine/routes/kmz.py \
    python/pvlayout_engine/pvlayout_engine/server.py \
    python/pvlayout_engine/tests/integration/test_export_kmz.py
```

Verify staging:

```bash
git status -s
```

Expected: 5 files staged (`A` for the new files, `M` for `docs/PLAN.md`, `schemas.py`, `server.py`), working tree otherwise clean.

- [ ] **Step 5.5: Create the final atomic commit**

```bash
git commit -m "$(cat <<'EOF'
parity: row #12 — KMZ exporter wiring

Wire the existing pvlayout_core.core.kmz_exporter.export_kmz into a
new sidecar route POST /export-kmz at pvlayout_engine/routes/kmz.py.
Mirrors routes/dxf.py (row #10) and routes/pdf.py (row #11): takes
wire LayoutResult[] + LayoutParameters, runs through the existing
result_to_core / params_to_core adapters, writes KMZ to a tempfile,
returns application/vnd.google-earth.kmz binary with
Content-Disposition.

No code changes to pvlayout_core/core/kmz_exporter.py — legacy diff
is empty (only import-prefix differs; new app's pvlayout_core.X
prefix is correct). simplekml>=1.3 already in pyproject.toml.

ExportKmzRequest added to schemas.py; kmz_router registered under
authed in server.py. Per ADR-0005 + session.py:105, exports are
ungated (no require_feature dependency on the route).

Three integration tests in tests/integration/test_export_kmz.py:
  - test_export_kmz_smoke: 200 + zip magic + valid inner KML
  - test_export_kmz_empty_results_returns_422
  - test_export_kmz_byte_equivalent_to_legacy: sys.path bootstrap;
    runs both legacy and new export_kmz on phaseboundary2.kmz and
    asserts byte-identical inner KML XML. Diagnostic on mismatch
    pinpoints the first differing byte with surrounding context.
    Fallback (regex-strip <TimeStamp>) documented in test docstring
    if simplekml is non-deterministic on a future upgrade.

Sidecar pytest: 114 passed, 6 skipped, 0 failed (was 111 → +3).

T1 ceremony — no discovery memo.

PLAN.md row #12 flipped to done; status header bumped 11/12 → 12/12.

═══════════════════════════════════════════════════════════════════
PARITY SWEEP COMPLETE — all 12 rows of docs/PLAN.md are now done.
═══════════════════════════════════════════════════════════════════

Row catalog:
  #1  Project model field additions          (T1, done)
  #2  LA placement algorithm                 (T2, done)
  #3  Bundled DC + MST AC cabling            (T2, P0 done before sprint)
  #4  KMZ parser + water/canal/TL detection  (T3, finding #001)
  #5  Satellite water-body detection         (T3, finding #002)
  #6  Layout engine + water-body integration (T2, done)
  #7  Solar transposition (HSAT GHI→GTI)     (T3, finding #003)
  #8  Energy calculator + SAT GTI fix        (T3, finding #004)
  #9  Single-axis-tracker layout mode        (T3, finding #005)
  #10 DXF exporter (LA + cable layers)       (T1, done)
  #11 PDF exporter (tweaks)                  (T1, done)
  #12 KMZ exporter wiring                    (T1, this commit)

Five accumulated T3 discovery memos (rows #4/#5/#7/#8/#9) live at
docs/parity/findings/ and route to Prasanta in a single end-of-port
review pass per the 2026-04-29 policy. Refinements, if any, become
follow-up rows raised after this sweep closes.

Per CLAUDE.md §2 and PLAN.md "Out of scope (deferred)", post-parity
work resumes:
  - End-of-port solar-domain review with Prasanta
  - Retirement-trigger criteria evaluation for legacy app
  - New app UI/UX work (drawing tools, dark theme polish, design-
    system extensions, subscription gating, telemetry events)
  - Single-app-paradigm enforcement (entitlement-gated feature
    exposure)
  - External contract refactors (feature-key registry expansions,
    sidecar API versioning)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5.6: Final verification**

```bash
cd /Users/arunkpatra/codebase/pv_layout_project && git log --oneline origin/main..HEAD
```

Expected: exactly 3 commits ahead of `origin/main`:
1. `docs: row #12 spec — KMZ exporter wiring`
2. `docs: row #12 plan — KMZ exporter wiring`
3. `parity: row #12 — KMZ exporter wiring`

```bash
cd python/pvlayout_engine && uv run pytest tests/ -q 2>&1 | tail -3
```

Expected: `114 passed, 6 skipped, 0 failed`.

Verify PLAN.md:

```bash
grep "^**Status:**" /Users/arunkpatra/codebase/pv_layout_project/docs/PLAN.md
```

Expected: `**Status:** 12 / 12 done.`

- [ ] **Step 5.7: Hand off to user with sweep-close summary**

Report:
- Pytest count: `114 passed, 6 skipped, 0 failed`
- The 3 unpushed commits' shortlog
- **Parity sweep is complete — all 12 rows `done`.**
- Reminder: `git push` is the next user-controlled step.
- Five accumulated T3 memos in `docs/parity/findings/` are ready for end-of-port routing to Prasanta.
- Per CLAUDE.md §2 + PLAN.md "Out of scope": post-parity work resumes when ready (UI/UX, single-app-paradigm enforcement, external contract refactors, retirement-trigger criteria).

---

## Verification matrix

| Spec section | Plan task | Verification |
|---|---|---|
| 2.1 No changes to `kmz_exporter.py` | (implicit) | Pre-flight 0.5 confirms only import-prefix differs |
| 2.2 EDIT `schemas.py` (`ExportKmzRequest`) | Task 1 | Step 1.2 schema verify |
| 2.3 CREATE `routes/kmz.py` | Task 2 | Step 2.2 import + Task 4 tests |
| 2.4 EDIT `server.py` (register `kmz_router`) | Task 3 | Step 3.3 OpenAPI path probe |
| 2.5 No other touch-points | (implicit) | Step 3.4 confirms no regression |
| 3 Three tests | Task 4 | 3 tests pass |
| 4 Acceptance: 0 failed pytest, route registered, byte-equivalence, PLAN flipped | Task 5 | Steps 5.2 + 5.6 |
| 4 Acceptance: atomic `parity:` commit | Task 5 | Steps 5.4–5.5 squash |
| 7 Parity-sweep close | Task 5 | Step 5.5 commit body + Step 5.7 hand-off |

---

## Edge cases / known gotchas

- **`uv run python` and `uv run pytest` need `cd python/pvlayout_engine`.** Outside that directory, uv may resolve a different Python interpreter (system 3.11 vs venv 3.13). All commands in this plan use absolute `cd` to the engine directory.
- **Module identity collision in the byte-equivalence test.** Legacy and new both export `kmz_exporter`, `kmz_parser`, `layout_engine`. The `legacy_kmz` fixture's `_purge_legacy_modules()` deletes `core.*`, `models.*`, `utils.*` from `sys.modules` before legacy import and on teardown. The new app's `pvlayout_core.*` namespace re-resolves cleanly per test.
- **simplekml determinism.** The byte-equivalence test assumes simplekml writes deterministic XML for the same input. This holds in current versions but is not guaranteed across future upgrades. If the test fails on a tiny, non-port-bug-looking diff (e.g., `<TimeStamp>` or `<atom:link>` drift), normalize before compare via `re.sub` and document the empirical observation. Default is strict equality.
- **KMZ media type.** `application/vnd.google-earth.kmz` is the RFC-registered MIME. Google Earth and most GIS tools accept it; do not substitute generic `application/zip` or `application/octet-stream`.
- **Squash target.** Use the `[plan]` commit as the soft-reset target, not the `[spec]` commit. Row #11's plan had this bug — soft-resetting to the spec commit dumped the plan commit's contents into staging and required a manual fix-up to re-commit the plan. This row's plan targets `[plan]` correctly.
- **`uv sync` strips dev extras.** Don't run bare `uv sync`. No deps change in this row, but if pytest is missing from venv, run `uv sync --extra dev` per `feedback_uv_sync_dev_extras.md`.
- **Bearer token auth.** Existing tests use `Authorization: Bearer <TOKEN>`. The route module doesn't need to handle auth — it inherits from `authed` in `server.py`'s router registration block.
