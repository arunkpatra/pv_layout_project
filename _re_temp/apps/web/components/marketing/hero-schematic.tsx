"use client"

import { useEffect, useRef } from "react"

export function HeroSchematic() {
  const scanRef = useRef<SVGLineElement>(null)

  useEffect(() => {
    const line = scanRef.current
    if (!line) return
    let y = 40
    let dir = 1
    let frame: number

    function tick() {
      y += 0.4 * dir
      if (y >= 340) dir = -1
      if (y <= 40) dir = 1
      line!.setAttribute("y1", String(y))
      line!.setAttribute("y2", String(y))
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <svg
      viewBox="0 0 480 380"
      className="w-full max-w-lg text-foreground"
      aria-hidden="true"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Site boundary */}
      <polygon
        points="40,40 440,50 420,340 60,330"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="6 3"
        opacity="0.35"
      />

      {/* Label: site boundary */}
      <text x="44" y="34" fontSize="8" fill="currentColor" opacity="0.4" fontFamily="monospace">
        SITE BOUNDARY
      </text>

      {/* Solar panel rows — 9 rows */}
      {[0,1,2,3,4,5,6,7,8].map((i) => {
        const y = 68 + i * 26
        const xStart = 70 + i * 4
        const xEnd = 400 - i * 4
        return (
          <g key={i}>
            {/* Row of panels */}
            {Array.from({ length: 11 }).map((_, j) => {
              const px = xStart + j * ((xEnd - xStart) / 11)
              return (
                <rect
                  key={j}
                  x={px}
                  y={y - 7}
                  width={((xEnd - xStart) / 11) - 3}
                  height={10}
                  rx={0}
                  stroke="currentColor"
                  strokeWidth="0.75"
                  fill="currentColor"
                  fillOpacity="0.06"
                  opacity="0.6"
                />
              )
            })}
          </g>
        )
      })}

      {/* IVT blocks — 3 units at bottom */}
      {[120, 230, 340].map((x) => (
        <g key={x}>
          <rect
            x={x - 14}
            y={306}
            width={28}
            height={16}
            stroke="currentColor"
            strokeWidth="1"
            fill="currentColor"
            fillOpacity="0.08"
            opacity="0.7"
          />
          <text x={x} y={317} fontSize="6" fill="currentColor" opacity="0.45" textAnchor="middle" fontFamily="monospace">
            IVT
          </text>
          {/* DC cable up from panels to IVT */}
          <line
            x1={x}
            y1={305}
            x2={x}
            y2={280}
            stroke="currentColor"
            strokeWidth="0.75"
            strokeDasharray="3 2"
            opacity="0.3"
          />
        </g>
      ))}

      {/* AC bus line */}
      <line
        x1={106}
        y1={322}
        x2={354}
        y2={322}
        stroke="currentColor"
        strokeWidth="1.25"
        opacity="0.45"
      />

      {/* Main transformer */}
      <rect
        x={218}
        y={338}
        width={44}
        height={20}
        stroke="currentColor"
        strokeWidth="1"
        fill="currentColor"
        fillOpacity="0.1"
        opacity="0.75"
      />
      <text x={240} y={351} fontSize="6" fill="currentColor" opacity="0.5" textAnchor="middle" fontFamily="monospace">
        TRAFO
      </text>
      <line x1={240} y1={322} x2={240} y2={338} stroke="currentColor" strokeWidth="1.25" opacity="0.45" />

      {/* Evacuation line to grid */}
      <line
        x1={240}
        y1={358}
        x2={240}
        y2={375}
        stroke="currentColor"
        strokeWidth="1.25"
        strokeDasharray="4 3"
        opacity="0.35"
      />
      <text x={244} y={373} fontSize="7" fill="currentColor" opacity="0.35" fontFamily="monospace">
        DISCOM GRID
      </text>

      {/* North indicator */}
      <g opacity="0.3">
        <line x1={450} y1={30} x2={450} y2={18} stroke="currentColor" strokeWidth="1" />
        <polygon points="450,14 447,22 453,22" fill="currentColor" />
        <text x={450} y={36} fontSize="7" fill="currentColor" textAnchor="middle" fontFamily="monospace">N</text>
      </g>

      {/* Scale bar */}
      <g opacity="0.3">
        <line x1={44} y1={370} x2={104} y2={370} stroke="currentColor" strokeWidth="1" />
        <line x1={44} y1={366} x2={44} y2={374} stroke="currentColor" strokeWidth="1" />
        <line x1={104} y1={366} x2={104} y2={374} stroke="currentColor" strokeWidth="1" />
        <text x={74} y={368} fontSize="7" fill="currentColor" textAnchor="middle" fontFamily="monospace">500 m</text>
      </g>

      {/* Animated scan line */}
      <line
        ref={scanRef}
        x1={42}
        y1={40}
        x2={438}
        y2={40}
        stroke="currentColor"
        strokeWidth="0.75"
        opacity="0.18"
        strokeDasharray="2 4"
      />
    </svg>
  )
}
