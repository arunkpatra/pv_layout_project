# Spec PDF build pipeline

Self-contained tooling to regenerate the print-quality PDF for any markdown spec under `docs/superpowers/specs/`. **Run the script, get the PDF.** No Claude needed.

## Quick start

```bash
cd /Users/arunkpatra/codebase/pv_layout_project
./docs/superpowers/specs/_build/build-spec-pdf.sh \
    docs/superpowers/specs/2026-05-03-cloud-offload-architecture.md
```

Produces `2026-05-03-cloud-offload-architecture.pdf` next to the input. Default running header is the spec's first H1 line; override with `--header "Custom header text"`.

## Files

| File | Purpose |
|---|---|
| `build-spec-pdf.sh` | The script. Takes a markdown path, writes a sibling PDF. |
| `spec-pdf.css` | Print stylesheet — page geometry, typography, code blocks, tables, callouts. Edit to change rendering across all spec PDFs. |
| `README.md` | This file. |

## Pipeline

```
spec.md  ──pandoc──→  spec.html (standalone, embedded resources, with TOC + CSS)
                          │
                          ▼
                       weasyprint
                          │
                          ▼
                       spec.pdf
```

Pandoc converts GFM markdown to HTML5 with a TOC, embeds the CSS + any other resources inline (`--embed-resources`), and emits a standalone HTML file. WeasyPrint reads that HTML, applies the print CSS, and produces the PDF — including page numbers (top-right), a running header (top-left), section breaks at `## Heading 2` boundaries, and proper page-break-avoidance for tables and code blocks.

## Dependencies (macOS)

```bash
# Pandoc — markdown → HTML
brew install pandoc

# WeasyPrint's C library deps (Pango, GLib, Cairo, GObject)
brew install pango glib cairo gobject-introspection

# WeasyPrint itself
pip3 install --user weasyprint

# Optional: pypdf for page-count reporting at end of build
pip3 install --user pypdf
```

The script handles macOS's library-loading quirk automatically — it sets `DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib` so weasyprint can find `libgobject` etc.

## Customizing the PDF

All visual choices live in `spec-pdf.css`. Common tweaks:

| Want to change | Edit |
|---|---|
| Page size (Letter vs A4) | `@page { size: ... }` |
| Margins | `@page { margin: ... }` |
| Body font / line height | `body { font-family: ...; line-height: ... }` |
| Code-block colors | `pre { background: ...; border: ... }` |
| Table colors | `th { background: ... }`, `tbody tr:nth-child(even) td { background: ... }` |
| Callout (blockquote) accent | `blockquote { border-left: 3px solid ... }` |
| Page-break behavior | `h2 { page-break-before: ... }` |
| Running header text | Pass `--header "..."` to the script |

After editing, re-run the script. WeasyPrint reads the CSS fresh each invocation; no cache.

## Sentinels

The CSS contains one sentinel string the script substitutes at build time:

| Sentinel | Substituted with |
|---|---|
| `__HEADER_TEXT__` | The `--header` arg, or first H1 of the markdown if `--header` omitted. |

Don't edit the sentinel string itself — the script's `sed` command depends on it. Add new sentinels if you need more parameterization (e.g., `__FOOTER_TEXT__`); update the script's substitution block accordingly.

## Conventions

- **One PDF per spec.** Every committed `*.md` spec under `docs/superpowers/specs/` should have a sibling `*.pdf` regenerated whenever the markdown changes.
- **PDF is a build artifact, but committed** — it ships in the repo so non-developer reviewers can read offline without running the build pipeline.
- **Regenerate before committing spec changes.** The PDF and the markdown should always match. CI does NOT regenerate it (no GitHub Actions wiring); the human author runs the script before committing.
- **Quality bar:** Inter / JetBrains-Mono fonts, A4 geometry, page numbers, hierarchical headings, dark-header tables, page-breaks before each `##` section, code blocks don't split across pages.

## Troubleshooting

**`weasyprint` exits with `OSError: cannot load library 'libgobject-2.0-0'`**
The script should set `DYLD_FALLBACK_LIBRARY_PATH` automatically on macOS. If you're running weasyprint outside the script: `export DYLD_FALLBACK_LIBRARY_PATH=/opt/homebrew/lib` first. Or `brew install pango glib cairo gobject-introspection` if those libraries are missing entirely.

**`pandoc: command not found`**
`brew install pandoc`.

**`WARNING: ...` lines from weasyprint at build time**
The script filters these out by default (`grep -v '^WARNING'`). They originate from pandoc's default embedded HTML5 styles using CSS properties weasyprint doesn't support (e.g., `gap`, `overflow-x`, `user-select`). They don't affect the rendered PDF.

**PDF looks broken — overflowing tables, no page breaks, ugly typography**
You probably ran `pandoc --pdf-engine=weasyprint` directly instead of through this script. That bypasses our CSS and uses pandoc's web-targeted defaults. Always go through `build-spec-pdf.sh`.

**PDF page count differs from before**
That's fine — adding sections or rewriting content changes pagination. The script reports the page count + file size at the end of every build for sanity-check.

## Reproducing a specific PDF version

The script is deterministic given the same `spec-pdf.css`, the same input markdown, the same pandoc + weasyprint versions, and the same `--header` value. Pin all of these if you need byte-stable output across machines (rarely needed; PDF reviewers don't compare byte-for-byte).

## When to extend this tooling

- Adding a new spec under `docs/superpowers/specs/` — just point the script at it; no changes here required.
- Adding a footer with the build date or a "DRAFT" watermark — extend `spec-pdf.css` with another `@page { @bottom-center { ... } }` block + add a sentinel + extend the script's `sed` substitution.
- Per-spec CSS overrides — pass `--css` flag to pandoc with a second stylesheet that overrides selected properties; needs script extension.
- Different output formats (DOCX, EPUB) — different pipeline; not in scope here.
