# Spike 7: Python App Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate SolarLayout license key authentication into `PVlayout_Advance` (PyQt5 desktop app) and produce a reference implementation plus a PRD and Claude Code prompt for Prasanta.

**Architecture:** A new `auth/` module handles all HTTP calls (`license_client.py`), OS credential storage (`key_store.py`), and QThread background workers (`workers.py`). A new `gui/license_key_dialog.py` provides a masked key-entry dialog. Three touch points in `gui/main_window.py` wire up startup entitlement check, the `_can_generate()` guard, and post-generate usage reporting.

**Tech Stack:** Python 3.11, PyQt5, `requests` (already in requirements), `keyring>=24.0.0` (new), `pytest` + `unittest.mock` for tests

---

## Context

All work is in `/Users/arunkpatra/codebase/PVlayout_Advance` on the `add-auth` branch. Do NOT touch the `main` branch.

The app entry point is `main.py` → `gui/main_window.py` (`MainWindow`). The `LayoutWorker` and `GHIFetchWorker` QThread pattern already exists in `main_window.py` (lines 73–119) — follow exactly the same pattern for new workers.

The pre-commit gate is:
```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance
.venv/bin/python -m flake8 auth/ gui/license_key_dialog.py tests/ --max-line-length=100
.venv/bin/python -m pytest tests/ -v
```

**Run commands from `/Users/arunkpatra/codebase/PVlayout_Advance`** (not the renewable_energy repo).

---

## File Structure

**New files:**
- `auth/__init__.py` — empty, makes `auth` a package
- `auth/license_client.py` — HTTP calls to `https://api.solarlayout.in`; `LicenseError` exception; `get_entitlements()`, `report_usage()`
- `auth/key_store.py` — OS keyring wrapper; `save_key()`, `load_key()`, `delete_key()`
- `auth/workers.py` — `EntitlementsWorker(QThread)` and `UsageReportWorker(QThread)`
- `gui/license_key_dialog.py` — `LicenseKeyDialog(QDialog)`: masked key field, Save, Cancel, Buy link
- `tests/__init__.py` — empty
- `tests/auth/__init__.py` — empty
- `tests/auth/test_key_store.py` — tests for `key_store.py` (mocks `keyring`)
- `tests/auth/test_license_client.py` — tests for `license_client.py` (mocks `requests`)
- `docs/PRD-license-key-integration.md` — full PRD for Prasanta
- `docs/CLAUDE_CODE_PROMPT.md` — standalone implementation prompt for Prasanta

**Modified files:**
- `requirements.txt` — add `keyring>=24.0.0` and `pytest>=7.0` and `flake8>=6.0`
- `gui/main_window.py` — 3 touch points: `__init__` startup, `_can_generate()`, `_on_layout_done()` usage report

---

## Task 1: Install dev dependencies and add to requirements.txt

**Files:**
- Modify: `requirements.txt`

- [ ] **Step 1: Install pytest, flake8, and keyring**

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance
.venv/bin/pip install pytest>=7.0 flake8>=6.0 "keyring>=24.0.0"
```

Expected: `Successfully installed ...` (or "already satisfied")

- [ ] **Step 2: Read current requirements.txt**

Run: `cat requirements.txt`
Expected:
```
# PV Layout Tool — Python dependencies
PyQt5>=5.15
matplotlib>=3.7
shapely>=2.0
pyproj>=3.5
simplekml>=1.3
requests>=2.28
```

- [ ] **Step 3: Write updated requirements.txt**

```
# PV Layout Tool — Python dependencies
PyQt5>=5.15
matplotlib>=3.7
shapely>=2.0
pyproj>=3.5
simplekml>=1.3
requests>=2.28
keyring>=24.0.0
pytest>=7.0
flake8>=6.0
```

- [ ] **Step 4: Verify install worked**

Run: `.venv/bin/python -m pytest --version && .venv/bin/python -m flake8 --version`
Expected: version strings printed without error

- [ ] **Step 5: Commit**

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance
git add requirements.txt
git commit -m "chore: add keyring, pytest, flake8 to requirements.txt"
```

---

## Task 2: Create `auth/key_store.py` with tests

**Files:**
- Create: `auth/__init__.py`
- Create: `auth/key_store.py`
- Create: `tests/__init__.py`
- Create: `tests/auth/__init__.py`
- Create: `tests/auth/test_key_store.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/__init__.py` (empty file) and `tests/auth/__init__.py` (empty file).

Create `tests/auth/test_key_store.py`:

```python
"""Tests for auth/key_store.py — OS credential storage wrapper."""
from unittest.mock import patch, MagicMock
import pytest


def test_save_key_calls_keyring_set_password():
    with patch("keyring.set_password") as mock_set:
        from auth.key_store import save_key
        save_key("sl_live_testkey123")
        mock_set.assert_called_once_with(
            "solarlayout", "license_key", "sl_live_testkey123"
        )


def test_load_key_returns_stored_key():
    with patch("keyring.get_password", return_value="sl_live_testkey123") as mock_get:
        from auth.key_store import load_key
        result = load_key()
        mock_get.assert_called_once_with("solarlayout", "license_key")
        assert result == "sl_live_testkey123"


def test_load_key_returns_none_when_not_set():
    with patch("keyring.get_password", return_value=None):
        from auth.key_store import load_key
        result = load_key()
        assert result is None


def test_delete_key_calls_keyring_delete_password():
    with patch("keyring.delete_password") as mock_del:
        from auth.key_store import delete_key
        delete_key()
        mock_del.assert_called_once_with("solarlayout", "license_key")


def test_delete_key_ignores_keyring_not_found():
    import keyring.errors
    with patch("keyring.delete_password",
               side_effect=keyring.errors.PasswordDeleteError("not found")):
        from auth.key_store import delete_key
        # Must not raise
        delete_key()
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance
.venv/bin/python -m pytest tests/auth/test_key_store.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'auth'`

- [ ] **Step 3: Create `auth/__init__.py`**

```python
"""SolarLayout license key auth package."""
```

- [ ] **Step 4: Create `auth/key_store.py`**

