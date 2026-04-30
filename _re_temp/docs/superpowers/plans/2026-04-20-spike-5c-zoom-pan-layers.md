# Spike 5c — Zoom/Pan + Layer Toggles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `SvgPreview` with mouse/touch zoom-pan, a Reset Zoom button, a Rotate button with dynamic icon rotation, and three layer visibility toggles (AC Cables, DC Cables, Lightning Arresters).

**Architecture:** Single file change — `apps/web/components/svg-preview.tsx`. One new npm dependency (`react-zoom-pan-pinch`). `TransformWrapper`/`TransformComponent` wrap the SVG content when loaded. Layer toggles use a `useRef` + `useEffect` to directly mutate `element.style.display` on SVG group nodes by id.

**Tech Stack:** React 19, react-zoom-pan-pinch v4, lucide-react (RotateCwSquare, Maximize2), shadcn Switch (`@renewable-energy/ui/components/switch`), Vitest

---

## File Map

| File | Change |
|---|---|
| `apps/web/components/svg-preview.tsx` | Modify — add zoom/pan, toolbar, layer toggles |
| `apps/web/components/svg-preview.test.tsx` | Modify — add mock for react-zoom-pan-pinch, 7 new tests |
| `apps/web/package.json` | Modify — add react-zoom-pan-pinch dependency |

---

## Background: How the existing component works

**Read this before touching any code.** `SvgPreview` at `apps/web/components/svg-preview.tsx`:

- Fetches SVG from a pre-signed S3 URL via `fetch(svgUrl)`
- Sanitizes with DOMPurify, parses `viewBox` to extract `dims = { w, h }`
- `status` is `"loading" | "loaded" | "error"`
- `wrapperStyle` positions the SVG div. At 90°/270° (transposed) it swaps width/height to fill the rotated container
- Outer container uses CSS `aspect-ratio` that changes with rotation: `dims.w/dims.h` normally, `dims.h/dims.w` when transposed
- Current rotate button renders only when `status === "loaded"`, uses `aria-label="Rotate preview"`, icon `RotateCw`

**SVG layer ids** from the layout engine (in `apps/layout-engine/src/svg_exporter.py`):
`boundary`, `obstacles`, `tables`, `icrs`, `inverters`, `dc-cables`, `ac-cables`, `la-footprints`, `la-circles`, `annotations`

The layer toggles we need: `ac-cables` (id=`ac-cables`), `dc-cables` (id=`dc-cables`), Lightning Arresters (controls both `la-footprints` and `la-circles`).

---

## Task 1: Install package, add mock to test file, write failing toolbar tests

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/components/svg-preview.test.tsx`

- [ ] **Step 1: Install react-zoom-pan-pinch**

Run from repo root:
```bash
cd apps/web && bun add react-zoom-pan-pinch && cd ../..
```

Expected: `react-zoom-pan-pinch` appears in `apps/web/package.json` dependencies.

- [ ] **Step 2: Verify package installed correctly**

```bash
bunx turbo typecheck --filter=@renewable-energy/web 2>&1 | tail -5
```

Expected: typecheck passes (no new errors from the install).

- [ ] **Step 3: Add react import and vi.hoisted + vi.mock to svg-preview.test.tsx**

At the top of `apps/web/components/svg-preview.test.tsx`, after the existing imports and before the `vi.mock("dompurify", ...)` block, add:

```ts
import React from "react"

const mockResetTransform = vi.hoisted(() => vi.fn())

