#!/usr/bin/env bash
#
# Smoke-test a freshly built pvlayout-engine binary.
#
# Used both locally after `uv run pyinstaller pvlayout-engine.spec` and by the
# S4/S15 CI workflows to verify each OS-specific artifact.
#
# Launches the binary, waits for the READY line on stdout, then issues a
# /health probe. Exits 0 on success, non-zero on failure.
#
# Usage:
#   ./scripts/smoke_binary.sh [path-to-binary]
#
# Defaults to dist/pvlayout-engine or dist/pvlayout-engine.exe.
#
set -euo pipefail

BIN="${1:-}"
if [[ -z "$BIN" ]]; then
  if [[ -f "dist/pvlayout-engine.exe" ]]; then
    BIN="dist/pvlayout-engine.exe"
  elif [[ -f "dist/pvlayout-engine" ]]; then
    BIN="dist/pvlayout-engine"
  else
    echo "ERROR: no binary at dist/pvlayout-engine[.exe]" >&2
    exit 1
  fi
fi

if [[ ! -x "$BIN" ]]; then
  echo "ERROR: $BIN is not executable" >&2
  exit 1
fi

# Cold-start tolerance. PyInstaller --onefile unpacks ~50 MB of libs into a
# temp dir on first launch — ~10 s on macOS, ~5 s on Linux, ~3–5 s on
# Windows with SSD. CI runners are sometimes slower; allow generously.
BOOT_TIMEOUT="${BOOT_TIMEOUT:-30}"

TOKEN="smoke-test-token-at-least-sixteen-chars-long"
STDOUT_LOG="$(mktemp)"
STDERR_LOG="$(mktemp)"
trap 'rm -f "$STDOUT_LOG" "$STDERR_LOG"; kill $BIN_PID 2>/dev/null || true' EXIT

echo "→ Launching $BIN"
PVLAYOUT_SIDECAR_TOKEN="$TOKEN" "$BIN" >"$STDOUT_LOG" 2>"$STDERR_LOG" &
BIN_PID=$!

# Poll for READY line up to BOOT_TIMEOUT seconds.
echo "→ Waiting for READY line (up to ${BOOT_TIMEOUT}s)..."
PORT=""
for _ in $(seq 1 "$BOOT_TIMEOUT"); do
  if grep -q '^READY' "$STDOUT_LOG" 2>/dev/null; then
    PORT=$(grep -oE '\{.*\}' "$STDOUT_LOG" | python3 -c "import json,sys; print(json.load(sys.stdin)['port'])")
    break
  fi
  if ! kill -0 "$BIN_PID" 2>/dev/null; then
    echo "ERROR: binary exited before announcing READY" >&2
    echo "--- stdout ---" >&2
    cat "$STDOUT_LOG" >&2
    echo "--- stderr ---" >&2
    cat "$STDERR_LOG" >&2
    exit 2
  fi
  sleep 1
done

if [[ -z "$PORT" ]]; then
  echo "ERROR: no READY line after ${BOOT_TIMEOUT}s" >&2
  cat "$STDERR_LOG" >&2
  exit 3
fi

echo "→ READY on port $PORT"

# Probe /health
HEALTH_STATUS=$(curl -s -o /tmp/health-body -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:$PORT/health")
HEALTH_BODY=$(cat /tmp/health-body)

if [[ "$HEALTH_STATUS" != "200" ]]; then
  echo "ERROR: /health returned $HEALTH_STATUS, body: $HEALTH_BODY" >&2
  exit 4
fi

echo "→ /health OK: $HEALTH_BODY"

# Probe that /health without token → 401
UNAUTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/health")
if [[ "$UNAUTH_STATUS" != "401" ]]; then
  echo "ERROR: /health without token returned $UNAUTH_STATUS, expected 401" >&2
  exit 5
fi

echo "→ /health (unauth) correctly rejects: 401"
echo "✓ Smoke passed"
