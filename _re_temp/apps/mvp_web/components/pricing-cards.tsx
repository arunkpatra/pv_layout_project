import { Fragment } from "react"
import Link from "next/link"
import { Button } from "@renewable-energy/ui/components/button"

type Feature = { name: string; basic: boolean; pro: boolean; proPlus: boolean }
type Group = { label: string; features: Feature[] }

const groups: Group[] = [
  {
    label: "Layout",
    features: [
      { name: "KMZ boundary input", basic: true, pro: true, proPlus: true },
      { name: "MMS table placement", basic: true, pro: true, proPlus: true },
      {
        name: "Inverter & lightning arrester placement",
        basic: true,
        pro: true,
        proPlus: true,
      },
      {
        name: "Obstruction exclusion",
        basic: true,
        pro: true,
        proPlus: true,
      },
      {
        name: "String & central inverter topology",
        basic: true,
        pro: true,
        proPlus: true,
      },
    ],
  },
  {
    label: "Cabling",
    features: [
      {
        name: "AC & DC cable routing",
        basic: false,
        pro: true,
        proPlus: true,
      },
      {
        name: "Cable quantity measurements",
        basic: false,
        pro: true,
        proPlus: true,
      },
      {
        name: "ICR building placement",
        basic: false,
        pro: true,
        proPlus: true,
      },
    ],
  },
  {
    label: "Yield",
    features: [
      {
        name: "Energy yield analysis",
        basic: false,
        pro: false,
        proPlus: true,
      },
      {
        name: "P50 / P75 / P90 exceedance",
        basic: false,
        pro: false,
        proPlus: true,
      },
      {
        name: "Plant generation estimates",
        basic: false,
        pro: false,
        proPlus: true,
      },
    ],
  },
  {
    label: "Export",
    features: [
      { name: "KMZ export", basic: true, pro: true, proPlus: true },
      {
        name: "DXF export (AutoCAD)",
        basic: true,
        pro: true,
        proPlus: true,
      },
      { name: "PDF report", basic: false, pro: true, proPlus: true },
    ],
  },
  {
    label: "Account",
    features: [
      {
        name: "Top-up at same rate",
        basic: true,
        pro: true,
        proPlus: true,
      },
      {
        name: "Email-tied entitlement",
        basic: true,
        pro: true,
        proPlus: true,
      },
    ],
  },
]

export function PricingCards() {
  return (
    <div>
      <table
        className="w-full overflow-hidden rounded-[var(--radius)] border border-border bg-card"
        style={{ borderCollapse: "separate", borderSpacing: 0 }}
      >
        <thead>
          <tr>
            <th className="w-[46%] border-b border-border bg-[#FBFCFD] px-[18px] py-3.5 text-left font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Feature
            </th>
            <th className="w-[18%] border-b border-border bg-[#FBFCFD] px-[18px] py-3.5 text-center">
              <div className="text-[15px] font-semibold text-foreground">
                Basic
              </div>
              <span className="font-mono text-[13px] font-medium text-primary">
                $1.99 &middot; 5 calcs
              </span>
            </th>
            <th className="w-[18%] border-b border-border bg-[#FBFCFD] px-[18px] py-3.5 text-center">
              <div className="text-[15px] font-semibold text-foreground">
                Pro
              </div>
              <span className="font-mono text-[13px] font-medium text-primary">
                $4.99 &middot; 10 calcs
              </span>
            </th>
            <th className="w-[18%] border-b border-border bg-[#FBFCFD] px-[18px] py-3.5 text-center">
              <div className="text-[15px] font-semibold text-foreground">
                Pro Plus
              </div>
              <span className="font-mono text-[13px] font-medium text-primary">
                $14.99 &middot; 50 calcs
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <Fragment key={group.label}>
              <tr>
                <td
                  colSpan={4}
                  className="bg-[#F4F8F6] px-[18px] py-2.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-primary"
                >
                  {group.label}
                </td>
              </tr>
              {group.features.map((feature) => (
                <tr key={feature.name}>
                  <td className="border-b border-border px-[18px] py-3.5 text-sm">
                    {feature.name}
                  </td>
                  <td
                    className={`border-b border-border px-[18px] py-3.5 text-center text-sm ${feature.basic ? "font-semibold text-green-600" : "text-[#9CA3AF]"}`}
                  >
                    {feature.basic ? "✓" : "—"}
                  </td>
                  <td
                    className={`border-b border-border px-[18px] py-3.5 text-center text-sm ${feature.pro ? "font-semibold text-green-600" : "text-[#9CA3AF]"}`}
                  >
                    {feature.pro ? "✓" : "—"}
                  </td>
                  <td
                    className={`border-b border-border px-[18px] py-3.5 text-center text-sm ${feature.proPlus ? "font-semibold text-green-600" : "text-[#9CA3AF]"}`}
                  >
                    {feature.proPlus ? "✓" : "—"}
                  </td>
                </tr>
              ))}
            </Fragment>
          ))}
          <tr>
            <td className="px-[18px] py-3.5" />
            <td className="px-[18px] py-3.5 text-center">
              <Button
                asChild
                variant="outline"
                className="w-full justify-center"
              >
                <Link href="/dashboard/plans">Buy Basic</Link>
              </Button>
            </td>
            <td className="px-[18px] py-3.5 text-center">
              <Button asChild className="w-full justify-center">
                <Link href="/dashboard/plans">Buy Pro</Link>
              </Button>
            </td>
            <td className="px-[18px] py-3.5 text-center">
              <Button
                asChild
                variant="outline"
                className="w-full justify-center"
              >
                <Link href="/dashboard/plans">Buy Pro Plus</Link>
              </Button>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="mt-8 rounded-[var(--radius)] border border-border bg-card p-6 text-left text-[15px] text-[#374151]">
        <strong className="text-foreground">Top-ups.</strong> Purchase
        additional calculation packs at any time at the same rate as your
        original plan. Calculations from multiple top-ups are pooled across
        the same email-tied entitlement.
      </div>
    </div>
  )
}
