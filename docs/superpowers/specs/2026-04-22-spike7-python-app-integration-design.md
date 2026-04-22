# Spike 7: Python App Integration Design

## Goal

Integrate SolarLayout license key authentication into `PVlayout_Advance` (PyQt5 desktop app) and produce a reference implementation plus a PRD and Claude Code prompt for Prasanta so he can apply the same integration to future Python apps.

All deliverables live in the `PVlayout_Advance` repo on the `add-auth` branch.

---

## Scope

| Deliverable | Location in PVlayout_Advance |
|---|---|
| Auth module (`auth/`) | `auth/license_client.py`, `auth/key_store.py`, `auth/workers.py` |
| License key dialog | `gui/license_key_dialog.py` |
| Integration in main window | `gui/main_window.py` (3 touch points) |
| PRD for Prasanta | `docs/PRD-license-key-integration.md` |
| Claude Code implementation prompt | `docs/CLAUDE_CODE_PROMPT.md` |

Out of scope: free-tier quota enforcement (deferred to Spike 7.1), export billing, CI/CD changes to PVlayout_Advance.

---

## Architecture

### New module: `auth/`

```
auth/
  __init__.py
  license_client.py    # HTTP calls to api.solarlayout.in
  key_store.py         # OS-native credential storage via keyring
  workers.py           # QThread workers: EntitlementsWorker, UsageReportWorker
```

**`auth/key_store.py`**
- `save_key(key: str) -> None` — calls `keyring.set_password("solarlayout", "license_key", key)`
- `load_key() -> str | None` — calls `keyring.get_password("solarlayout", "license_key")`
- `delete_key() -> None` — calls `keyring.delete_password("solarlayout", "license_key")`

Key never written to disk as plaintext. Falls back to `None` if no key stored.

**`auth/license_client.py`**
- `BASE_URL = "https://api.solarlayout.in"`
- `get_entitlements(key: str) -> dict` — GET `/entitlements`, `Authorization: Bearer <key>`, returns parsed JSON body
- `report_usage(key: str, feature: str) -> dict` — POST `/usage/report`, body `{"feature": feature}`, returns parsed JSON body
- Both raise `LicenseError(status_code, message)` on non-2xx responses
- `LicenseError` carries `.status_code` (int) and `.message` (str) for caller handling
- Connection timeout: 10 seconds; read timeout: 15 seconds

**`auth/workers.py`**
- `EntitlementsWorker(QThread)` — runs `license_client.get_entitlements(key)` off the main thread
  - Signals: `result(dict)`, `error(int, str)` (status_code, message)
- `UsageReportWorker(QThread)` — runs `license_client.report_usage(key, feature)` off the main thread
  - Signals: `result(dict)`, `error(int, str)`
  - Does NOT block the Generate flow; fires and forgets after layout completes

### New GUI: `gui/license_key_dialog.py`

`LicenseKeyDialog(QDialog)`:
- Input field for license key (masked, `QLineEdit.Password`)
- "Save" button → validates key starts with `sl_live_`, saves via `key_store.save_key()`, accepts dialog
- "Cancel" button → rejects dialog without saving
- "Buy a license" link → opens `https://solarlayout.in/#pricing` in browser
- No network call from the dialog itself (validation happens at startup via `EntitlementsWorker`)

---

## Integration Touch Points in `gui/main_window.py`

### Touch point 1: Application startup

```python
def __init__(self, ...):
    ...
    self._license_key: str | None = key_store.load_key()
    self._entitlements: dict | None = None
    self._setup_license_banner()
    if self._license_key:
        self._start_entitlements_check()
    else:
        self._show_no_key_banner()
```

- If key exists: launch `EntitlementsWorker` silently. On result → store `_entitlements`, dismiss banner if shown, update status bar.
- If no key: show dismissable yellow banner ("No license key — some features may be limited. [Enter key] [Dismiss]").
- Network errors on startup are non-fatal: log to console, show soft warning in status bar, do not block the UI.

### Touch point 2: `_can_generate() -> bool`

```python
def _can_generate(self) -> bool:
    # Spike 7: always True — no hard blocking without a key.
    # Spike 7.1 will enforce free-tier quota here.
    return True
```

Called at the top of `_on_generate()`:

```python
def _on_generate(self):
    if not self._can_generate():
        # Spike 7.1 will show purchase prompt here
        return
    ...
    # existing LayoutWorker dispatch
```

This isolates the quota enforcement to one method. Spike 7.1 changes `_can_generate()` only — nothing else moves.

### Touch point 3: `_on_layout_done()` — fire-and-forget usage report

