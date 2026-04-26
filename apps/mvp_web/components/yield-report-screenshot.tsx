export function YieldReportScreenshot() {
  return (
    <svg
      viewBox="0 0 600 220"
      preserveAspectRatio="xMidYMid meet"
      className="block h-auto w-full"
    >
      <rect width="600" height="220" fill="#FAFBFC" />
      {/* left: stats */}
      <g fontFamily="Geist Mono, monospace" fontSize="11" fill="#1C1C1C">
        <text x="22" y="32" fill="#6B7280">
          P50
        </text>
        <text x="22" y="56" fontSize="22" fill="#1A5C3A">
          94.6 GWh
        </text>
        <text x="22" y="86" fill="#6B7280">
          P75
        </text>
        <text x="22" y="106" fontSize="14">
          90.2 GWh
        </text>
        <text x="22" y="132" fill="#6B7280">
          P90
        </text>
        <text x="22" y="152" fontSize="14">
          86.1 GWh
        </text>
        <text x="22" y="184" fill="#6B7280">
          CUF
        </text>
        <text x="22" y="200" fontSize="13">
          22.8 %
        </text>
      </g>
      {/* right: chart */}
      <g transform="translate(180,30)">
        <line
          x1="0"
          y1="160"
          x2="400"
          y2="160"
          stroke="#D1D5DB"
        />
        <g fontFamily="Geist Mono, monospace" fontSize="9" fill="#9CA3AF">
          <text x="0" y="174">
            J
          </text>
          <text x="33" y="174">
            F
          </text>
          <text x="66" y="174">
            M
          </text>
          <text x="99" y="174">
            A
          </text>
          <text x="132" y="174">
            M
          </text>
          <text x="165" y="174">
            J
          </text>
          <text x="198" y="174">
            J
          </text>
          <text x="231" y="174">
            A
          </text>
          <text x="264" y="174">
            S
          </text>
          <text x="297" y="174">
            O
          </text>
          <text x="330" y="174">
            N
          </text>
          <text x="363" y="174">
            D
          </text>
        </g>
        {/* bars */}
        <g fill="#1A5C3A">
          <rect x="0" y="80" width="22" height="80" />
          <rect x="33" y="60" width="22" height="100" />
          <rect x="66" y="40" width="22" height="120" />
          <rect x="99" y="22" width="22" height="138" />
          <rect x="132" y="14" width="22" height="146" />
          <rect x="165" y="38" width="22" height="122" />
          <rect x="198" y="48" width="22" height="112" />
          <rect x="231" y="44" width="22" height="116" />
          <rect x="264" y="42" width="22" height="118" />
          <rect x="297" y="56" width="22" height="104" />
          <rect x="330" y="74" width="22" height="86" />
          <rect x="363" y="86" width="22" height="74" />
        </g>
      </g>
    </svg>
  )
}
