import { Check, X } from "lucide-react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@renewable-energy/ui/components/card"
import { Button } from "@renewable-energy/ui/components/button"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@renewable-energy/ui/components/tooltip"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@renewable-energy/ui/components/table"

interface PricingTier {
  name: string
  price: string
  purchaseModel: string
  calculations: string
  highlighted?: boolean
}

const tiers: PricingTier[] = [
  {
    name: "PV Layout Basic",
    price: "$1.99",
    purchaseModel: "One-time",
    calculations: "5 Layout",
  },
  {
    name: "PV Layout Pro",
    price: "$4.99",
    purchaseModel: "One-time",
    calculations: "10 Layout",
    highlighted: true,
  },
  {
    name: "PV Layout Pro Plus",
    price: "$14.99",
    purchaseModel: "One-time",
    calculations: "50 Layout + Yield",
  },
]

interface FeatureRow {
  feature: string
  basic: boolean
  pro: boolean
  proPlus: boolean
}

const features: FeatureRow[] = [
  {
    feature: "Plant Layout (MMS, Inverter, LA)",
    basic: true,
    pro: true,
    proPlus: true,
  },
  {
    feature: "Obstruction Exclusion",
    basic: true,
    pro: true,
    proPlus: true,
  },
  {
    feature: "AC & DC Cable Routing",
    basic: false,
    pro: true,
    proPlus: true,
  },
  {
    feature: "Cable Quantity Measurements",
    basic: false,
    pro: true,
    proPlus: true,
  },
  {
    feature: "Energy Yield Analysis",
    basic: false,
    pro: false,
    proPlus: true,
  },
  {
    feature: "Plant Generation Estimates",
    basic: false,
    pro: false,
    proPlus: true,
  },
  {
    feature: "Top-up Available",
    basic: true,
    pro: true,
    proPlus: true,
  },
]

function FeatureIcon({ included }: { included: boolean }) {
  return included ? (
    <Check className="mx-auto h-5 w-5 text-green-600" />
  ) : (
    <X className="mx-auto h-5 w-5 text-muted-foreground/40" />
  )
}

export function PricingCards() {
  return (
    <div className="space-y-12">
      {/* Card grid for mobile */}
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {tiers.map((tier) => (
          <Card
            key={tier.name}
            className={`flex flex-col text-center ${tier.highlighted ? "border-accent ring-2 ring-accent/20" : ""}`}
          >
            <CardHeader>
              <CardTitle className="text-xl">{tier.name}</CardTitle>
              <div className="mt-2">
                <span className="text-4xl font-bold text-foreground">
                  {tier.price}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {tier.purchaseModel} &middot; {tier.calculations}
              </p>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-end">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full cursor-not-allowed opacity-60"
                      disabled
                    >
                      Buy Now
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Payment coming soon</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Feature comparison table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-2/5">Feature</TableHead>
              <TableHead className="text-center">
                PV Layout Basic
              </TableHead>
              <TableHead className="text-center">
                PV Layout Pro
              </TableHead>
              <TableHead className="text-center">
                PV Layout Pro Plus
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Price</TableCell>
              <TableCell className="text-center">$1.99</TableCell>
              <TableCell className="text-center">$4.99</TableCell>
              <TableCell className="text-center">$14.99</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">
                Purchase Model
              </TableCell>
              <TableCell className="text-center">One-time</TableCell>
              <TableCell className="text-center">One-time</TableCell>
              <TableCell className="text-center">One-time</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">
                Calculations Included
              </TableCell>
              <TableCell className="text-center">5 Layout</TableCell>
              <TableCell className="text-center">10 Layout</TableCell>
              <TableCell className="text-center">
                50 Layout + Yield
              </TableCell>
            </TableRow>
            {features.map((row) => (
              <TableRow key={row.feature}>
                <TableCell className="font-medium">
                  {row.feature}
                </TableCell>
                <TableCell>
                  <FeatureIcon included={row.basic} />
                </TableCell>
                <TableCell>
                  <FeatureIcon included={row.pro} />
                </TableCell>
                <TableCell>
                  <FeatureIcon included={row.proPlus} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Top-up note */}
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-muted-foreground">
          <strong className="text-foreground">
            Need more calculations?
          </strong>{" "}
          Top up anytime at the same rate. Payment system coming in
          Phase 2.
        </p>
      </div>
    </div>
  )
}
