# Spike 2 Design — `apps/layout-engine` Setup

**Date:** 2026-04-19  
**Initiative:** PV Layout Engine — Cloud Platform Port  
**Spike plan:** [pv-layout-spike-plan.md](../../initiatives/pv-layout-spike-plan.md)  
**Foundational doc:** [pv-layout-cloud.md](../../initiatives/pv-layout-cloud.md)

---

## What This Document Is

This is the brainstorming design record for Spike 2. It captures the key decisions made during design and the rationale behind them. All implementation detail (directory structure, file specs, acceptance criteria) lives in the spike plan. This document is the "why" — the spike plan is the "what".

---

## Scope

Stand up `apps/layout-engine` as a Python compute service in the Turborepo monorepo: copy and adapt the source from the Python desktop app (`PVlayout_Advance`), add the new files needed for headless compute + S3 + DB integration, and verify it end-to-end locally.

Lambda packaging (Dockerfile, lambda_handler.py) is explicitly out of scope — deferred to Spike 4, which is the earliest point where Lambda can be runtime-tested.

---

## Key Design Decisions

### 1. Spike 2 is three sub-spikes, not one

**Decision:** Spike 2 is decomposed into 2a (Scaffold), 2b (Compute), 2c (S3 + DB).

**Rationale:** The original single-spike scope bundled four independent concerns — Python environment setup, compute pipeline correctness, S3 I/O, and DB state transitions. Each concern has different dependencies: compute needs only a KMZ file, S3 needs AWS credentials, DB needs a running Postgres. Bundling them means one failure blocks all verification and diagnosing failures requires eliminating multiple suspects at once.

Each sub-spike has exactly one human-verifiable outcome:
- 2a: server starts and health check passes
- 2b: real KMZ in → correct artifacts in /tmp, SVG layers verified in browser
- 2c: real S3 + DB transitions verified in AWS console + Prisma Studio

### 2. Spike 2b uses a local-path POST contract, not the production contract

**Decision:** `POST /layout` in Spike 2b accepts `{ kmz_local_path, parameters, output_dir }` instead of the production `{ kmz_s3_key, version_id, parameters }`.

**Rationale:** This isolates the hardest part of the spike — compute correctness — from S3 and DB dependencies. A human can test the full pipeline with nothing more than a KMZ file and a terminal. The contract is replaced in full in Spike 2c. This is intentional technical debt: it exists to enable faster, cheaper verification of the compute logic before adding I/O complexity.

**Cross-verification:** The production contract (`kmz_s3_key`, `version_id`) is verified in Spike 2c and is the contract Hono calls in Spike 3. No contract mismatch risk — 2c establishes the final contract before Hono consumes it.

### 3. Python owns all DB state after the initial QUEUED write

**Decision:** Hono API writes `Version (QUEUED)` and `LayoutJob (QUEUED)` on version submit, fires the job (HTTP in local, SQS in staging/prod), and returns immediately. All subsequent DB writes — status transitions, artifact S3 keys, statsJson, errorDetail — are performed by Python directly via psycopg2-binary. Hono never polls or updates job status after dispatch.

**Rationale:** Layout jobs are long-running (seconds to minutes for large sites). Hono cannot hold an HTTP connection open waiting for completion. Python is already the authority on compute state — it knows exactly when it starts, when it succeeds, and what went wrong if it fails. Routing state updates back through Hono would add a network hop, a serialization step, and a failure mode with no benefit.

**Implementation:** `db_client.py` — raw psycopg2-binary, no ORM, three functions: `mark_layout_processing`, `mark_layout_complete`, `mark_layout_failed`. Called directly from `handle_layout`.

### 4. `svg_exporter.py` is a new file; `core/` is copied unchanged

**Decision:** `svg_exporter.py` lives at `src/svg_exporter.py` (not inside `core/`). All files under `core/`, `models/`, `utils/` are copied verbatim from the Python desktop app with no modifications except adding `matplotlib.use('Agg')` at the top of any file that imports matplotlib.

**Rationale:** The core files are already clean of Qt. Modifying them risks introducing bugs that would be hard to attribute. `svg_exporter.py` is new code (port of `_draw_layout()` from `main_window.py`) and belongs at the `src/` level alongside the other new files (`handlers.py`, `server.py`, `s3_client.py`, `db_client.py`).

### 5. `matplotlib.use('Agg')` — headless rendering

**Decision:** Set the Agg backend at the top of any file that imports matplotlib, before any other matplotlib import.

**Rationale:** The default matplotlib backend attempts to connect to a display. On a headless server (Lambda, CI) there is no display — this causes a runtime crash. The Agg backend renders to a buffer (no display needed) and produces correct SVG output.

### 6. One combined output per artifact type (multi-boundary)

**Decision:** For sites with multiple boundary polygons in the input KMZ, the engine produces one combined KMZ, one SVG, and one DXF — not one per boundary.

**Rationale:** Confirmed by the export signatures in the Python app (`export_kmz(results: List[LayoutResult], ...)`, `export_dxf(results: List[LayoutResult], ...)`). The KMZ exporter already creates an "Overall Summary" folder for multi-boundary sites.

### 7. `ezdxf` must be added to `pyproject.toml`

**Decision:** `ezdxf` is listed as a dependency in `pyproject.toml` from Spike 2a.

**Rationale:** `ezdxf` is missing from the Python desktop app's `requirements.txt` (a known gap documented in pv-layout-cloud.md). The DXF exporter (`core/dxf_exporter.py`) imports it. Without it, `uv sync` produces a working environment but `POST /layout` crashes at DXF export time.

---

## Architecture Summary

```
Spike 2a — Scaffold
  apps/layout-engine/
    src/
      core/, models/, utils/   ← copied verbatim (+ matplotlib.use('Agg'))
      server.py                ← GET /health only
    pyproject.toml             ← all deps including psycopg2-binary + ezdxf
    uv.lock, ruff.toml

Spike 2b — Compute (local)
  src/
    svg_exporter.py            ← port of _draw_layout(), gid-tagged groups
    handlers.py                ← handle_layout (local path contract)
    server.py                  ← POST /layout (local path body)

Spike 2c — S3 + DB (production)
  src/
    s3_client.py               ← boto3 download/upload helpers
    db_client.py               ← psycopg2 mark_layout_* functions
    handlers.py                ← handle_layout (production contract, returns None)
    server.py                  ← POST /layout returns 202, fire-and-forget
```

**Data flow (Spike 2c, production contract):**
```
POST /layout { kmz_s3_key, version_id, parameters }
  → 202 Accepted immediately
  → [background thread]
       → mark_layout_processing(version_id)        DB: LayoutJob + Version = PROCESSING
       → s3.download(kmz_s3_key) → /tmp/input.kmz
       → run pipeline → /tmp/layout.{kmz,svg,dxf}
       → s3.upload x3 → artifact S3 keys
       → mark_layout_complete(version_id, ...)     DB: LayoutJob = COMPLETE, Version = COMPLETE
       → on error: mark_layout_failed(version_id)  DB: LayoutJob = FAILED, Version = FAILED
```

---

## What Spike 3 Depends On

Spike 3 (Job Pipeline: Local Mode) wires Hono to call `POST /layout`. It expects:
- `POST /layout` accepts `{ kmz_s3_key, version_id, parameters }` → 202
- DB transitions observable independently (Hono does not update job status)
- Artifacts appear in S3 without Hono's involvement

All three are delivered by Spike 2c. Spike 3 can begin only after Spike 2c acceptance criteria are human-verified.
