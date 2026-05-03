#!/usr/bin/env bash
#
# Smoke-test the parallel ProcessPoolExecutor path inside a freshly built
# pvlayout-engine binary. Verifies that worker processes can be spawned
# from the PyInstaller bundle's _MEIPASS context.
#
# This complements scripts/smoke_binary.sh, which only exercises /health.
# The risk this script targets is documented in
# docs/post-parity/PRD-cable-compute-strategy.md §3.3 risk #1: workers may
# fail to import pvlayout_core when re-executing under the spawn start
# method inside a frozen bundle.
#
# Strategy:
#   1. Launch the bundle.
#   2. Wait for READY (long timeout — matplotlib font cache cold-start).
#   3. POST a multi-plot KMZ to /parse-kmz.
#   4. POST /layout with enable_cable_calc=true. This triggers parallel
#      dispatch when len(boundaries) > 1.
#   5. Within ~5 s of the dispatch, count Python worker children of the
#      sidecar PID. If workers are running, the spawn succeeded.
#   6. Kill the binary and assert no BrokenProcessPool / worker import
#      errors appeared in stderr.
#
# We do NOT wait for /layout to complete — complex-plant takes minutes.
# We just verify the spawn step works, which is the actual risk.
#
# Usage:
#   ./scripts/smoke_parallel.sh [path-to-binary]
#
# Defaults to dist/pvlayout-engine.
set -euo pipefail

BIN="${1:-dist/pvlayout-engine}"
# KMZ fixtures moved to pvlayout_core per cloud-offload C2.
# Script runs from python/pvlayout_engine working-directory in CI.
KMZ="../pvlayout_core/tests/golden/kmz/complex-plant-layout.kmz"

if [[ ! -x "$BIN" ]]; then
  echo "ERROR: $BIN is not executable" >&2
  exit 1
fi
if [[ ! -f "$KMZ" ]]; then
  echo "ERROR: $KMZ not found" >&2
  exit 1
fi

BOOT_TIMEOUT="${BOOT_TIMEOUT:-120}"
TOKEN="smoke-test-token-at-least-sixteen-chars-long"
STDOUT_LOG="$(mktemp)"
STDERR_LOG="$(mktemp)"

cleanup() {
  if [[ -n "${BIN_PID:-}" ]]; then
    kill -9 "$BIN_PID" 2>/dev/null || true
  fi
  rm -f "$STDOUT_LOG" "$STDERR_LOG"
}
trap cleanup EXIT

echo "→ Launching $BIN"
PVLAYOUT_SIDECAR_TOKEN="$TOKEN" "$BIN" >"$STDOUT_LOG" 2>"$STDERR_LOG" &
BIN_PID=$!

# Wait for READY.
echo "→ Waiting for READY (up to ${BOOT_TIMEOUT}s)..."
PORT=""
for _ in $(seq 1 "$BOOT_TIMEOUT"); do
  if grep -q '^READY' "$STDOUT_LOG" 2>/dev/null; then
    PORT=$(grep -oE '\{.*\}' "$STDOUT_LOG" | python3 -c "import json,sys; print(json.load(sys.stdin)['port'])")
    break
  fi
  if ! kill -0 "$BIN_PID" 2>/dev/null; then
    echo "ERROR: binary exited before READY" >&2
    cat "$STDERR_LOG" >&2
    exit 2
  fi
  sleep 1
done

if [[ -z "$PORT" ]]; then
  echo "ERROR: no READY after ${BOOT_TIMEOUT}s" >&2
  cat "$STDERR_LOG" >&2
  exit 3
fi
echo "→ READY on port $PORT"

# Parse the multi-plot KMZ.
echo "→ Parsing $KMZ"
PARSED_BODY=$(curl -fsS \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@$KMZ" \
  "http://127.0.0.1:$PORT/parse-kmz")

BOUNDARY_COUNT=$(echo "$PARSED_BODY" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['boundaries']))")
echo "→ Parsed: $BOUNDARY_COUNT boundaries"
if [[ "$BOUNDARY_COUNT" -lt 2 ]]; then
  echo "ERROR: KMZ must be multi-plot for parallel test; got $BOUNDARY_COUNT" >&2
  exit 4
fi

# POST /layout with cable_calc=true to trigger parallel dispatch.
# We don't wait for completion — kick it off in the background.
echo "→ POST /layout with enable_cable_calc=true (will kill before completion)"
LAYOUT_BODY=$(python3 - <<PYEOF
import json, sys
parsed = json.loads("""$PARSED_BODY""")
print(json.dumps({
    "parsed_kmz": parsed,
    "params": {
        "enable_cable_calc": True,
    }
}))
PYEOF
)

curl -fsS \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$LAYOUT_BODY" \
  --max-time 30 \
  "http://127.0.0.1:$PORT/layout" > /tmp/layout-resp.json 2>/tmp/layout-err.txt &
LAYOUT_CURL_PID=$!

# Wait up to 60 s for workers to spawn. ProcessPoolExecutor spawns them
# on first map() call; with PyInstaller spawn-bundling each worker rebuilds
# its own matplotlib font cache on first import (~5-15 s per worker on a
# fresh system). Workers are not direct children of BIN_PID under spawn
# (the spawn launcher inserts itself), so we count them by matching the
# bundle name across the process table.
echo "→ Watching for worker processes (up to 60s)..."
WORKER_COUNT=0
for _ in $(seq 1 60); do
  # Count all processes whose argv matches the bundle binary path.
  # Parent (1) + N workers = N+1. With 6 boundaries we expect 7 total.
  WORKER_COUNT=$(pgrep -af "pvlayout-engine" | wc -l | tr -d ' ')
  if [[ "$WORKER_COUNT" -ge 3 ]]; then
    echo "→ Detected $WORKER_COUNT pvlayout-engine processes (parent + workers)"
    break
  fi
  sleep 1
done

if [[ "$WORKER_COUNT" -lt 3 ]]; then
  echo "ERROR: only $WORKER_COUNT pvlayout-engine processes after 60s (expected ≥3 for parent+workers)" >&2
  echo "--- sidecar stderr ---" >&2
  cat "$STDERR_LOG" >&2
  exit 5
fi

# Check stderr for known worker-failure patterns.
if grep -E "BrokenProcessPool|ModuleNotFoundError|ImportError" "$STDERR_LOG" >/dev/null 2>&1; then
  echo "ERROR: worker error detected in stderr" >&2
  grep -E "BrokenProcessPool|ModuleNotFoundError|ImportError" "$STDERR_LOG" >&2
  exit 6
fi

echo "✓ Parallel spawn smoke passed"
echo "  - Workers spawned: $WORKER_COUNT"
echo "  - No BrokenProcessPool / ImportError in stderr"

# Cleanup happens via trap.
exit 0
