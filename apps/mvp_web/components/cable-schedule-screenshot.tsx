export function CableScheduleScreenshot() {
  return (
    <svg
      viewBox="0 0 600 220"
      preserveAspectRatio="xMidYMid meet"
      className="block h-auto w-full"
    >
      <rect width="600" height="220" fill="#FAFBFC" />
      <g fontFamily="Geist Mono, monospace" fontSize="11" fill="#1C1C1C">
        <rect width="600" height="32" fill="#fff" stroke="#E5E7EB" />
        <text x="20" y="20" fill="#6B7280">
          CABLE
        </text>
        <text x="200" y="20" fill="#6B7280">
          SIZE
        </text>
        <text x="320" y="20" fill="#6B7280">
          RUN (m)
        </text>
        <text x="440" y="20" fill="#6B7280">
          QTY
        </text>
        <text x="540" y="20" fill="#6B7280">
          IS-CODE
        </text>
        <g>
          <rect y="32" width="600" height="28" fill="#fff" />
          <text x="20" y="50">
            DC string
          </text>
          <text x="200" y="50">
            4 mm²
          </text>
          <text x="320" y="50">
            12,840
          </text>
          <text x="440" y="50">
            1,184
          </text>
          <text x="540" y="50">
            IS 14255
          </text>
          <rect y="60" width="600" height="28" fill="#FBFCFD" />
          <text x="20" y="78">
            DC combiner
          </text>
          <text x="200" y="78">
            95 mm²
          </text>
          <text x="320" y="78">
            3,210
          </text>
          <text x="440" y="78">
            48
          </text>
          <text x="540" y="78">
            IS 1554
          </text>
          <rect y="88" width="600" height="28" fill="#fff" />
          <text x="20" y="106">
            AC LV
          </text>
          <text x="200" y="106">
            240 mm²
          </text>
          <text x="320" y="106">
            1,420
          </text>
          <text x="440" y="106">
            12
          </text>
          <text x="540" y="106">
            IS 7098
          </text>
          <rect y="116" width="600" height="28" fill="#FBFCFD" />
          <text x="20" y="134">
            AC HV (33kV)
          </text>
          <text x="200" y="134">
            300 mm²
          </text>
          <text x="320" y="134">
            1,860
          </text>
          <text x="440" y="134">
            3
          </text>
          <text x="540" y="134">
            IS 7098
          </text>
          <rect y="144" width="600" height="28" fill="#fff" />
          <text x="20" y="162">
            Earth
          </text>
          <text x="200" y="162">
            25 mm²
          </text>
          <text x="320" y="162">
            5,640
          </text>
          <text x="440" y="162">
            —
          </text>
          <text x="540" y="162">
            IS 3043
          </text>
          <rect y="172" width="600" height="28" fill="#FBFCFD" />
          <text x="20" y="190">
            Total
          </text>
          <text x="320" y="190" fill="#1A5C3A">
            24,970 m
          </text>
        </g>
      </g>
    </svg>
  )
}