```python
def _on_layout_done(self, results):
    self._results = results
    ...
    # existing: enable export buttons
    if self._license_key:
        worker = UsageReportWorker(self._license_key, "plant_layout")
        worker.result.connect(self._on_usage_reported)
        worker.error.connect(self._on_usage_report_error)
        worker.start()
        self._usage_worker = worker  # prevent GC
```

- `_on_usage_reported(data)`: update remaining count in status bar silently.
- `_on_usage_report_error(status_code, message)`: log only; do NOT interrupt the user. If 402 (exhausted), show soft banner "Calculations exhausted — [Buy more]".
- If no license key: skip usage reporting entirely (freemium path, Spike 7.1 will handle quota).

---

## Three Flows

### Flow 1: First run (no key stored)

1. App starts, `key_store.load_key()` returns `None`
2. Yellow banner shown: "No license key. [Enter key] [Dismiss]"
3. User clicks "Enter key" → `LicenseKeyDialog` opens
4. User enters `sl_live_...` key → saved via `keyring`
5. `EntitlementsWorker` dispatched silently
6. On result: banner dismissed, status bar shows "7 calculations remaining"
7. User proceeds to Generate without interruption

### Flow 2: Normal startup (key stored, quota available)

1. App starts, `key_store.load_key()` returns key
2. `EntitlementsWorker` dispatched in background
3. UI is immediately usable — no blocking spinner
4. On result: status bar updated ("7 calculations remaining")
5. User clicks Generate → `_can_generate()` returns `True` → layout runs
6. On layout done → `UsageReportWorker` fires, status bar updates to "6 calculations remaining"

### Flow 3: Quota exhausted

1. User has 0 remaining calculations
2. App starts, `EntitlementsWorker` returns `remainingCalculations: 0`
3. Status bar shows "0 calculations remaining — [Buy more]"
4. User can still click Generate (freemium path; `_can_generate()` returns `True` in Spike 7)
5. After layout, `UsageReportWorker` fires, gets 402 response
6. Soft banner: "Calculations exhausted — purchase more at [solarlayout.in]"
7. Spike 7.1 will hard-block in `_can_generate()` after free quota consumed

---

## Freemium-Forward Design

`_can_generate()` is designed so that Spike 7.1 can enforce free-tier quota without restructuring any other code. Today it returns `True` unconditionally. In Spike 7.1:

```python
def _can_generate(self) -> bool:
    if self._license_key is None:
        return self._free_quota_remaining > 0  # new in 7.1
    return True  # licensed users always proceed
```

This means:
- No blocking modal at startup (avoids conversion-killing friction)
- No code to rip out — the quota guard is additive in one method
- Exports are never billable (they serialize `_results` already in memory)

---

## Error Handling

| HTTP Status | Scenario | App Behavior |
|---|---|---|
| 200 | Success | Normal flow |
| 401 | Key invalid / revoked | Status bar: "License key invalid — [Re-enter key]"; clear stored key |
| 402 | No remaining calculations | Soft banner: "Calculations exhausted — [Buy more]" |
| 409 | Concurrent report in progress | Log silently; retry once after 1s |
| 4xx other | Unexpected client error | Log to console; show generic status bar warning |
| 5xx / timeout / no network | Server error or offline | Log silently; do not interrupt the user |

All errors from `EntitlementsWorker` and `UsageReportWorker` are non-fatal at the UI level. The app must remain usable regardless of network state.

---

## API Contract Reference

### `GET /entitlements`

```
Authorization: Bearer sl_live_<key>
→ 200
{
  "success": true,
  "data": {
    "licensed": true,
    "availableFeatures": ["plant_layout", "cable_routing"],
    "totalCalculations": 10,
    "usedCalculations": 3,
    "remainingCalculations": 7
  }
}
→ 401 { "success": false, "error": { "code": "UNAUTHORIZED", "message": "..." } }
```

### `POST /usage/report`

```
Authorization: Bearer sl_live_<key>
Content-Type: application/json
{ "feature": "plant_layout" }
→ 200
{
  "success": true,
  "data": { "recorded": true, "remainingCalculations": 6 }
}
→ 400 unknown feature key
→ 401 invalid/revoked key
→ 402 no remaining calculations
→ 409 concurrent report in progress (retry)
```

Feature key for a Generate click: `"plant_layout"` (one report per Generate, regardless of which sub-features ran). Exports are not reported.

---

## `requirements.txt` Addition

```
keyring>=24.0.0
pytest>=7.0       # dev only — not bundled by PyInstaller
flake8>=6.0       # dev only — not bundled by PyInstaller
```

`requests` is already present. `keyring` uses the OS credential store (macOS Keychain, Windows Credential Manager, Linux Secret Service / KWallet).

---

## Build & Release Platform Notes

