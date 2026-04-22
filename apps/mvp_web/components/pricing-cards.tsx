import { Check, X } from "lucide-react"
import Link from "next/link"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@renewable-energy/ui/components/card"
import { Button } from "@renewable-energy/ui/components/button"
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
  slug: string
  highlighted?: boolean
  isFree?: boolean
}

const tiers: PricingTier[] = [
  {
    name: "PV Layout Free",
    price: "Free",
    purchaseModel: "On signup",
    calculations: "5 Layout",
    slug: "pv-layout-free",
    isFree: true,
  },
  {
    name: "PV Layout Basic",
    price: "$1.99",
    purchaseModel: "One-time",
    calculations: "5 Layout",
    slug: "pv-layout-basic",
  },
  {
    name: "PV Layout Pro",
    price: "$4.99",
    purchaseModel: "One-time",
    calculations: "10 Layout",
    slug: "pv-layout-pro",
    highlighted: true,
  },
  {
    name: "PV Layout Pro Plus",
    price: "$14.99",
    purchaseModel: "One-time",
    calculations: "50 Layout + Yield",
    slug: "pv-layout-pro-plus",
  },
]

interface FeatureRow {
  feature: string
  free: boolean
  basic: boolean
  pro: boolean
  proPlus: boolean
}

const features: FeatureRow[] = [
  {
    feature: "Plant Layout (MMS, Inverter, LA)",
    free: true,
    basic: true,
    pro: true,
    proPlus: true,
  },
  {
    feature: "Obstruction Exclusion",
    free: true,
    basic: true,
    pro: true,
    proPlus: true,
  },
  {
    feature: "AC & DC Cable Routing",
    free: true,
    basic: false,
    pro: true,
    proPlus: true,
  },
  {
    feature: "Cable Quantity Measurements",
    free: true,
    basic: false,
    pro: true,
    proPlus: true,
  },
  {
    feature: "Energy Yield Analysis",
    free: true,
    basic: false,
    pro: false,
    proPlus: true,
  },
  {
    feature: "Plant Generation Estimates",
    free: true,
    basic: false,
    pro: false,
    proPlus: true,
  },
  {
    feature: "Top-up Available",
    free: false,
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
      {/* Card grid */}
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {tiers.map((tier) => (
          <Card
            key={tier.name}
            className={`flex flex-col text-center ${tier.highlighted ? "border-accent ring-2 ring-accent/20" : ""}`}
          >
            <CardHeader>
              {tier.isFree && (
                <span className="mb-1 inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                  Free on signup
                </span>
              )}
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
              {tier.isFree ? (
                <Button asChild className="w-full">
                  <Link href="/sign-up">Get Started Free</Link>
                </Button>
              ) : (
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/dashboard/plan?product=${tier.slug}`}>
                    Buy Now
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Feature comparison table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-2/6">Feature</TableHead>
              <TableHead className="text-center">Free</TableHead>
              <TableHead className="text-center">Basic</TableHead>
              <TableHead className="text-center">Pro</TableHead>
              <TableHead className="text-center">Pro Plus</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium">Price</TableCell>
              {tiers.map((tier) => (
                <TableCell
                  key={tier.slug}
                  className={`text-center${tier.isFree ? " text-green-700 font-semibold" : ""}`}
                >
                  {tier.price}
                </TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Purchase Model</TableCell>
              {tiers.map((tier) => (
                <TableCell
                  key={tier.slug}
                  className={`text-center${tier.isFree ? " text-muted-foreground text-sm" : ""}`}
                >
                  {tier.purchaseModel}
                </TableCell>
              ))}
            </TableRow>
            <TableRow>
              <TableCell className="font-medium">Calculations Included</TableCell>
              {tiers.map((tier) => (
                <TableCell key={tier.slug} className="text-center">
                  {tier.calculations}
                </TableCell>
              ))}
            </TableRow>
            {features.map((row) => (
              <TableRow key={row.feature}>
                <TableCell className="font-medium">{row.feature}</TableCell>
                <TableCell>
                  <FeatureIcon included={row.free} />
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

      {/* Free tier callout */}
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center dark:border-green-900 dark:bg-green-950/20">
        <p className="text-muted-foreground">
          <strong className="text-foreground">New to SolarLayout?</strong>{" "}
          Sign up free and get 5 full-featured calculations — no credit card required.
        </p>
      </div>

      {/* Top-up note */}
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <p className="text-muted-foreground">
          <strong className="text-foreground">Need more calculations?</strong>{" "}
          Top up anytime at the same rate.
        </p>
      </div>
    </div>
  )
}
