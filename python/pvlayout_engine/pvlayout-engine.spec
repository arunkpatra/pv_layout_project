# -*- mode: python ; coding: utf-8 -*-
#
# PyInstaller spec for the pvlayout-engine sidecar.
#
# Produces a single-file, console-mode binary that runs the FastAPI sidecar
# with every runtime dependency (matplotlib, shapely, pyproj, ezdxf, ...)
# bundled in. The Tauri desktop shell spawns this binary as a child process
# and parses its stdout `READY {...}` line to discover the connection details.
#
# Build:
#     uv run pyinstaller pvlayout-engine.spec --noconfirm --clean
#
# Binary lands at:
#     dist/pvlayout-engine        (macOS, Linux)
#     dist/pvlayout-engine.exe    (Windows)
#
# Design notes
# ------------
# * console=True everywhere. Tauri spawns the sidecar via its Command API with
#   stdio pipes; console-subsystem on Windows guarantees stdout is connected.
#   Tauri will pass CREATE_NO_WINDOW so there is no user-visible console.
# * PyQt5 / PySide* excluded by force. The domain logic never imports them;
#   this shields us if an upstream lib ever pulls one transitively (ezdxf
#   has done this in the past).
# * collect_all() handles matplotlib / pyproj / shapely / ezdxf which have
#   non-Python data files (projection tables, fonts, DXF templates) and
#   dynamic imports. Cheaper than hunting hiddenimports by hand.
# * The `pvlayout_core` package is listed under hiddenimports so PyInstaller
#   follows its imports even though nothing references it by string name.

from PyInstaller.utils.hooks import collect_all, collect_submodules

block_cipher = None

# --- Third-party libs with data files / dynamic imports -----------------
mpl_d, mpl_b, mpl_h = collect_all("matplotlib")
pyproj_d, pyproj_b, pyproj_h = collect_all("pyproj")
shapely_d, shapely_b, shapely_h = collect_all("shapely")
ezdxf_d, ezdxf_b, ezdxf_h = collect_all("ezdxf")
kml_d, kml_b, kml_h = collect_all("simplekml")

# --- First-party packages ----------------------------------------------
# Our own packages need to be explicitly collected because Analysis walks
# imports from the entry script, and the core package tree has enough
# indirection (dynamic imports, lazy loads) that static analysis misses bits.
core_h = collect_submodules("pvlayout_core")
engine_h = collect_submodules("pvlayout_engine")

# --- uvicorn has dynamic protocol loading ------------------------------
# ASGI server auto-selects protocols at runtime; PyInstaller's static
# analysis won't find them without explicit hints.
uvicorn_h = [
    "uvicorn.logging",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.http.httptools_impl",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.protocols.websockets.websockets_impl",
    "uvicorn.protocols.websockets.wsproto_impl",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "uvicorn.loops.uvloop",
]

# --- Assembly -----------------------------------------------------------
datas = mpl_d + pyproj_d + shapely_d + ezdxf_d + kml_d
binaries = mpl_b + pyproj_b + shapely_b + ezdxf_b + kml_b
hiddenimports = (
    mpl_h
    + pyproj_h
    + shapely_h
    + ezdxf_h
    + kml_h
    + core_h
    + engine_h
    + uvicorn_h
    + [
        "python_multipart",  # dep name vs import name
        "email.mime.multipart",  # starlette / email edge
    ]
)

a = Analysis(
    ["pvlayout_engine/main.py"],
    pathex=["."],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "PyQt5",
        "PyQt6",
        "PySide2",
        "PySide6",
        "tkinter",
        "PIL.ImageTk",
        "IPython",
        "notebook",
        "jupyter",
    ],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="pvlayout-engine",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,   # matches build host — CI matrix drives cross-arch
    codesign_identity=None,
    entitlements_file=None,
)