vi.mock("react-zoom-pan-pinch", () => ({
  TransformWrapper: ({
    children,
    ref,
  }: {
    children: React.ReactNode
    ref?: React.MutableRefObject<{ resetTransform: () => void } | null>
  }) => {
    React.useEffect(() => {
      if (ref) ref.current = { resetTransform: mockResetTransform }
    })
    return <>{children}</>
  },
  TransformComponent: ({
    children,
  }: {
    children: React.ReactNode
  }) => <>{children}</>,
}))
```

Also update the `afterEach` block to clear `mockResetTransform`:
```ts
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  mockResetTransform.mockClear()
})
```

- [ ] **Step 4: Write failing test — toolbar buttons disabled while loading, enabled when loaded**

Append to `apps/web/components/svg-preview.test.tsx`:

```ts
test("toolbar buttons disabled while loading, enabled when loaded", async () => {
  // Loading state: buttons present but disabled
  let resolve!: (value: Response) => void
  const pending = new Promise<Response>((r) => { resolve = r })
  vi.stubGlobal("fetch", vi.fn(() => pending))

  const { unmount } = render(
    <SvgPreview svgUrl="https://s3.example.com/layout.svg" />,
    { wrapper: createWrapper() },
  )
  expect(screen.getByRole("button", { name: /rotate/i })).toBeDisabled()
  expect(screen.getByRole("button", { name: /reset zoom/i })).toBeDisabled()
  unmount()

  // Loaded state: buttons enabled
  mockSanitize.mockReturnValue(SVG_TEXT)
  vi.stubGlobal("fetch", makeFetch(SVG_TEXT))
  render(<SvgPreview svgUrl="https://s3.example.com/layout.svg" />, {
    wrapper: createWrapper(),
  })
  await waitFor(() => screen.getByTestId("svg-wrapper"))
  expect(screen.getByRole("button", { name: /rotate/i })).not.toBeDisabled()
  expect(screen.getByRole("button", { name: /reset zoom/i })).not.toBeDisabled()
})
```

- [ ] **Step 5: Write failing test — rotate icon CSS-rotates to match rotation state**

```ts
test("rotate button icon style reflects rotation state", async () => {
  mockSanitize.mockReturnValue(SVG_TEXT)
  vi.stubGlobal("fetch", makeFetch(SVG_TEXT))

  render(<SvgPreview svgUrl="https://s3.example.com/layout.svg" />, {
    wrapper: createWrapper(),
  })
  await waitFor(() => screen.getByTestId("svg-wrapper"))

  const rotateBtn = screen.getByRole("button", { name: /rotate/i })
  const icon = rotateBtn.querySelector("svg")!

  expect(icon).toHaveStyle("transform: rotate(0deg)")
  fireEvent.click(rotateBtn)
  expect(icon).toHaveStyle("transform: rotate(90deg)")
  fireEvent.click(rotateBtn)
  expect(icon).toHaveStyle("transform: rotate(180deg)")
})
```

- [ ] **Step 6: Write failing test — reset zoom button calls resetTransform**

```ts
test("reset zoom button calls resetTransform when clicked", async () => {
  mockSanitize.mockReturnValue(SVG_TEXT)
  vi.stubGlobal("fetch", makeFetch(SVG_TEXT))

  render(<SvgPreview svgUrl="https://s3.example.com/layout.svg" />, {
    wrapper: createWrapper(),
  })
  await waitFor(() => screen.getByTestId("svg-wrapper"))

  fireEvent.click(screen.getByRole("button", { name: /reset zoom/i }))
  expect(mockResetTransform).toHaveBeenCalledTimes(1)
})
```

- [ ] **Step 7: Run tests to confirm they fail**

```bash
bunx turbo test --filter=@renewable-energy/web 2>&1 | grep -E "FAIL|PASS|✓|×|Tests"
```

Expected: new tests fail (toolbar buttons / icon style / resetTransform not found), existing 8 tests still pass.

---

## Task 2: Implement zoom/pan + toolbar — make Task 1 tests pass

**Files:**
- Modify: `apps/web/components/svg-preview.tsx`

- [ ] **Step 1: Update imports in svg-preview.tsx**

Replace the import block at the top of `apps/web/components/svg-preview.tsx`:

```ts
"use client"

import * as React from "react"
import DOMPurify from "dompurify"
import { Loader2, ImageOff, RotateCwSquare, Maximize2 } from "lucide-react"
import { Button } from "@renewable-energy/ui/components/button"
import { Switch } from "@renewable-energy/ui/components/switch"
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch"
```

(The `Switch` import is added now for Task 3 — it doesn't affect current behavior.)

- [ ] **Step 2: Add transformRef and move rotate button outside the loaded conditional**

Replace the full component body of `SvgPreview` with this. Read the current file first, then replace completely with:

```tsx
type Rotation = 0 | 90 | 180 | 270
type LayerId = "ac-cables" | "dc-cables" | "la"

function parseViewBox(svg: string): { w: number; h: number } | null {
  const match = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)
  if (!match || !match[1] || !match[2]) return null
  return { w: parseFloat(match[1]), h: parseFloat(match[2]) }
}