```python
"""
OS-native credential storage for the SolarLayout license key.
Uses keyring — macOS Keychain, Windows Credential Manager, Linux Secret Service.
"""
import keyring
import keyring.errors

_SERVICE = "solarlayout"
_ACCOUNT = "license_key"


def save_key(key: str) -> None:
    """Persist the license key in the OS credential store."""
    keyring.set_password(_SERVICE, _ACCOUNT, key)


def load_key() -> str | None:
    """Return the stored license key, or None if not set."""
    return keyring.get_password(_SERVICE, _ACCOUNT)


def delete_key() -> None:
    """Remove the license key from the OS credential store. Silently ignores missing key."""
    try:
        keyring.delete_password(_SERVICE, _ACCOUNT)
    except keyring.errors.PasswordDeleteError:
        pass
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance
.venv/bin/python -m pytest tests/auth/test_key_store.py -v
```

Expected: 5 PASSED

- [ ] **Step 6: Run flake8**

```bash
.venv/bin/python -m flake8 auth/key_store.py tests/auth/test_key_store.py --max-line-length=100
```

Expected: no output (no errors)

- [ ] **Step 7: Commit**

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance
git add auth/__init__.py auth/key_store.py tests/__init__.py tests/auth/__init__.py tests/auth/test_key_store.py
git commit -m "feat(auth): add key_store.py — OS credential storage via keyring"
```

---

## Task 3: Create `auth/license_client.py` with tests

**Files:**
- Create: `auth/license_client.py`
- Create: `tests/auth/test_license_client.py`

- [ ] **Step 1: Write the failing tests**

Create `tests/auth/test_license_client.py`:

```python
"""Tests for auth/license_client.py — HTTP client for api.solarlayout.in."""
from unittest.mock import patch, MagicMock
import pytest


def _mock_response(status_code: int, json_data: dict) -> MagicMock:
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = json_data
    return resp


def test_get_entitlements_returns_data_on_200():
    payload = {
        "success": True,
        "data": {
            "licensed": True,
            "availableFeatures": ["plant_layout"],
            "totalCalculations": 10,
            "usedCalculations": 3,
            "remainingCalculations": 7,
        },
    }
    with patch("requests.get", return_value=_mock_response(200, payload)) as mock_get:
        from auth.license_client import get_entitlements
        result = get_entitlements("sl_live_testkey")
        mock_get.assert_called_once_with(
            "https://api.solarlayout.in/entitlements",
            headers={"Authorization": "Bearer sl_live_testkey"},
            timeout=(10, 15),
        )
        assert result["data"]["remainingCalculations"] == 7


def test_get_entitlements_raises_license_error_on_401():
    payload = {"success": False, "error": {"code": "UNAUTHORIZED", "message": "Invalid key"}}
    with patch("requests.get", return_value=_mock_response(401, payload)):
        from auth.license_client import get_entitlements, LicenseError
        with pytest.raises(LicenseError) as exc_info:
            get_entitlements("sl_live_badkey")
        assert exc_info.value.status_code == 401
        assert "Invalid key" in exc_info.value.message


def test_get_entitlements_raises_license_error_on_500():
    payload = {"success": False}
    with patch("requests.get", return_value=_mock_response(500, payload)):
        from auth.license_client import get_entitlements, LicenseError
        with pytest.raises(LicenseError) as exc_info:
            get_entitlements("sl_live_testkey")
        assert exc_info.value.status_code == 500


def test_report_usage_returns_data_on_200():
    payload = {"success": True, "data": {"recorded": True, "remainingCalculations": 6}}
    with patch("requests.post", return_value=_mock_response(200, payload)) as mock_post:
        from auth.license_client import report_usage
        result = report_usage("sl_live_testkey", "plant_layout")
        mock_post.assert_called_once_with(
            "https://api.solarlayout.in/usage/report",
            headers={
                "Authorization": "Bearer sl_live_testkey",
                "Content-Type": "application/json",
            },
            json={"feature": "plant_layout"},
            timeout=(10, 15),
        )
        assert result["data"]["remainingCalculations"] == 6


def test_report_usage_raises_license_error_on_402():
    payload = {"success": False, "error": {"code": "PAYMENT_REQUIRED", "message": "No calcs left"}}
    with patch("requests.post", return_value=_mock_response(402, payload)):
        from auth.license_client import report_usage, LicenseError
        with pytest.raises(LicenseError) as exc_info:
            report_usage("sl_live_testkey", "plant_layout")
        assert exc_info.value.status_code == 402


def test_report_usage_raises_license_error_on_409():
    payload = {"success": False, "error": {"code": "CONFLICT", "message": "Retry"}}
    with patch("requests.post", return_value=_mock_response(409, payload)):
        from auth.license_client import report_usage, LicenseError
        with pytest.raises(LicenseError) as exc_info:
            report_usage("sl_live_testkey", "plant_layout")
        assert exc_info.value.status_code == 409


def test_get_entitlements_raises_license_error_on_connection_error():
    import requests as req_lib
    with patch("requests.get", side_effect=req_lib.exceptions.ConnectionError("offline")):
        from auth.license_client import get_entitlements, LicenseError
        with pytest.raises(LicenseError) as exc_info:
            get_entitlements("sl_live_testkey")
        assert exc_info.value.status_code == 0
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance
.venv/bin/python -m pytest tests/auth/test_license_client.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'auth.license_client'`

- [ ] **Step 3: Create `auth/license_client.py`**

```python
"""
HTTP client for the SolarLayout API.
Calls api.solarlayout.in for entitlement checks and usage reporting.
"""
import requests

BASE_URL = "https://api.solarlayout.in"
_TIMEOUT = (10, 15)  # (connect_timeout_s, read_timeout_s)


class LicenseError(Exception):
    """Raised when the API returns a non-2xx response or a network error occurs."""

    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def get_entitlements(key: str) -> dict:
    """
    GET /entitlements with the given license key.
    Returns the full JSON response body on 200.
    Raises LicenseError on any non-2xx response or network failure.
    """
    try:
        resp = requests.get(
            f"{BASE_URL}/entitlements",
            headers={"Authorization": f"Bearer {key}"},
            timeout=_TIMEOUT,
        )
    except requests.exceptions.RequestException as exc:
        raise LicenseError(0, str(exc)) from exc

    if resp.status_code != 200:
        try:
            body = resp.json()
            msg = body.get("error", {}).get("message", "Unknown error")
        except Exception:
            msg = f"HTTP {resp.status_code}"
        raise LicenseError(resp.status_code, msg)

    return resp.json()


