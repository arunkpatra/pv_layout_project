"use client"

import * as React from "react"
import DOMPurify from "dompurify"
import { Loader2, ImageOff, RotateCw } from "lucide-react"
import { Button } from "@renewable-energy/ui/components/button"

type Rotation = 0 | 90 | 180 | 270

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

export function SvgPreview({ svgUrl }: SvgPreviewProps) {
  const [status, setStatus] = React.useState<"loading" | "loaded" | "error">(
    "loading",
  )
  const [svgContent, setSvgContent] = React.useState("")
  const [dims, setDims] = React.useState<{ w: number; h: number } | null>(null)
  const [rotation, setRotation] = React.useState<Rotation>(0)
  const [retryCount, setRetryCount] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    setStatus("loading")
    setSvgContent("")
    setDims(null)

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

  return (
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
            onClick={() => setRetryCount((c) => c + 1)}
          >
            Retry
          </Button>
        </div>
      )}
      {status === "loaded" && (
        <>
          <div
            data-testid="svg-wrapper"
            style={wrapperStyle}
            dangerouslySetInnerHTML={{ __html: svgContent }}
          />
          <button
            onClick={rotate}
            className="absolute right-2 top-2 z-10 rounded-md border bg-background/80 p-1.5 text-muted-foreground shadow-sm hover:bg-background hover:text-foreground"
            aria-label="Rotate preview"
          >
            <RotateCw className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  )
}
