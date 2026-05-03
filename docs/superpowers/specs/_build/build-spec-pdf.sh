#!/usr/bin/env bash
#
# build-spec-pdf.sh — generate a print-quality PDF from a markdown spec.
#
# Pipeline:  pandoc <md> --to=html5 --css=spec-pdf.css → tmp HTML
#            weasyprint <html> → <spec>.pdf  (sibling to input)
#
# Usage:
#     ./build-spec-pdf.sh <path-to-spec.md> [--header <text>]
#
# Header text appears top-left of every page except page 1. Defaults to
# the first H1 of the markdown ("# Title …" line).
#
# Dependencies (macOS):
#   brew install pandoc pango glib cairo gobject-introspection
#   pip3 install --user weasyprint pypdf      # pypdf optional (page count)
#
# See README.md (sibling) for full details + troubleshooting.

set -euo pipefail

# ---------- locate self ----------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CSS_TEMPLATE="$SCRIPT_DIR/spec-pdf.css"

usage() {
    cat <<EOF
Usage: $0 <path-to-spec.md> [--header <text>]

Generates a print-quality PDF sibling to the input markdown file.

Options:
  --header <text>   Running-header text for every page except page 1.
                    Default: first H1 of the markdown.

See README.md (sibling to this script) for dependencies + details.
EOF
    exit 1
}

# ---------- parse args ----------
[[ $# -lt 1 ]] && usage
INPUT="$1"; shift || true
HEADER=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --header) HEADER="${2:-}"; shift 2 ;;
        -h|--help) usage ;;
        *) echo "ERROR: unknown arg: $1" >&2; usage ;;
    esac
done

# ---------- input + CSS sanity ----------
[[ ! -f "$INPUT" ]]        && { echo "ERROR: input not found: $INPUT" >&2; exit 2; }
[[ ! -f "$CSS_TEMPLATE" ]] && { echo "ERROR: CSS not found: $CSS_TEMPLATE" >&2; exit 2; }

# ---------- dependency checks ----------
for cmd in pandoc weasyprint; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "ERROR: '$cmd' not found in PATH." >&2
        echo "  Install (macOS): brew install pandoc; pip3 install --user weasyprint" >&2
        echo "  See README.md for full setup." >&2
        exit 3
    fi
done

# ---------- macOS dyld dance for weasyprint's C deps ----------
if [[ "$(uname)" == "Darwin" ]] && [[ -d /opt/homebrew/lib ]]; then
    export DYLD_FALLBACK_LIBRARY_PATH="${DYLD_FALLBACK_LIBRARY_PATH:-}:/opt/homebrew/lib"
fi

# ---------- derive title + header ----------
TITLE="$(grep -m1 '^# ' "$INPUT" | sed 's/^# //' || true)"
[[ -z "$TITLE" ]] && TITLE="$(basename "$INPUT" .md)"
[[ -z "$HEADER" ]] && HEADER="$TITLE"

OUTPUT="${INPUT%.md}.pdf"

# ---------- temp files ----------
TMP_HTML="$(mktemp -t spec-pdf.XXXXXX).html"
TMP_CSS="$(mktemp -t spec-pdf.XXXXXX).css"
trap 'rm -f "$TMP_HTML" "$TMP_CSS"' EXIT

# ---------- substitute header into CSS ----------
# Escape `&`, `\`, `|` in HEADER so sed doesn't choke.
HEADER_ESC="$(printf '%s' "$HEADER" | sed -e 's/[&\\|]/\\&/g')"
sed "s|__HEADER_TEXT__|${HEADER_ESC}|g" "$CSS_TEMPLATE" > "$TMP_CSS"

# ---------- pandoc → standalone HTML ----------
echo "→ Building HTML"
echo "  input:  $INPUT"
echo "  title:  $TITLE"
echo "  header: $HEADER"
pandoc "$INPUT" \
    --from=gfm+attributes \
    --to=html5 \
    --standalone \
    --toc --toc-depth=3 \
    --metadata title="$TITLE" \
    --css="$TMP_CSS" \
    --embed-resources \
    -o "$TMP_HTML"

# ---------- weasyprint → PDF ----------
echo "→ Rendering PDF"
weasyprint "$TMP_HTML" "$OUTPUT" 2>&1 | grep -v '^WARNING' || true

# ---------- report ----------
SIZE="$(du -h "$OUTPUT" | cut -f1)"
PAGES="?"
if command -v python3 >/dev/null 2>&1 && python3 -c "import pypdf" 2>/dev/null; then
    PAGES="$(python3 -c "from pypdf import PdfReader; print(len(PdfReader('$OUTPUT').pages))")"
fi
echo "✓ $OUTPUT — ${PAGES} pages, $SIZE"