def report_usage(key: str, feature: str) -> dict:
    """
    POST /usage/report with the given license key and feature name.
    Returns the full JSON response body on 200.
    Raises LicenseError on any non-2xx response or network failure.
    """
    try:
        resp = requests.post(
            f"{BASE_URL}/usage/report",
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json={"feature": feature},
            timeout=_TIMEOUT,
        )
    except requests.exceptions.RequestException as exc:
        raise LicenseError(0, str(exc)) from exc

    if resp.status_code != 200:
        try:
            body = resp.json()
            msg = body.get("error", {}).get("message", "Unknown error")
        except Exception:
            msg = f"HTTP {resp.status_code}"
        raise LicenseError(resp.status_code, msg)

    return resp.json()
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance
.venv/bin/python -m pytest tests/auth/test_license_client.py -v
```

Expected: 7 PASSED

- [ ] **Step 5: Run flake8**

```bash
.venv/bin/python -m flake8 auth/license_client.py tests/auth/test_license_client.py --max-line-length=100
```

Expected: no output

- [ ] **Step 6: Commit**

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance
git add auth/license_client.py tests/auth/test_license_client.py
git commit -m "feat(auth): add license_client.py — HTTP client for api.solarlayout.in"
```

---

## Task 4: Create `auth/workers.py` with tests

**Files:**
- Create: `auth/workers.py`
- Create: `tests/auth/test_workers.py`

The QThread pattern follows the existing `LayoutWorker` and `GHIFetchWorker` in `gui/main_window.py`. A QApplication instance is required to test QThread signals.

- [ ] **Step 1: Write the failing tests**

Create `tests/auth/test_workers.py`:

```python
"""
Tests for auth/workers.py — QThread workers for entitlements and usage reporting.

IMPORTANT: QThread tests require a QApplication instance and use QEventLoop to
wait for signals. PyQt5 must be importable in the test environment.
"""
import pytest
from PyQt5.QtWidgets import QApplication
from PyQt5.QtCore import QEventLoop, QTimer
from unittest.mock import patch
import sys

# One QApplication per process — reuse if already created
_app = QApplication.instance() or QApplication(sys.argv)


def _wait_for_signal(signal, timeout_ms: int = 2000):
    """Block until signal fires or timeout. Returns list of signal args."""
    received = []
    loop = QEventLoop()

    def _capture(*args):
        received.append(args)
        loop.quit()

    signal.connect(_capture)
    QTimer.singleShot(timeout_ms, loop.quit)
    loop.exec_()
    return received


def test_entitlements_worker_emits_result_on_success():
    payload = {
        "success": True,
        "data": {
            "licensed": True,
            "availableFeatures": ["plant_layout"],
            "totalCalculations": 10,
            "usedCalculations": 3,
            "remainingCalculations": 7,
        },
    }
    with patch("auth.license_client.get_entitlements", return_value=payload):
        from auth.workers import EntitlementsWorker
        worker = EntitlementsWorker("sl_live_testkey")
        results = _wait_for_signal(worker.result)
        worker.start()
        results = _wait_for_signal(worker.result)
        assert len(results) == 1
        assert results[0][0]["data"]["remainingCalculations"] == 7


def test_entitlements_worker_emits_error_on_license_error():
    from auth.license_client import LicenseError
    with patch("auth.license_client.get_entitlements",
               side_effect=LicenseError(401, "Invalid key")):
        from auth.workers import EntitlementsWorker
        worker = EntitlementsWorker("sl_live_badkey")
        worker.start()
        results = _wait_for_signal(worker.error)
        assert len(results) == 1
        status_code, message = results[0]
        assert status_code == 401
        assert "Invalid key" in message


def test_usage_report_worker_emits_result_on_success():
    payload = {"success": True, "data": {"recorded": True, "remainingCalculations": 6}}
    with patch("auth.license_client.report_usage", return_value=payload):
        from auth.workers import UsageReportWorker
        worker = UsageReportWorker("sl_live_testkey", "plant_layout")
        worker.start()
        results = _wait_for_signal(worker.result)
        assert len(results) == 1
        assert results[0][0]["data"]["remainingCalculations"] == 6


def test_usage_report_worker_emits_error_on_license_error():
    from auth.license_client import LicenseError
    with patch("auth.license_client.report_usage",
               side_effect=LicenseError(402, "No remaining calculations")):
        from auth.workers import UsageReportWorker
        worker = UsageReportWorker("sl_live_testkey", "plant_layout")
        worker.start()
        results = _wait_for_signal(worker.error)
        assert len(results) == 1
        status_code, message = results[0]
        assert status_code == 402
        assert "No remaining" in message
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance
.venv/bin/python -m pytest tests/auth/test_workers.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'auth.workers'`

- [ ] **Step 3: Create `auth/workers.py`**

```python
"""
QThread workers for SolarLayout API calls.
Follows the same pattern as LayoutWorker and GHIFetchWorker in gui/main_window.py.
"""
from PyQt5.QtCore import QThread, pyqtSignal
from auth import license_client
from auth.license_client import LicenseError


class EntitlementsWorker(QThread):
    """
    Fetches entitlements in a background thread.
    Emits result(dict) on success, error(int, str) on failure.
    """
    result = pyqtSignal(dict)
    error = pyqtSignal(int, str)  # (status_code, message)

    def __init__(self, key: str):
        super().__init__()
        self._key = key

    def run(self):
        try:
            data = license_client.get_entitlements(self._key)
            self.result.emit(data)
        except LicenseError as exc:
            self.error.emit(exc.status_code, exc.message)
        except Exception as exc:
            self.error.emit(0, str(exc))


class UsageReportWorker(QThread):
    """
    Reports feature usage in a background thread after a Generate completes.
    Fire-and-forget — never blocks the UI.
    Emits result(dict) on success, error(int, str) on failure.
    """
    result = pyqtSignal(dict)
    error = pyqtSignal(int, str)  # (status_code, message)

    def __init__(self, key: str, feature: str):
        super().__init__()
        self._key = key
        self._feature = feature

    def run(self):
        try:
            data = license_client.report_usage(self._key, self._feature)
            self.result.emit(data)
        except LicenseError as exc:
            self.error.emit(exc.status_code, exc.message)
        except Exception as exc:
            self.error.emit(0, str(exc))
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance
.venv/bin/python -m pytest tests/auth/test_workers.py -v
```

