# Row #12 Spec — KMZ exporter wiring

**PLAN.md row:** [docs/PLAN.md](../../PLAN.md) row #12 (T1).
**Source:** legacy `core/kmz_exporter.py` @ `baseline-v1-20260429` (no legacy drift; integration gap).
**Acceptance (PLAN.md):** Exporter wired; new app produces legacy-equivalent KMZ.

---

## 1. Goal

Wire the existing `pvlayout_core.core.kmz_exporter.export_kmz` into a new `POST /export-kmz` sidecar route, and verify that legacy and new exporters produce byte-identical inner KML when called on the same `LayoutResult[]`.

This is the **last row of the parity sweep**. After this row lands, all 12 rows in PLAN.md are `done`, and the accumulated T3 discovery memos route to Prasanta's end-of-port single-pass review per the 2026-04-29 policy.

T1 ceremony — no discovery memo. The diff against legacy is empty (only import-prefix differs, and the new app's `pvlayout_core.X` prefix is correct).

---

## 2. Port surface

### 2.1 No changes to `pvlayout_core/core/kmz_exporter.py`

The new app's `kmz_exporter.py` is already in sync with legacy `baseline-v1-20260429`. The only diff against legacy is the import-prefix difference:

- Legacy: `from models.project import …`, `from utils.geo_utils import utm_to_wgs84`
- New app: `from pvlayout_core.models.project import …`, `from pvlayout_core.utils.geo_utils import utm_to_wgs84`

The new-app prefix is correct and stays as-is. No code changes this row.

### 2.2 EDIT `pvlayout_engine/pvlayout_engine/schemas.py`

Add `ExportKmzRequest` immediately after `ExportPdfRequest` (which itself sits immediately before the `# Health + error payloads` comment block):

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

### 2.3 CREATE `pvlayout_engine/pvlayout_engine/routes/kmz.py`

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

The route's structure mirrors `routes/dxf.py` (row #10) and `routes/pdf.py` (row #11). Handler is named `export_kmz_route` to avoid shadowing the imported `export_kmz`.

### 2.4 EDIT `pvlayout_engine/pvlayout_engine/server.py`

Add the import in alphabetical order with the other route imports (between `dxf_router` and `layout_router` would group it with the existing exports — but to mirror the chronological-by-row pattern in the registration block, place after `dxf_router` and `layout_router`/`pdf_router`/`session_router` is fine; pick alphabetical for the import statement, chronological for the registration block):

Imports section (alphabetical-by-filename):

```python
from pvlayout_engine.routes.dxf import router as dxf_router
from pvlayout_engine.routes.kmz import router as kmz_router
from pvlayout_engine.routes.layout import router as layout_router
from pvlayout_engine.routes.pdf import router as pdf_router
from pvlayout_engine.routes.session import router as session_router
from pvlayout_engine.routes.water import router as water_router
```

Registration block — add after the row-#11 PDF block, before `app.include_router(authed)`:

```python
    # --- Export route (Row #12) ---------------------------------------------
    # /export-kmz — multi-result layout to KMZ; token-gated. Per ADR-0005,
    # exports are ungated at the entitlements layer (no require_feature).
    # KMZ exporter has no toggle flags — renders all layout elements
    # unconditionally.
    authed.include_router(kmz_router)
```

### 2.5 No other touch-points

- `LayoutResult` Pydantic schema: unchanged — used as-is for round-trip via `result_to_core`.
- `params_to_core` / `result_to_core` adapters: reused (verified in rows #10/#11).
- No new dependencies. `simplekml>=1.3` is already in `pyproject.toml`. `zipfile` is stdlib.

---

## 3. Tests

**File:** `python/pvlayout_engine/tests/integration/test_export_kmz.py` (new, ~150 lines).

Pattern: FastAPI `TestClient` + Bearer-token shape (matching rows #10/#11) for endpoint tests; sys.path bootstrap fixture (matching rows #6/#7/#8/#9/#10) for the legacy byte-equivalence test.

### 3.1 Module-scoped fixtures

**`client`** — TestClient on `build_app(SidecarConfig(... token=TEST_TOKEN ...))`.

**`auth()`** — returns `{"Authorization": f"Bearer {TEST_TOKEN}"}`.

**`core_layout_results`** — run `parse_kmz + run_layout_multi` on `phaseboundary2.kmz`, filter to valid (`usable_polygon` non-None) results.

**`export_request_body`** — wire-shape body with `results` (model_dumped from `result_from_core`) + default `LayoutParameters`.

**`legacy_kmz`** — module-scoped sys.path bootstrap fixture. Purges `core.*`/`models.*`/`utils.*` from `sys.modules`, inserts `LEGACY_REPO` on `sys.path`, imports legacy `core.kmz_exporter.export_kmz` + `core.kmz_parser.parse_kmz` + `core.layout_engine.run_layout_multi` + `models.project`. Yields the four. Teardown unwinds the path mutation and re-purges.

### 3.2 Helper

```python
def _read_kml_from_kmz(kmz_path: Path) -> bytes:
    """KMZ is a zip; the main KML is conventionally the first .kml member
    (simplekml writes 'doc.kml' by default). Returns the raw KML XML bytes."""
    with zipfile.ZipFile(kmz_path, "r") as zf:
        kml_names = [n for n in zf.namelist() if n.endswith(".kml")]
        assert len(kml_names) == 1, f"expected exactly one .kml member, got {kml_names}"
        return zf.read(kml_names[0])
```

### 3.3 Test cases

**`test_export_kmz_smoke(client, export_request_body, tmp_path)`** — `POST /export-kmz` returns 200, `content-type: application/vnd.google-earth.kmz`, `Content-Disposition` includes `"layout.kmz"`. Response body starts with `b"PK\x03\x04"` (zip magic). Write the response to `tmp_path / "out.kmz"`, open with `zipfile.ZipFile`, assert exactly one `.kml` member, assert that KML body starts with `b"<?xml"` and contains `b"<kml"`.

**`test_export_kmz_empty_results_returns_422(client)`** — `POST /export-kmz` with `results=[]` returns 422 with `"results must be non-empty"` detail.

**`test_export_kmz_byte_equivalent_to_legacy(legacy_kmz, tmp_path)`** — the row's "legacy-equivalent KMZ" acceptance.

1. Inside the `legacy_kmz` fixture's scope, run legacy `parse_kmz + run_layout_multi` on `phaseboundary2.kmz` → `legacy_results`. Build a separate `legacy_params = legacy_project.LayoutParameters()`.

2. Re-import the new app's modules under their `pvlayout_core.*` namespace (which is unaffected by the `sys.path` insert): `from pvlayout_core.core.kmz_parser import parse_kmz`, `from pvlayout_core.core.layout_engine import run_layout_multi`, `from pvlayout_core.core.kmz_exporter import export_kmz`, `from pvlayout_core.models.project import LayoutParameters`. Run new `parse_kmz + run_layout_multi` → `new_results`. Build `new_params = LayoutParameters()`.

3. Filter both to valid results: `legacy_valid = [r for r in legacy_results if r.usable_polygon is not None]`, same for new. Assert `len(legacy_valid) == len(new_valid)` (sanity — same input, same engine, post-row-#6 → same count).

4. Write both KMZs:
   ```python
   legacy_kmz_path = tmp_path / "legacy.kmz"
   new_kmz_path = tmp_path / "new.kmz"
   legacy_export(legacy_valid, legacy_params, str(legacy_kmz_path))
   new_export(new_valid, new_params, str(new_kmz_path))
   ```

5. Extract inner KML bytes from each: `legacy_kml = _read_kml_from_kmz(legacy_kmz_path)`, `new_kml = _read_kml_from_kmz(new_kmz_path)`.

6. Assert `legacy_kml == new_kml`.

**Fallback (documented in test docstring):** if a `simplekml` version stamp or a non-deterministic timestamp surfaces, add a normalization step before comparing. The docstring suggests: `re.sub(rb"<TimeStamp>.*?</TimeStamp>", b"", kml_bytes)` and similar for `<atom:link>` if needed. Default is strict byte-equality; only loosen if drift surfaces during impl.

### 3.4 Skip-if-legacy-missing

The byte-equivalence test self-skips when `LEGACY_REPO` doesn't exist or isn't on `baseline-v1-20260429`. Same pattern as rows #6/#7/#8/#9/#10.

### 3.5 No new dependencies

`zipfile` is stdlib; `simplekml` already in `pyproject.toml`; `re` is stdlib (only loaded if the timestamp-normalization fallback fires).

---

## 4. Acceptance criteria

Mapped to PLAN.md row #12's "Acceptance" + tier ceremony:

1. `uv run pytest tests/ -q` from `python/pvlayout_engine` is **green**. Target: prior `111 passed → ~114 passed`, **6 skipped**, **0 failed** (3 new integration tests).
2. `POST /export-kmz` is registered (visible in `/openapi.json`) and reachable; smoke test confirms 200 + `application/vnd.google-earth.kmz` + valid zip magic + parseable inner KML.
3. `test_export_kmz_byte_equivalent_to_legacy` asserts `legacy_kml == new_kml` (byte-identical inner KML XML) via sys.path bootstrap on `phaseboundary2.kmz`.
4. PLAN.md row #12 `Status` flipped to `done`; status header bumped `11 / 12 done` → `12 / 12 done`.
5. Atomic commit per row: `parity: row #12 — KMZ exporter wiring`. Intra-row `wip:` checkpoints; squash before close.

---

## 5. Out of scope (deferred)

- **Frontend export-KMZ button wiring.** Post-parity per CLAUDE.md §2.
- **Edition / feature gating.** Per `session.py:105` and ADR-0005, exports are ungated. No `require_feature` dependency.
- **Discovery memo.** T1 — no solar-domain decisions in this row (no code changes to `kmz_exporter.py`).
- **Stale `session.py:7` comment** listing `/export/dxf` as feature-gated. Trivial doc-only nit; not scoped here.
- **Round-trip parsing / validation of the generated KMZ** beyond zip-membership and XML-prefix sniff. The byte-equivalence test against legacy is the strong claim; deeper KML validation is post-parity if it matters.

---

## 6. Pre-implementation operational notes

- No `pyproject.toml` change → no `uv sync --extra dev` needed.
- KMZ media type: `application/vnd.google-earth.kmz` (RFC-registered, accepted by Google Earth and most GIS tools).
- The byte-equivalence test's strict assertion may need a regex-strip fallback if `simplekml` is non-deterministic. Treat first failure as a signal to add normalization, not as a port bug — the new app's `kmz_exporter.py` is byte-identical to legacy, so any drift is upstream-library nondeterminism.
- Legacy reference repo at `baseline-v1-20260429` must be checked out for the byte-equivalence test; otherwise the test self-skips.

---

## 7. Parity-sweep close

This is the last of the 12 rows in PLAN.md. After it lands:

- **All 12 rows are `done`.** Status header reads `12 / 12 done`.
- **End-of-port T3 review.** Five accumulated T3 discovery memos in `docs/parity/findings/` (rows #4, #5, #7, #8, #9) route to Prasanta in a single pass per the 2026-04-29 policy. Refinements, if any, become follow-up rows.
- **Post-parity work resumes** per CLAUDE.md §2 / PLAN.md "Out of scope" section: frontend UI/UX, single-app-paradigm enforcement, external contract refactors, retirement-trigger criteria for the legacy app.
- The row-#12 `parity:` commit body briefly notes the sweep close so the audit trail is self-explanatory.
