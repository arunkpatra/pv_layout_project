import type { Metadata } from "next"
import { ProductCard } from "@/components/product-card"

export const metadata: Metadata = {
  title: "Products",
  description:
    "Download PV Layout Basic, Pro, or Pro Plus — automated solar plant layout design tools for Windows.",
}

const products = [
  {
    name: "PV Layout Basic",
    price: "$1.99",
    calculations: "5 layout calculations per purchase",
    features: [
      "KMZ boundary input with multiple plant areas",
      "Automatic MMS table placement within boundary",
      "Inverter and lightning arrester placement",
      "Obstruction exclusion (ponds, water bodies, transmission lines)",
      "KMZ and DXF export",
    ],
  },
  {
    name: "PV Layout Pro",
    price: "$4.99",
    calculations: "10 layout calculations per purchase",
    features: [
      "All PV Layout Basic features",
      "AC and DC cable placement with full routing",
      "Cable quantity measurements",
      "ICR building placement (1 per 18 MWp)",
      "KMZ, DXF, and PDF export",
    ],
    highlighted: true,
  },
  {
    name: "PV Layout Pro Plus",
    price: "$14.99",
    calculations: "50 layout and yield calculations per purchase",
    features: [
      "All PV Layout Pro features",
      "Energy yield analysis",
      "P50 / P75 / P90 exceedance values",
      "Plant generation estimates",
      "Complete PDF report with capacity, cables, and yield",
    ],
  },
]

export default function ProductsPage() {
  return (
    <div className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Our Products
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Three desktop tools for every stage of utility-scale solar
            PV plant development. From quick capacity estimates to
            detailed bankable layouts with energy yield analysis.
          </p>
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <ProductCard
              key={product.name}
              name={product.name}
              price={product.price}
              calculations={product.calculations}
              features={product.features}
              highlighted={product.highlighted}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
