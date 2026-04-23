# SolarLayout Desktop

Native desktop application (Windows, macOS, Linux) for automated solar PV plant layout design. Takes a KMZ boundary plus module/plant parameters and produces panel table layouts, inverter placement, cable routing, lightning arrester placement, and KMZ / DXF / PDF exports with 25-year energy yield.

## Status

Pre-alpha. Under active development. See [`docs/SPIKE_PLAN.md`](./docs/SPIKE_PLAN.md) for the 17-spike project plan.

## For contributors

**Read [`CLAUDE.md`](./CLAUDE.md) first.** It is the canonical map of the project: architecture links, tech stack, working agreements, spike protocol, and commands.

## Quick start

```bash
# Install JS/TS dependencies
bun install

# Verify gates
bun run lint && bun run typecheck && bun run build

# Python sidecar
cd python/pvlayout_engine
uv sync
```

## Architecture

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full platform architecture.

In brief: Tauri 2 (Rust shell) → React 19 frontend → localhost HTTP → PyInstaller-bundled Python sidecar running the layout engine. Entitlements via `api.solarlayout.in`. One build per OS/arch; features gate at runtime.