Expected: 4 PASSED

- [ ] **Step 5: Run flake8**

```bash
.venv/bin/python -m flake8 auth/workers.py tests/auth/test_workers.py --max-line-length=100
```

Expected: no output

- [ ] **Step 6: Commit**

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance
git add auth/workers.py tests/auth/test_workers.py
git commit -m "feat(auth): add QThread workers — EntitlementsWorker, UsageReportWorker"
```

---

## Task 5: Create `gui/license_key_dialog.py`

No automated tests for the dialog (QDialog is purely visual; behavior is covered by integration). Manual verification covered in acceptance criteria.

**Files:**
- Create: `gui/license_key_dialog.py`

- [ ] **Step 1: Create `gui/license_key_dialog.py`**

```python
"""
LicenseKeyDialog — modal dialog for entering and saving a SolarLayout license key.

Shows:
  - Masked input field (QLineEdit.Password)
  - "Save" button — validates prefix, saves via key_store, accepts dialog
  - "Cancel" button — rejects without saving
  - "Buy a license" link — opens pricing page in browser
"""
import webbrowser

from PyQt5.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout,
    QLabel, QLineEdit, QPushButton, QMessageBox,
)
from PyQt5.QtCore import Qt

from auth import key_store

_PRICING_URL = "https://solarlayout.in/#pricing"