function prepareSvg(sanitized: string): string {
  return sanitized.replace(/<svg([^>]*)>/, (_: string, attrs: string) => {
    const stripped = attrs
      .replace(/\s+width="[^"]*"/, "")
      .replace(/\s+height="[^"]*"/, "")
    return `<svg${stripped} width="100%" height="100%">`
  })
}

interface SvgPreviewProps {
  svgUrl: string
}

const LAYER_CONFIG: { id: LayerId; label: string }[] = [
  { id: "ac-cables", label: "AC Cables" },
  { id: "dc-cables", label: "DC Cables" },
  { id: "la", label: "Lightning Arresters" },
]

const LAYER_DOM_IDS: Record<LayerId, string[]> = {
  "ac-cables": ["ac-cables"],
  "dc-cables": ["dc-cables"],
  la: ["la-footprints", "la-circles"],
}

export function SvgPreview({ svgUrl }: SvgPreviewProps) {
  const [status, setStatus] = React.useState<"loading" | "loaded" | "error">(
    "loading",
  )
  const [svgContent, setSvgContent] = React.useState("")
  const [dims, setDims] = React.useState<{ w: number; h: number } | null>(null)
  const [rotation, setRotation] = React.useState<Rotation>(0)
  const [retryCount, setRetryCount] = React.useState(0)
  const [visibleLayers, setVisibleLayers] = React.useState<Set<LayerId>>(
    new Set(),
  )

  const transformRef = React.useRef<ReactZoomPanPinchRef>(null)
  const svgWrapperRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    let cancelled = false

    fetch(svgUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.text()
      })
      .then((raw) => {
        if (cancelled) return
        const sanitized = DOMPurify.sanitize(raw, {
          USE_PROFILES: { svg: true, svgFilters: true },
        })
        if (!sanitized) {
          setStatus("error")
          return
        }
        const viewBox = parseViewBox(sanitized)
        const prepared = prepareSvg(sanitized)
        setSvgContent(prepared)
        setDims(viewBox)
        setStatus("loaded")
      })
      .catch(() => {
        if (!cancelled) setStatus("error")
      })

    return () => {
      cancelled = true
    }
  }, [svgUrl, retryCount])

  React.useEffect(() => {
    if (status !== "loaded" || !svgWrapperRef.current) return
    const el = svgWrapperRef.current
    for (const layerId of Object.keys(LAYER_DOM_IDS) as LayerId[]) {
      const on = visibleLayers.has(layerId)
      for (const domId of LAYER_DOM_IDS[layerId]) {
        const node = el.querySelector<SVGGElement>(`#${domId}`)
        if (node) node.style.display = on ? "" : "none"
      }
    }
  }, [visibleLayers, status])

  const isTransposed = rotation === 90 || rotation === 270
  const containerAspect =
    status === "loaded" && dims
      ? isTransposed
        ? dims.h / dims.w
        : dims.w / dims.h
      : 4 / 3

  const rotate = () => setRotation((r) => (((r + 90) % 360) as Rotation))

  const wrapperStyle: React.CSSProperties =
    isTransposed && dims
      ? {
          position: "absolute",
          width: `${(dims.w / dims.h) * 100}%`,
          height: `${(dims.h / dims.w) * 100}%`,
          top: "50%",
          left: "50%",
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
          transition: "transform 300ms ease",
        }
      : {
          position: "absolute",
          inset: 0,
          transform: `rotate(${rotation}deg)`,
          transition: "transform 300ms ease",
        }

  const toggleLayer = (id: LayerId, checked: boolean) => {
    setVisibleLayers((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative w-full overflow-hidden rounded-lg border bg-muted"
        style={{ aspectRatio: String(containerAspect) }}
      >
        {status === "loading" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading preview…</p>
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <ImageOff className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Preview unavailable</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStatus("loading")
                setSvgContent("")
                setDims(null)
                setRetryCount((c) => c + 1)
              }}
            >
              Retry
            </Button>
          </div>
        )}
        {status === "loaded" && (
          <TransformWrapper ref={transformRef}>
            <TransformComponent
              wrapperStyle={{ position: "absolute", inset: 0 }}
              contentStyle={{
                position: "relative",
                width: "100%",
                height: "100%",
              }}
            >
              <div
                ref={svgWrapperRef}
                data-testid="svg-wrapper"
                style={wrapperStyle}
                dangerouslySetInnerHTML={{ __html: svgContent }}
              />
            </TransformComponent>
          </TransformWrapper>
        )}
        <div className="absolute right-2 top-2 z-10 flex gap-1">
          <button
            onClick={rotate}
            disabled={status !== "loaded"}
            className="rounded-md border bg-background/80 p-1.5 text-muted-foreground shadow-sm hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Rotate preview"
          >
            <RotateCwSquare
              className="h-4 w-4"
              style={{ transform: `rotate(${rotation}deg)` }}
            />
          </button>
          <button
            onClick={() => transformRef.current?.resetTransform()}
            disabled={status !== "loaded"}
            className="rounded-md border bg-background/80 p-1.5 text-muted-foreground shadow-sm hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Reset zoom"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        {LAYER_CONFIG.map(({ id, label }) => (
          <label
            key={id}
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Switch
              size="sm"
              checked={visibleLayers.has(id)}
              onCheckedChange={(checked) => toggleLayer(id, checked)}
              disabled={status !== "loaded"}
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run tests**

```bash
bunx turbo test --filter=@renewable-energy/web 2>&1 | grep -E "FAIL|PASS|✓|×|Tests"
```

Expected: all 11 tests (8 existing + 3 new) pass.

- [ ] **Step 4: Run typecheck**

```bash
bunx turbo typecheck --filter=@renewable-energy/web 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/components/svg-preview.tsx apps/web/components/svg-preview.test.tsx bun.lockb
git commit -m "feat: add zoom/pan and toolbar to SvgPreview (Spike 5c)"
```

---

## Task 3: Write failing tests for layer toggles

**Files:**
- Modify: `apps/web/components/svg-preview.test.tsx`

The layer toggle effect manipulates DOM nodes inside the `svg-wrapper` div. In jsdom (the test environment), `dangerouslySetInnerHTML` sets the innerHTML which includes the SVG groups with ids. The `querySelector` calls work in jsdom.

For these tests, the SVG fixture needs to contain group elements with the layer ids. Create an extended fixture.

- [ ] **Step 1: Add SVG fixture with layer groups**

After the existing `WIDE_SVG_TEXT` constant, add:

```ts
const LAYERED_SVG_TEXT = `<svg viewBox="0 0 800 600" width="800" height="600">
  <g id="ac-cables"><line x1="0" y1="0" x2="100" y2="100"/></g>
  <g id="dc-cables"><line x1="0" y1="0" x2="200" y2="200"/></g>
  <g id="la-footprints"><rect x="10" y="10" width="20" height="20"/></g>
  <g id="la-circles"><circle cx="50" cy="50" r="10"/></g>
</svg>`
```

- [ ] **Step 2: Write failing test — switches render when loaded, disabled when loading**

Append to the test file:

```ts
test("layer switches render always, disabled while loading, enabled when loaded", async () => {
  // Loading state — switches present but disabled
  let resolve!: (value: Response) => void
  const pending = new Promise<Response>((r) => { resolve = r })
  vi.stubGlobal("fetch", vi.fn(() => pending))

  const { unmount } = render(
    <SvgPreview svgUrl="https://s3.example.com/layout.svg" />,
    { wrapper: createWrapper() },
  )
  expect(screen.getByText("AC Cables")).toBeInTheDocument()
  const switchesWhileLoading = screen.getAllByRole("switch")
  switchesWhileLoading.forEach((sw) => expect(sw).toBeDisabled())
  unmount()

  // Loaded state — switches enabled
  mockSanitize.mockReturnValue(LAYERED_SVG_TEXT)
  vi.stubGlobal("fetch", makeFetch(LAYERED_SVG_TEXT))
  render(<SvgPreview svgUrl="https://s3.example.com/layout.svg" />, {
    wrapper: createWrapper(),
  })
  await waitFor(() => screen.getByTestId("svg-wrapper"))
  const switchesWhenLoaded = screen.getAllByRole("switch")
  switchesWhenLoaded.forEach((sw) => expect(sw).not.toBeDisabled())
})
```

- [ ] **Step 3: Write failing test — AC Cables toggle controls display**

```ts
test("AC Cables toggle controls #ac-cables display", async () => {
  mockSanitize.mockReturnValue(LAYERED_SVG_TEXT)
  vi.stubGlobal("fetch", makeFetch(LAYERED_SVG_TEXT))

  render(<SvgPreview svgUrl="https://s3.example.com/layout.svg" />, {
    wrapper: createWrapper(),
  })
  await waitFor(() => screen.getByTestId("svg-wrapper"))

  const wrapper = screen.getByTestId("svg-wrapper")
  const acGroup = wrapper.querySelector("#ac-cables") as SVGGElement

  // Default: OFF → display is "none"
  expect(acGroup.style.display).toBe("none")

  // Toggle ON
  const acSwitch = screen
    .getAllByRole("switch")
    .find((el) => el.closest("label")?.textContent?.includes("AC Cables"))!
  fireEvent.click(acSwitch)
  expect(acGroup.style.display).toBe("")

  // Toggle OFF
  fireEvent.click(acSwitch)
  expect(acGroup.style.display).toBe("none")
})
```

- [ ] **Step 4: Write failing test — LA toggle controls both la-footprints and la-circles**

```ts
test("Lightning Arresters toggle controls both #la-footprints and #la-circles", async () => {
  mockSanitize.mockReturnValue(LAYERED_SVG_TEXT)
  vi.stubGlobal("fetch", makeFetch(LAYERED_SVG_TEXT))

  render(<SvgPreview svgUrl="https://s3.example.com/layout.svg" />, {
    wrapper: createWrapper(),
  })
  await waitFor(() => screen.getByTestId("svg-wrapper"))

  const wrapper = screen.getByTestId("svg-wrapper")
  const footprints = wrapper.querySelector("#la-footprints") as SVGGElement
  const circles = wrapper.querySelector("#la-circles") as SVGGElement

  expect(footprints.style.display).toBe("none")
  expect(circles.style.display).toBe("none")

  const laSwitch = screen
    .getAllByRole("switch")
    .find((el) => el.closest("label")?.textContent?.includes("Lightning"))!
  fireEvent.click(laSwitch)

  expect(footprints.style.display).toBe("")
  expect(circles.style.display).toBe("")
})
```

- [ ] **Step 5: Run tests to confirm they fail**

```bash
bunx turbo test --filter=@renewable-energy/web 2>&1 | grep -E "FAIL|PASS|✓|×|Tests"
```

Expected: 3 new tests fail (layer labels not found / display not set). All 11 prior tests still pass.

---

## Task 4: Verify layer implementation passes tests + run full gates + commit

The layer state, effect, and Switch components were already written in Task 2's component code. Task 3's tests may fail only due to the layer toggle initial display logic — verify and fix if needed.

**Files:**
- Modify: `apps/web/components/svg-preview.tsx` (only if tests reveal a bug)

- [ ] **Step 1: Run the layer tests**

```bash
bunx turbo test --filter=@renewable-energy/web 2>&1 | grep -E "FAIL|PASS|✓|×|Tests"
```

Expected: all 14 tests pass. The layer effect runs after status becomes "loaded" and sets display to "none" for all layer groups (since `visibleLayers` starts as empty Set).

**If the AC Cables test fails because `acGroup.style.display` is `""` instead of `"none"`:** The `useEffect` ran but the DOM nodes from `dangerouslySetInnerHTML` may not be immediately queryable on first render. If this happens, add a `waitFor` around the display assertion:

```ts
await waitFor(() => {
  expect(acGroup.style.display).toBe("none")
})
```

Apply the same fix to the LA test. Do NOT change the component logic — this is a test timing issue.

- [ ] **Step 2: Run full pre-commit gates from repo root**

```bash
bun run lint && bun run typecheck && bun run test && bun run build
```

Expected: all pass. Fix any lint or typecheck errors before continuing. Common issues:
- `React` import unused: if the test file's `React` import causes a lint error, add `// eslint-disable-next-line @typescript-eslint/no-unused-vars` or check if the JSX transform handles it automatically (it should in this project).
- `contentStyle` prop type issue on `TransformComponent`: check `react-zoom-pan-pinch` types — if `contentStyle` is not typed, cast: `contentStyle={{ position: "relative" as const, width: "100%", height: "100%" }}`

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/svg-preview.tsx apps/web/components/svg-preview.test.tsx
git commit -m "feat: add layer visibility toggles to SvgPreview (Spike 5c)"
```

