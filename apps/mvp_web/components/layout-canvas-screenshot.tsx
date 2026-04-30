export function LayoutCanvasScreenshot() {
  return (
    <svg
      viewBox="0 0 800 460"
      preserveAspectRatio="xMidYMid meet"
      className="block h-auto w-full"
    >
      <rect width="800" height="460" fill="#FAFBFC" />
      <pattern
        id="g2"
        width="32"
        height="32"
        patternUnits="userSpaceOnUse"
      >
        <path
          d="M32 0H0V32"
          fill="none"
          stroke="#EAEDF1"
          strokeWidth="1"
        />
      </pattern>
      <rect width="800" height="460" fill="url(#g2)" />
      {/* left tool rail */}
      <rect
        x="0"
        y="0"
        width="46"
        height="460"
        fill="#fff"
        stroke="#E5E7EB"
      />
      <g
        fill="none"
        stroke="#6B7280"
        strokeWidth="1.6"
        strokeLinecap="round"
      >
        <rect x="14" y="14" width="18" height="18" rx="3" />
        <rect x="14" y="44" width="18" height="18" rx="3" />
        <path d="M16 78l8-4 8 4M16 80v8h16v-8" />
        <circle cx="23" cy="118" r="6" />
        <path d="M23 124v6" />
        <path d="M14 156h18M14 162h12" />
      </g>
      {/* right inspector */}
      <rect
        x="600"
        y="0"
        width="200"
        height="460"
        fill="#fff"
        stroke="#E5E7EB"
      />
      <text
        x="616"
        y="26"
        fontFamily="Geist Mono, monospace"
        fontSize="10"
        fill="#6B7280"
        letterSpacing="0.5"
      >
        PROPERTIES
      </text>
      <g fontFamily="Geist Mono, monospace" fontSize="11" fill="#1C1C1C">
        <text x="616" y="58">
          module.Wp
        </text>
        <text x="780" y="58" textAnchor="end">
          555
        </text>
        <text x="616" y="80">
          tables
        </text>
        <text x="780" y="80" textAnchor="end">
          1,184
        </text>
        <text x="616" y="102">
          row.pitch
        </text>
        <text x="780" y="102" textAnchor="end">
          4.5m
        </text>
        <text x="616" y="124">
          GCR
        </text>
        <text x="780" y="124" textAnchor="end">
          0.42
        </text>
        <text x="616" y="146">
          DC.cap
        </text>
        <text x="780" y="146" textAnchor="end">
          47.20 MWp
        </text>
        <text x="616" y="168">
          AC.cap
        </text>
        <text x="780" y="168" textAnchor="end">
          37.76 MWac
        </text>
        <text x="616" y="190">
          DC:AC
        </text>
        <text x="780" y="190" textAnchor="end">
          1.25
        </text>
        <text x="616" y="212">
          inverters
        </text>
        <text x="780" y="212" textAnchor="end">
          4
        </text>
        <text x="616" y="234">
          ICR
        </text>
        <text x="780" y="234" textAnchor="end">
          3
        </text>
        <text x="616" y="256">
          LA
        </text>
        <text x="780" y="256" textAnchor="end">
          28
        </text>
      </g>
      <line
        x1="610"
        y1="276"
        x2="790"
        y2="276"
        stroke="#E5E7EB"
      />
      <text
        x="616"
        y="296"
        fontFamily="Geist Mono, monospace"
        fontSize="10"
        fill="#6B7280"
        letterSpacing="0.5"
      >
        CABLES
      </text>
      <g fontFamily="Geist Mono, monospace" fontSize="11" fill="#1C1C1C">
        <text x="616" y="320">
          DC.string
        </text>
        <text x="780" y="320" textAnchor="end">
          12,840 m
        </text>
        <text x="616" y="342">
          DC.combiner
        </text>
        <text x="780" y="342" textAnchor="end">
          3,210 m
        </text>
        <text x="616" y="364">
          AC.LV
        </text>
        <text x="780" y="364" textAnchor="end">
          1,420 m
        </text>
      </g>
      {/* canvas content (boundary + rows) */}
      <g transform="translate(60,40)">
        <path
          d="M20 30 L460 22 L520 90 L510 250 L420 360 L160 370 L60 320 L10 200 Z"
          fill="#fff"
          stroke="#1A5C3A"
          strokeWidth="1.5"
        />
        <path
          d="M20 30 L460 22 L520 90 L510 250 L420 360 L160 370 L60 320 L10 200 Z"
          fill="#1A5C3A"
          opacity="0.04"
        />
        <ellipse
          cx="395"
          cy="220"
          rx="42"
          ry="22"
          fill="#E6F0FA"
          stroke="#1A5C3A"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        {/* table rows */}
        <g transform="translate(50,80)">
          <rect width="380" height="6" fill="#1A5C3A" />
          <rect y="12" width="380" height="6" fill="#1A5C3A" />
          <rect y="24" width="380" height="6" fill="#1A5C3A" />
          <rect y="36" width="380" height="6" fill="#1A5C3A" />
          <rect y="48" width="380" height="6" fill="#1A5C3A" />
          <rect y="60" width="320" height="6" fill="#1A5C3A" />
          <rect y="72" width="380" height="6" fill="#1A5C3A" />
          <rect y="84" width="320" height="6" fill="#1A5C3A" />
          <rect y="96" width="280" height="6" fill="#1A5C3A" />
          <rect y="108" width="380" height="6" fill="#1A5C3A" />
          <rect y="120" width="380" height="6" fill="#1A5C3A" />
          <rect y="132" width="320" height="6" fill="#1A5C3A" />
          <rect y="144" width="240" height="6" fill="#1A5C3A" />
          <rect y="156" width="200" height="6" fill="#1A5C3A" />
          <rect y="168" width="160" height="6" fill="#1A5C3A" />
          <rect y="180" width="120" height="6" fill="#1A5C3A" />
          <rect y="192" width="80" height="6" fill="#1A5C3A" />
        </g>
        {/* inverters */}
        <rect
          x="160"
          y="200"
          width="12"
          height="12"
          fill="#F5A623"
          stroke="#1C1C1C"
        />
        <rect
          x="290"
          y="220"
          width="12"
          height="12"
          fill="#F5A623"
          stroke="#1C1C1C"
        />
        <rect
          x="370"
          y="260"
          width="12"
          height="12"
          fill="#F5A623"
          stroke="#1C1C1C"
        />
        {/* selection highlight */}
        <rect
          x="156"
          y="196"
          width="20"
          height="20"
          fill="none"
          stroke="#F5A623"
          strokeWidth="1.4"
          strokeDasharray="3 2"
        />
        <text
          x="180"
          y="208"
          fontFamily="Geist Mono, monospace"
          fontSize="10"
          fill="#1C1C1C"
        >
          INV-01 selected
        </text>
      </g>
    </svg>
  )
}
