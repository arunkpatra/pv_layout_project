"use client"

import * as React from "react"
import DOMPurify from "dompurify"
import { Loader2, ImageOff, RotateCwSquare, Maximize2 } from "lucide-react"
import { Button } from "@renewable-energy/ui/components/button"
import { Switch } from "@renewable-energy/ui/components/switch"
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchContentRef,
} from "react-zoom-pan-pinch"

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

  const transformRef = React.useRef<ReactZoomPanPinchContentRef>(null)
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
  }, [visibleLayers, status, svgContent])

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
          width: `${(dims.h / dims.w) * 100}%`,
          height: `${(dims.w / dims.h) * 100}%`,
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
              wrapperStyle={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
              }}
              contentStyle={{
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