class LicenseKeyDialog(QDialog):
    """Modal dialog for entering and saving a SolarLayout license key."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Enter License Key")
        self.setMinimumWidth(420)
        self.setModal(True)

        layout = QVBoxLayout(self)
        layout.setSpacing(10)

        heading = QLabel("SolarLayout License Key")
        heading.setStyleSheet("font-weight: bold; font-size: 14px;")
        layout.addWidget(heading)

        instruction = QLabel(
            "Enter your license key below. Keys start with <b>sl_live_</b>.<br/>"
            "Your key is stored securely in the OS credential store — never on disk."
        )
        instruction.setWordWrap(True)
        instruction.setTextFormat(Qt.RichText)
        layout.addWidget(instruction)

        self._key_input = QLineEdit()
        self._key_input.setEchoMode(QLineEdit.Password)
        self._key_input.setPlaceholderText("sl_live_...")
        self._key_input.setFixedHeight(34)
        layout.addWidget(self._key_input)

        buy_link = QLabel(
            '<a href="#">Don\'t have a key? '
            '<span style="color:#1a6faf;">Buy a license →</span></a>'
        )
        buy_link.setTextFormat(Qt.RichText)
        buy_link.setCursor(Qt.PointingHandCursor)
        buy_link.mousePressEvent = lambda _: webbrowser.open(_PRICING_URL)
        layout.addWidget(buy_link)

        btn_row = QHBoxLayout()
        btn_row.addStretch()
        self._cancel_btn = QPushButton("Cancel")
        self._cancel_btn.setFixedWidth(80)
        self._cancel_btn.clicked.connect(self.reject)

        self._save_btn = QPushButton("Save")
        self._save_btn.setFixedWidth(80)
        self._save_btn.setStyleSheet("font-weight: bold;")
        self._save_btn.setDefault(True)
        self._save_btn.clicked.connect(self._on_save)

        btn_row.addWidget(self._cancel_btn)
        btn_row.addWidget(self._save_btn)
        layout.addLayout(btn_row)

    def _on_save(self):
        key = self._key_input.text().strip()
        if not key.startswith("sl_live_"):
            QMessageBox.warning(
                self,
                "Invalid Key",
                "License keys must start with sl_live_\n\nPlease check your key and try again.",
            )
            return
        key_store.save_key(key)
        self.accept()

    def get_key(self) -> str:
        """Return the validated key entered by the user."""
        return self._key_input.text().strip()
```

- [ ] **Step 2: Run flake8**

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance
.venv/bin/python -m flake8 gui/license_key_dialog.py --max-line-length=100
```

Expected: no output

- [ ] **Step 3: Commit**

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance
git add gui/license_key_dialog.py
git commit -m "feat(gui): add LicenseKeyDialog — masked key entry with keyring save"
```

---

## Task 6: Wire auth into `gui/main_window.py`

**Files:**
- Modify: `gui/main_window.py`

This is the most complex task. Read `gui/main_window.py` carefully before editing. The three touch points are:
1. `__init__` (currently line 357) — add `_license_key`, `_entitlements`, and startup logic
2. New `_can_generate()` method — called from `_on_generate()`
3. `_on_layout_done()` (currently line 705) — fire `UsageReportWorker`

**Also add** these new methods: `_setup_license_banner`, `_show_no_key_banner`, `_dismiss_license_banner`, `_on_enter_key_clicked`, `_start_entitlements_check`, `_on_entitlements_result`, `_on_entitlements_error`, `_on_usage_reported`, `_on_usage_report_error`.

- [ ] **Step 1: Add imports to `gui/main_window.py`**

Find the existing imports block (around line 1–48). After the existing imports, add:

```python
from auth import key_store
from auth.workers import EntitlementsWorker, UsageReportWorker
from gui.license_key_dialog import LicenseKeyDialog
```

- [ ] **Step 2: Add license state fields to `__init__`**

Find `__init__` (line 357). After `self._ghi_worker: Optional[GHIFetchWorker] = None` (approximately line 377), add:

```python
        # --- License key state ---
        self._license_key: str | None = key_store.load_key()
        self._entitlements: dict | None = None
        self._entitlements_worker: Optional[EntitlementsWorker] = None
        self._usage_worker: Optional[UsageReportWorker] = None
        self._license_banner: Optional[QWidget] = None
```

Then at the end of `__init__`, after `self._build_ui()`:

```python
        self._setup_license_banner()
        if self._license_key:
            self._start_entitlements_check()
        else:
            self._show_no_key_banner()
```

- [ ] **Step 3: Add `_can_generate()` method**

Add this new method immediately before `_on_generate()` (around line 685):

```python
    def _can_generate(self) -> bool:
        """
        Return True if the user may run a Generate.
        Spike 7: always True — no hard blocking without a license key.
        Spike 7.1 will enforce free-tier quota here:
            if self._license_key is None:
                return self._free_quota_remaining > 0
        """
        return True
```

- [ ] **Step 4: Call `_can_generate()` at the top of `_on_generate()`**

Find `_on_generate()` (line 685). Insert the guard after the file existence check:

The current method starts:
```python
    def _on_generate(self):
        kmz_path = self.input_panel.get_kmz_path()
        if not kmz_path:
            QMessageBox.warning(self, "No file selected", "Please select a KMZ file first.")
            return
        if not os.path.isfile(kmz_path):
            QMessageBox.warning(self, "File not found", f"Cannot find:\n{kmz_path}")
            return
        params = self.input_panel.get_layout_params()
```

Change to:
```python
    def _on_generate(self):
        if not self._can_generate():
            # Spike 7.1 will show a purchase prompt here
            return
        kmz_path = self.input_panel.get_kmz_path()
        if not kmz_path:
            QMessageBox.warning(self, "No file selected", "Please select a KMZ file first.")
            return
        if not os.path.isfile(kmz_path):
            QMessageBox.warning(self, "File not found", f"Cannot find:\n{kmz_path}")
            return
        params = self.input_panel.get_layout_params()
```

- [ ] **Step 5: Fire `UsageReportWorker` at the end of `_on_layout_done()`**

Find `_on_layout_done()` (line 705). It currently ends with:
```python
        # Auto-fetch GHI from PVGIS using the site location + calculated tilt
        self._auto_fetch_ghi()
```

Add after that line:
```python
        # --- Report usage if licensed ---
        if self._license_key:
            self._usage_worker = UsageReportWorker(self._license_key, "plant_layout")
            self._usage_worker.result.connect(self._on_usage_reported)
            self._usage_worker.error.connect(self._on_usage_report_error)
            self._usage_worker.start()
```

- [ ] **Step 6: Add all license banner and callback methods**

Add these methods in a new section after `_show_help()` (around line 601) and before `_on_generate()`. Insert them as a block:

```python
    # ------------------------------------------------------------------
    # License key management
    # ------------------------------------------------------------------
    def _setup_license_banner(self):
        """Create the license banner widget (hidden by default)."""
        # QFrame is already imported at the top of main_window.py
        self._license_banner = QFrame(self.centralWidget())
        self._license_banner.setStyleSheet(
            "QFrame { background-color: #fff3cd; border: 1px solid #ffc107; "
            "border-radius: 4px; padding: 4px; }"
        )
        banner_layout = QHBoxLayout(self._license_banner)
        banner_layout.setContentsMargins(8, 4, 8, 4)

        self._banner_label = QLabel(
            "No license key — some features may be limited."
        )
        self._banner_label.setStyleSheet("color: #856404;")
        banner_layout.addWidget(self._banner_label)
        banner_layout.addStretch()

        enter_btn = QPushButton("Enter key")
        enter_btn.setFixedHeight(24)
        enter_btn.setFixedWidth(80)
        enter_btn.clicked.connect(self._on_enter_key_clicked)
        banner_layout.addWidget(enter_btn)

        dismiss_btn = QPushButton("Dismiss")
        dismiss_btn.setFixedHeight(24)
        dismiss_btn.setFixedWidth(70)
        dismiss_btn.clicked.connect(self._dismiss_license_banner)
        banner_layout.addWidget(dismiss_btn)

        # Insert banner at top of central widget's root layout
        root_layout = self.centralWidget().layout()
        root_layout.insertWidget(0, self._license_banner)
        self._license_banner.hide()

    def _show_no_key_banner(self):
        """Show the yellow 'no license key' banner."""
        if self._license_banner:
            self._banner_label.setText(
                "No license key — some features may be limited."
            )
            self._license_banner.setStyleSheet(
                "QFrame { background-color: #fff3cd; border: 1px solid #ffc107; "
                "border-radius: 4px; padding: 4px; }"
            )
            self._license_banner.show()

    def _dismiss_license_banner(self):
        if self._license_banner:
            self._license_banner.hide()

    def _on_enter_key_clicked(self):
        """Open the license key dialog; on Save, start entitlements check."""
        dlg = LicenseKeyDialog(self)
        if dlg.exec_() == LicenseKeyDialog.Accepted:
            self._license_key = dlg.get_key()
            self._dismiss_license_banner()
            self._start_entitlements_check()

    def _start_entitlements_check(self):
        """Launch EntitlementsWorker to fetch entitlements in background."""
        if not self._license_key:
            return
        self._entitlements_worker = EntitlementsWorker(self._license_key)
        self._entitlements_worker.result.connect(self._on_entitlements_result)
        self._entitlements_worker.error.connect(self._on_entitlements_error)
        self._entitlements_worker.start()

    def _on_entitlements_result(self, data: dict):
        self._entitlements = data
        remaining = data.get("data", {}).get("remainingCalculations", 0)
        self._dismiss_license_banner()
        if remaining == 0:
            self.status_bar.showMessage(
                "0 calculations remaining — purchase more at solarlayout.in"
            )
        else:
            self.status_bar.showMessage(
                f"{remaining} calculation(s) remaining"
            )

    def _on_entitlements_error(self, status_code: int, message: str):
        if status_code == 401:
            # Invalid or revoked key — clear it
            key_store.delete_key()
            self._license_key = None
            self._entitlements = None
            self.status_bar.showMessage(
                "License key invalid — please re-enter your key"
            )
            self._show_no_key_banner()
        else:
            # Network error or server error — non-fatal
            print(f"[auth] Entitlements check failed ({status_code}): {message}")
            self.status_bar.showMessage(
                "Could not verify license — check your connection"
            )

    def _on_usage_reported(self, data: dict):
        remaining = data.get("data", {}).get("remainingCalculations", 0)
        self.status_bar.showMessage(f"{remaining} calculation(s) remaining")

    def _on_usage_report_error(self, status_code: int, message: str):
        print(f"[auth] Usage report failed ({status_code}): {message}")
        if status_code == 402:
            if self._license_banner:
                self._banner_label.setText(
                    "Calculations exhausted — purchase more at solarlayout.in"
                )
                self._license_banner.setStyleSheet(
                    "QFrame { background-color: #f8d7da; border: 1px solid #f5c2c7; "
                    "border-radius: 4px; padding: 4px; }"
                )
                self._license_banner.show()
        # All other errors: log only, never interrupt the user
```

- [ ] **Step 7: Run flake8 on the modified file**

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance
.venv/bin/python -m flake8 gui/main_window.py gui/license_key_dialog.py --max-line-length=100
```

Expected: no output

- [ ] **Step 8: Run all tests**

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance
.venv/bin/python -m pytest tests/ -v
```

Expected: all tests pass (key_store: 5, license_client: 7, workers: 4 = 16 total)

- [ ] **Step 9: Start the app and verify it launches without error**

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance
.venv/bin/python main.py
```

Expected: App window opens. If no key is stored, yellow banner appears at top. No crash.

- [ ] **Step 10: Commit**

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance
git add gui/main_window.py
git commit -m "feat(gui): wire license key auth into MainWindow — banner, entitlements, usage reporting"
```

---

## Task 7: Write `docs/PRD-license-key-integration.md`

**Files:**
- Create: `docs/PRD-license-key-integration.md`

- [ ] **Step 1: Create the PRD**

```markdown
# PRD: License Key Integration for SolarLayout Python Apps

**Version:** 1.0  
**Author:** SolarLayout Engineering  
**Date:** 2026-04-22  
**Branch:** `add-auth`  
**Audience:** Prasanta Patra (developer implementing this in future Python apps)

---

## 1. Business Context

SolarLayout sells computational capacity to solar PV layout engineers in India. When a
customer purchases a plan (Basic, Pro, or Pro+) from solarlayout.in, they receive a
**license key** (format: `sl_live_<random>`). This key grants a fixed number of **calculations**
— one calculation = one Generate Layout click.

The license key system lets SolarLayout enforce entitlements without requiring users to log in
from inside the desktop app. The key is stored once (via OS credential store) and works silently
on all subsequent launches.

---

## 2. Feature Summary (What the User Sees)

| Scenario | UI behaviour |
|---|---|
| First run, no key stored | Yellow banner at top of window: "No license key — [Enter key] [Dismiss]" |
| User clicks "Enter key" | Modal dialog opens with masked input field and "Buy a license" link |
| User saves a valid key | Banner dismissed; background entitlement check starts; status bar updates |
| Key saved, quota available | Status bar: "7 calculation(s) remaining" |
| Generate clicked | Layout runs normally — no interruption |
| Generate completes | Usage reported silently; status bar updates to new count |
| Quota exhausted (after generate) | Red banner: "Calculations exhausted — purchase more at solarlayout.in" |
| Key invalid / revoked | Key deleted from store; status bar: "License key invalid — please re-enter" |
| Network offline | Soft warning in status bar only; app fully usable |

---

## 3. Freemium-Forward Design

Blocking the app before any generation would kill conversion — users will not buy before
seeing the product work. Therefore:

- **No blocking modal at startup.** Even without a key, users can always click Generate.
- The `_can_generate()` method returns `True` unconditionally in this version.
- **Spike 7.1** will add free-tier quota: N free generations per plan tier.
  Only after the free quota is exhausted will `_can_generate()` return `False`.
- `_can_generate()` is isolated so Spike 7.1 only changes that one method.

---

## 4. Architecture Overview

```
auth/
  __init__.py
  license_client.py    HTTP calls to api.solarlayout.in (requests library)
  key_store.py         OS-native credential storage (keyring library)
  workers.py           QThread background workers (never block the main thread)

gui/
  license_key_dialog.py   Masked key entry dialog
  main_window.py          Three touch points (see Section 6)
```

**Rule: all API calls happen in QThread workers, never in the main thread.** If you call
`license_client.get_entitlements()` directly on the main thread, the app will freeze.

---

## 5. API Contracts

Base URL: `https://api.solarlayout.in`  
All requests require: `Authorization: Bearer sl_live_<your-key>`

### GET /entitlements

```
GET /entitlements
Authorization: Bearer sl_live_<key>

200 OK:
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

401 Unauthorized:
{ "success": false, "error": { "code": "UNAUTHORIZED", "message": "Invalid or revoked license key" } }
```

### POST /usage/report

```
POST /usage/report
Authorization: Bearer sl_live_<key>
Content-Type: application/json
{ "feature": "plant_layout" }

200 OK:
{
  "success": true,
  "data": { "recorded": true, "remainingCalculations": 6 }
}

400 Bad Request: unknown feature key
401 Unauthorized: invalid/revoked key
402 Payment Required: no remaining calculations
409 Conflict: concurrent report in progress (retry after 1s)
```

**Feature key:** always `"plant_layout"` per Generate click. Exports are not reported.

---

## 6. Three Integration Touch Points in `main_window.py`

### Touch Point 1: Startup (in `__init__`)

```python
self._license_key: str | None = key_store.load_key()
self._entitlements: dict | None = None
self._setup_license_banner()
if self._license_key:
    self._start_entitlements_check()   # silent background check
else:
    self._show_no_key_banner()         # yellow banner
```

### Touch Point 2: `_can_generate()` guard

```python
def _can_generate(self) -> bool:
    # Spike 7: always True — no hard blocking without a license key.
    # Spike 7.1 will enforce free-tier quota here:
    #     if self._license_key is None:
    #         return self._free_quota_remaining > 0
    return True
```

Called at the top of `_on_generate()`:

```python
def _on_generate(self):
    if not self._can_generate():
        return   # Spike 7.1 shows purchase prompt here
    ...
```

### Touch Point 3: Post-generate usage report (in `_on_layout_done()`)

```python
if self._license_key:
    self._usage_worker = UsageReportWorker(self._license_key, "plant_layout")
    self._usage_worker.result.connect(self._on_usage_reported)
    self._usage_worker.error.connect(self._on_usage_report_error)
    self._usage_worker.start()
    # _usage_worker kept as instance variable to prevent GC before thread finishes
```

---

## 7. Sequence Diagrams

### First Run

```
App starts
  → key_store.load_key() → None
  → _show_no_key_banner() → yellow banner visible
User clicks "Enter key"
  → LicenseKeyDialog opens
User types sl_live_... → clicks Save
  → key_store.save_key(key)
  → dialog.accept()
  → _start_entitlements_check()
  → EntitlementsWorker starts (background)
  → _on_entitlements_result(data)
  → status_bar: "7 calculation(s) remaining"
```

### Normal Startup (key stored)

```
App starts
  → key_store.load_key() → "sl_live_..."
  → _start_entitlements_check()
  → EntitlementsWorker starts (background)
  UI is immediately usable
  → _on_entitlements_result(data)
  → status_bar: "7 calculation(s) remaining"
User clicks Generate
  → _can_generate() → True
  → LayoutWorker starts
  → _on_layout_done(results)
  → UsageReportWorker starts (background)
  → _on_usage_reported(data)
  → status_bar: "6 calculation(s) remaining"
```

---

## 8. Error Handling Policy

**Principle: all API errors are non-fatal. The app must always remain usable.**

| HTTP Status | When | App Behaviour |
|---|---|---|
| 200 | Success | Normal flow |
| 401 | Key invalid / revoked | Clear stored key; show re-enter message in status bar |
| 402 | No remaining calculations | Red banner; app still usable |
| 409 | Concurrent report | Log only; user unaffected |
| 0 | Network error / timeout | Log to console; soft status bar warning |
| 5xx | Server error | Log to console; user unaffected |

---

## 9. `requirements.txt` Changes

Add `keyring>=24.0.0`. The `requests` library is already present.

```
keyring>=24.0.0
```

`keyring` uses the native OS secret store:
- macOS: Keychain
- Windows: Windows Credential Manager (Credential Locker)
- Linux: Secret Service (GNOME Keyring / KWallet)

No plaintext credentials ever touch the filesystem.

---

## 10. Spike 7.1 Extension Points

The following change in Spike 7.1 is **additive only** — no existing code needs restructuring:

```python
# In main_window.py — only this method changes:
def _can_generate(self) -> bool:
    if self._license_key is None:
        return self._free_quota_remaining > 0   # new field in 7.1
    return True  # licensed users always proceed
```

The `auth/` module, `LicenseKeyDialog`, and the three touch points are unchanged.

---

## 11. Definition of Done

1. `flake8 auth/ gui/license_key_dialog.py tests/ --max-line-length=100` — no output
2. `pytest tests/ -v` — all pass
3. App starts without error regardless of network state
4. First-run flow: yellow banner visible, dialog opens, key saved, entitlements fetched
5. Normal startup: status bar shows remaining count
6. Generate: layout completes, usage reported, count decrements in status bar
7. Quota exhausted: red banner shown, Generate still works
8. Both `docs/PRD-license-key-integration.md` and `docs/CLAUDE_CODE_PROMPT.md` committed
```

- [ ] **Step 2: Run flake8 on auth and tests (final gate check)**

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance
.venv/bin/python -m flake8 auth/ tests/ gui/license_key_dialog.py --max-line-length=100
```

Expected: no output

- [ ] **Step 3: Commit**

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance
git add docs/PRD-license-key-integration.md
git commit -m "docs: add PRD for license key integration (Spike 7)"
```

---

## Task 8: Write `docs/CLAUDE_CODE_PROMPT.md`

**Files:**
- Create: `docs/CLAUDE_CODE_PROMPT.md`

This is the standalone prompt Prasanta will paste into Claude Code to implement the same integration in a new Python/PyQt5 app.

- [ ] **Step 1: Create `docs/CLAUDE_CODE_PROMPT.md`**

````markdown
# Claude Code Prompt: Implement SolarLayout License Key Integration

You are implementing license key authentication for a SolarLayout Python desktop application.
This is the same integration already done in `PVlayout_Advance` (this repo). Read that
implementation first, then apply the same pattern to this app.

---

## Context

SolarLayout sells per-calculation licenses to solar PV engineers. License keys look like
`sl_live_<random>`. Each Generate click consumes one calculation. The API lives at
`https://api.solarlayout.in`.

This app uses **PyQt5**. All API calls MUST happen in QThread workers — never in the
main thread. This repo is on the `add-auth` branch.

---

## Reference Implementation

Before writing any code, read these files in this repo:
- `auth/__init__.py`
- `auth/key_store.py` — OS credential storage
- `auth/license_client.py` — HTTP client
- `auth/workers.py` — QThread workers
- `gui/license_key_dialog.py` — key entry dialog
- `gui/main_window.py` — three integration touch points
- `tests/auth/test_key_store.py`
- `tests/auth/test_license_client.py`
- `tests/auth/test_workers.py`

The reference implementation is complete and tested. Apply the same structure.

---

## Files to Create

| File | Responsibility |
|---|---|
| `auth/__init__.py` | Empty package marker |
| `auth/key_store.py` | `save_key`, `load_key`, `delete_key` via `keyring` |
| `auth/license_client.py` | `get_entitlements`, `report_usage`, `LicenseError` |
| `auth/workers.py` | `EntitlementsWorker(QThread)`, `UsageReportWorker(QThread)` |
| `gui/license_key_dialog.py` | `LicenseKeyDialog(QDialog)` — masked input, Save, Cancel, Buy link |
| `tests/__init__.py` | Empty |
| `tests/auth/__init__.py` | Empty |
| `tests/auth/test_key_store.py` | Mock `keyring`, test all 3 functions |
| `tests/auth/test_license_client.py` | Mock `requests`, test all status codes |
| `tests/auth/test_workers.py` | QEventLoop signal tests |

---

## Files to Modify

### `requirements.txt`
Add: `keyring>=24.0.0`, `pytest>=7.0`, `flake8>=6.0`

### `gui/main_window.py` — Three Touch Points

**Touch point 1: in `__init__`**, after UI is built:
```python
self._license_key: str | None = key_store.load_key()
self._entitlements: dict | None = None
self._entitlements_worker = None
self._usage_worker = None
self._license_banner = None
self._setup_license_banner()
if self._license_key:
    self._start_entitlements_check()
else:
    self._show_no_key_banner()
```

**Touch point 2: add `_can_generate()` method**:
```python
def _can_generate(self) -> bool:
    # Spike 7: always True — no hard blocking without a license key.
    # Spike 7.1 will enforce free-tier quota here.
    return True
```

Call it at the top of your generate method:
```python
def _on_generate(self):  # or whatever your generate method is called
    if not self._can_generate():
        return
    ...
```

**Touch point 3: at the end of your generate-done callback**, after results are stored:
```python
if self._license_key:
    self._usage_worker = UsageReportWorker(self._license_key, "plant_layout")
    self._usage_worker.result.connect(self._on_usage_reported)
    self._usage_worker.error.connect(self._on_usage_report_error)
    self._usage_worker.start()
```

---

## API Contracts

### GET /entitlements
```
Authorization: Bearer sl_live_<key>
→ 200: { "success": true, "data": { "licensed": true, "availableFeatures": ["plant_layout"],
          "totalCalculations": 10, "usedCalculations": 3, "remainingCalculations": 7 } }
→ 401: { "success": false, "error": { "code": "UNAUTHORIZED", "message": "..." } }
```

### POST /usage/report
```
Authorization: Bearer sl_live_<key>
Content-Type: application/json
{ "feature": "plant_layout" }
→ 200: { "success": true, "data": { "recorded": true, "remainingCalculations": 6 } }
→ 401: invalid key
→ 402: no remaining calculations
→ 409: concurrent report (retry after 1s)
```

Feature key: always `"plant_layout"` per Generate click. Exports are NOT reported.

---

## Error Handling Rules

**All API errors MUST be non-fatal. Never interrupt the user.**

| Status | Action |
|---|---|
| 401 | Clear stored key; show "License key invalid" in status bar |
| 402 | Show soft banner: "Calculations exhausted — purchase more" |
| 409 | Log only; ignore |
| 0 / 5xx / network | Log to console with `print("[auth] ...")`; soft status bar warning |

---

## TDD Requirement

Write failing tests FIRST for each file in `auth/`. Use `unittest.mock`:
- `key_store.py`: mock `keyring.set_password`, `keyring.get_password`, `keyring.delete_password`
- `license_client.py`: mock `requests.get` and `requests.post` — test each status code
- `workers.py`: use `QEventLoop` + `QTimer.singleShot` to wait for signals (see reference test)

Run tests after each file: `.venv/bin/python -m pytest tests/auth/ -v`

---

## Pre-Commit Gate

Run before every commit:
```bash
.venv/bin/python -m flake8 auth/ gui/license_key_dialog.py tests/ --max-line-length=100
.venv/bin/python -m pytest tests/ -v
```

Both must pass with zero errors.

---

## `_can_generate()` Contract

This method MUST return `True` unconditionally in this spike. Do NOT add blocking logic.
Add a comment explaining that Spike 7.1 will add free-tier quota enforcement here.
The method signature and name must match exactly so Spike 7.1 can extend it.

---

## Definition of Done

1. `flake8` passes with no output
2. All tests pass
3. App starts without crash whether or not a key is stored
4. First-run: yellow banner, dialog opens, key saved, entitlements fetched
5. Normal startup: status bar shows remaining count
6. Generate completes: usage reported, count decrements
7. Network offline: app still fully usable
````

- [ ] **Step 2: Commit**

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance
git add docs/CLAUDE_CODE_PROMPT.md
git commit -m "docs: add Claude Code implementation prompt for Spike 7 (Prasanta)"
```

---

## Task 9: Final gate check and push

- [ ] **Step 1: Run the full gate**

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance
.venv/bin/python -m flake8 auth/ gui/license_key_dialog.py tests/ --max-line-length=100
.venv/bin/python -m pytest tests/ -v
```

Expected: no flake8 output, all 16 tests pass

- [ ] **Step 2: Start the app and do a quick smoke test**

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance
.venv/bin/python main.py
```

Expected: App opens. Yellow banner visible (if no key stored). No crash.

- [ ] **Step 3: Check git log**

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance
git log --oneline -10
```

Expected commits visible:
- `docs: add Claude Code implementation prompt for Spike 7 (Prasanta)`
- `docs: add PRD for license key integration (Spike 7)`
- `feat(gui): wire license key auth into MainWindow — banner, entitlements, usage reporting`
- `feat(gui): add LicenseKeyDialog — masked key entry with keyring save`
- `feat(auth): add QThread workers — EntitlementsWorker, UsageReportWorker`
- `feat(auth): add license_client.py — HTTP client for api.solarlayout.in`
- `feat(auth): add key_store.py — OS credential storage via keyring`
- `chore: add keyring, pytest, flake8 to requirements.txt`

- [ ] **Step 4: Push `add-auth` branch**

```bash
cd /Users/arunkpatra/codebase/PVlayout_Advance
git push origin add-auth
```

Expected: `Branch 'add-auth' set up to track remote branch`

---

## Acceptance Criteria Checklist

Before declaring Spike 7 done, verify each item manually:

- [ ] `flake8 auth/ gui/license_key_dialog.py tests/ --max-line-length=100` — no output
- [ ] `pytest tests/ -v` — 16 tests pass
- [ ] App starts: no crash, yellow banner if no key stored
- [ ] Enter key dialog: opens, validates `sl_live_` prefix, rejects invalid format
- [ ] After saving valid key: banner dismissed, status bar shows remaining count
- [ ] Generate layout: completes normally, usage reported, count decrements
- [ ] Quota exhausted (402 from usage report): red banner, app still usable
- [ ] Kill network (airplane mode), restart app: no crash, soft warning in status bar
- [ ] 401 from entitlements: key cleared from keyring, re-enter banner shown
- [ ] `docs/PRD-license-key-integration.md` present and readable
- [ ] `docs/CLAUDE_CODE_PROMPT.md` present and readable