**Windows is the primary release platform.** Prasanta builds the Windows `.exe` on his machine and uploads it to S3. macOS builds are for Arun's local testing only. Production endpoints are hardcoded — there is no dev/staging endpoint for desktop apps.

### PyInstaller + keyring

`keyring` uses OS-specific backends that PyInstaller cannot auto-discover. Both specs must explicitly include them as hidden imports:

**macOS** (`PVlayout_Advance.spec`):
```python
# Add to hidden imports list:
'keyring.backends.macOS',
'keyring.core',
# Plus:
hidden += collect_submodules('keyring')
```

**Windows** (`PVlayout_Advance_windows.spec` — new file for Prasanta):
```python
# Add to hidden imports list:
'keyring.backends.Windows',
'keyring.core',
# Plus:
hidden += collect_submodules('keyring')
```

The Windows spec uses `--onefile` style (single `.exe`, no directory) to match Prasanta's existing build workflow. The macOS spec keeps the existing `.app` bundle structure.

### Build commands

**macOS (Arun, local testing):**
```bash
source .venv/bin/activate
pyinstaller --noconfirm --clean PVlayout_Advance.spec
# Output: dist/PVlayout_Advance.app
```

**Windows (Prasanta, release builds):**
```bat
.venv\Scripts\activate
pyinstaller --noconfirm --clean PVlayout_Advance_windows.spec
# Output: dist/PVlayout_Advance.exe  (single file)
```

Prasanta must install dependencies on Windows before building:
```bat
pip install -r requirements.txt
```

---

## Spike 7.1 Forward-Compatibility Note

Spike 7.1 will add free-tier quota enforcement:
- New API endpoint or extension to `GET /entitlements` to return `freeGenerationsRemaining`
- `_can_generate()` in `main_window.py` checks free quota when no key is stored
- `UsageReportWorker` fires even without a key (anonymous reporting via a session token or IP-based quota)
- No other structural changes needed — the `auth/` module and three touch points remain valid

The reference implementation in this spike must not assume free quota is zero. `_can_generate()` must be clearly documented so Prasanta knows where to add the Spike 7.1 logic.

---

## PRD Outline (`docs/PRD-license-key-integration.md`)

The PRD for Prasanta covers:

1. **Business context** — why license key auth exists, what SolarLayout sells, what a calculation is
2. **Feature summary** — what the user sees (banner, dialog, status bar, error states)
3. **Freemium-forward design** — why we don't block at startup, Spike 7.1 plan
4. **Architecture overview** — `auth/` module, three touch points, QThread workers
5. **API contracts** — full request/response shapes for both endpoints, all error codes
6. **Sequence diagrams** — startup flow, generate flow, first-run flow
7. **Error handling policy** — non-fatal philosophy, per-status behavior table
8. **`requirements.txt` change** — `keyring` addition and rationale
9. **Spike 7.1 extension points** — exactly what changes and what stays the same
10. **Definition of done** — gates, local verification steps, production smoke test

---

## Claude Code Prompt Outline (`docs/CLAUDE_CODE_PROMPT.md`)

The prompt for Prasanta covers:

1. **Task summary** — implement auth integration per this PRD, on `add-auth` branch
2. **Repo context** — PVlayout_Advance structure, existing QThread pattern, existing `main_window.py` touch points
3. **Files to create** — exact paths and responsibilities
4. **Files to modify** — exact functions and what to add
5. **TDD requirement** — write failing tests first for `license_client.py`, `key_store.py`, `workers.py`
6. **Test approach** — mock `keyring` and `requests`, test each worker signal path
7. **API contracts** — exact endpoint URLs, headers, bodies, response shapes (repeated from PRD for standalone use)
8. **Error handling rules** — non-fatal at UI, per-status behavior table
9. **`_can_generate()` contract** — must return `True` unconditionally in Spike 7; comment explaining Spike 7.1
10. **Pre-commit gate** — `flake8 . && python -m pytest` must pass before commit
11. **Definition of done** — all gates pass + human runs the app and verifies each flow

---

## Definition of Done

1. `bun run lint && bun run typecheck && bun run test && bun run build` passes from `renewable_energy` root (no changes to that repo's code)
2. In `PVlayout_Advance` on `add-auth`: `flake8 . && python -m pytest` pass
3. Human runs PVlayout_Advance locally and confirms:
   - First-run flow: banner shown, dialog opens, key saved, entitlements fetched
   - Normal startup: status bar shows remaining count
   - Generate: layout runs, usage reported, status bar updates
   - Quota exhausted: soft banner shown, app still usable
4. `docs/PRD-license-key-integration.md` committed to `add-auth`
5. `docs/CLAUDE_CODE_PROMPT.md` committed to `add-auth`
6. Human signs off
