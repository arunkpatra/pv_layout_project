import { Check } from "lucide-react"

const supportedFeatures = [
  "KMZ boundary input with multiple plant areas",
  "Fixed-tilt MMS table placement",
  "String inverter and central inverter topologies",
  "Automatic ICR placement (1 per 18 MWp)",
  "Lightning arrester placement and protection zone calculation",
  "DC string cable and AC/DC-to-ICR cable routing with quantity measurements",
  "Energy yield analysis with P50 / P75 / P90 exceedance values",
  "PDF, KMZ and DXF export",
]

export function SupportedFeatures() {
  return (
    <div className="rounded-lg border border-border bg-card p-6 sm:p-8">
      <h2 className="text-2xl font-bold text-foreground">
        Supported Features
      </h2>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {supportedFeatures.map((feature) => (
          <li key={feature} className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
            <span className="text-muted-foreground">{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
