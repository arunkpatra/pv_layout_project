import { WindowFrame } from "./window-frame"

export function SchematicIllustration() {
  return (
    <WindowFrame
      title="site_boundary.kmz · 184.3 ha · 12 obstructions"
      badge="Auto-layout · 47.2 MWp"
    >
      <svg
        viewBox="0 0 640 360"
        preserveAspectRatio="xMidYMid meet"
        className="block h-auto w-full"
      >
        {/* grid background */}
        <defs>
          <pattern
            id="g"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M20 0H0V20"
              fill="none"
              stroke="#EEF1F4"
              strokeWidth="1"
            />
          </pattern>
          <pattern
            id="row"
            width="44"
            height="14"
            patternUnits="userSpaceOnUse"
          >
            <rect
              width="42"
              height="9"
              x="1"
              y="2.5"
              fill="#1A5C3A"
              opacity="0.85"
            />
          </pattern>
        </defs>
        <rect width="640" height="360" fill="url(#g)" />

        {/* KMZ boundary polygon */}
        <path
          d="M60 60 L520 50 L590 110 L580 250 L500 320 L240 330 L100 280 L40 180 Z"
          fill="#FFFFFF"
          stroke="#1A5C3A"
          strokeWidth="2"
          strokeDasharray="0"
        />
        <path
          d="M60 60 L520 50 L590 110 L580 250 L500 320 L240 330 L100 280 L40 180 Z"
          fill="#1A5C3A"
          opacity="0.04"
        />

        {/* exclusion zone (water body) */}
        <ellipse
          cx="455"
          cy="220"
          rx="48"
          ry="28"
          fill="#E6F0FA"
          stroke="#1A5C3A"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <text
          x="455"
          y="224"
          textAnchor="middle"
          fontFamily="Geist Mono, monospace"
          fontSize="10"
          fill="#1A5C3A"
        >
          EXCL · pond
        </text>

        {/* transmission line corridor */}
        <line
          x1="60"
          y1="120"
          x2="600"
          y2="135"
          stroke="#F5A623"
          strokeWidth="2.5"
          strokeDasharray="6 4"
        />
        <text
          x="80"
          y="113"
          fontFamily="Geist Mono, monospace"
          fontSize="10"
          fill="#92400e"
        >
          220kV corridor · setback 35m
        </text>

        {/* MMS table rows */}
        <g>
          {/* block A */}
          <g transform="translate(80,160)">
            <rect width="380" height="9" fill="#1A5C3A" />
            <rect y="14" width="380" height="9" fill="#1A5C3A" />
            <rect y="28" width="380" height="9" fill="#1A5C3A" />
            <rect y="42" width="380" height="9" fill="#1A5C3A" />
            <rect y="56" width="380" height="9" fill="#1A5C3A" />
            <rect y="70" width="320" height="9" fill="#1A5C3A" />
            <rect y="84" width="200" height="9" fill="#1A5C3A" />
          </g>
          {/* block B (around exclusion) */}
          <g transform="translate(480,180)">
            <rect width="80" height="9" fill="#1A5C3A" />
            <rect y="14" width="60" height="9" fill="#1A5C3A" />
            <rect y="58" width="80" height="9" fill="#1A5C3A" />
            <rect y="72" width="80" height="9" fill="#1A5C3A" />
          </g>
          {/* block C top */}
          <g transform="translate(80,80)">
            <rect width="240" height="9" fill="#1A5C3A" />
            <rect y="14" width="320" height="9" fill="#1A5C3A" />
            <rect y="28" width="200" height="9" fill="#1A5C3A" />
          </g>
        </g>

        {/* Inverters */}
        <g>
          <rect
            x="190"
            y="195"
            width="14"
            height="14"
            fill="#F5A623"
            stroke="#1C1C1C"
            strokeWidth="1"
          />
          <rect
            x="320"
            y="208"
            width="14"
            height="14"
            fill="#F5A623"
            stroke="#1C1C1C"
            strokeWidth="1"
          />
          <rect
            x="430"
            y="240"
            width="14"
            height="14"
            fill="#F5A623"
            stroke="#1C1C1C"
            strokeWidth="1"
          />
          <rect
            x="540"
            y="220"
            width="14"
            height="14"
            fill="#F5A623"
            stroke="#1C1C1C"
            strokeWidth="1"
          />
          <text
            x="216"
            y="207"
            fontFamily="Geist Mono, monospace"
            fontSize="9.5"
            fill="#1C1C1C"
          >
            INV-01
          </text>
          <text
            x="346"
            y="220"
            fontFamily="Geist Mono, monospace"
            fontSize="9.5"
            fill="#1C1C1C"
          >
            INV-02
          </text>
          <text
            x="456"
            y="252"
            fontFamily="Geist Mono, monospace"
            fontSize="9.5"
            fill="#1C1C1C"
          >
            INV-03
          </text>
          <text
            x="566"
            y="232"
            fontFamily="Geist Mono, monospace"
            fontSize="9.5"
            fill="#1C1C1C"
          >
            INV-04
          </text>
        </g>

        {/* Lightning arresters */}
        <g stroke="#1A5C3A" strokeWidth="1.4" fill="none">
          <path d="M120 100 v-12" />
          <circle cx="120" cy="86" r="3" fill="#1A5C3A" />
          <path d="M460 80 v-12" />
          <circle cx="460" cy="66" r="3" fill="#1A5C3A" />
          <path d="M530 290 v-12" />
          <circle cx="530" cy="276" r="3" fill="#1A5C3A" />
          <path d="M150 280 v-12" />
          <circle cx="150" cy="266" r="3" fill="#1A5C3A" />
        </g>

        {/* ICR */}
        <rect x="252" y="252" width="22" height="14" fill="#1A5C3A" />
        <text
          x="258"
          y="278"
          fontFamily="Geist Mono, monospace"
          fontSize="10"
          fill="#1A5C3A"
        >
          ICR-01
        </text>

        {/* Cable trace (DC) */}
        <path
          d="M198 209 L260 254 L330 215 L437 248 L545 225"
          fill="none"
          stroke="#1A5C3A"
          strokeWidth="1.2"
          strokeDasharray="2 3"
        />

        {/* Annotation: row pitch */}
        <g>
          <line
            x1="80"
            y1="146"
            x2="80"
            y2="164"
            stroke="#6B7280"
            strokeWidth="1"
          />
          <line
            x1="80"
            y1="160"
            x2="80"
            y2="174"
            stroke="#6B7280"
            strokeWidth="1"
          />
          <text
            x="86"
            y="168"
            fontFamily="Geist Mono, monospace"
            fontSize="10"
            fill="#6B7280"
          >
            pitch 4.5m · GCR 0.42
          </text>
        </g>

        {/* compass */}
        <g transform="translate(596,310)">
          <circle r="14" fill="#fff" stroke="#D1D5DB" strokeWidth="1" />
          <path d="M0 -10 L4 4 L0 1 L-4 4 Z" fill="#1C1C1C" />
          <text
            y="-16"
            fontFamily="Geist Mono, monospace"
            fontSize="9"
            fill="#6B7280"
            textAnchor="middle"
          >
            N
          </text>
        </g>
      </svg>

      {/* Data footer */}
      <dl className="grid grid-cols-4 border-t border-border">
        <div className="border-r border-border px-[14px] py-[12px]">
          <dt className="font-mono text-[10px] uppercase text-muted-foreground">
            Capacity DC
          </dt>
          <dd className="text-[14px] font-semibold">47.2 MWp</dd>
        </div>
        <div className="border-r border-border px-[14px] py-[12px]">
          <dt className="font-mono text-[10px] uppercase text-muted-foreground">
            GCR
          </dt>
          <dd className="text-[14px] font-semibold">0.42</dd>
        </div>
        <div className="border-r border-border px-[14px] py-[12px]">
          <dt className="font-mono text-[10px] uppercase text-muted-foreground">
            Tables
          </dt>
          <dd className="text-[14px] font-semibold">1,184</dd>
        </div>
        <div className="px-[14px] py-[12px]">
          <dt className="font-mono text-[10px] uppercase text-muted-foreground">
            Inverters
          </dt>
          <dd className="text-[14px] font-semibold">4 × CUF</dd>
        </div>
      </dl>
    </WindowFrame>
  )
}
