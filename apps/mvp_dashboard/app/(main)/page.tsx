import type { Metadata } from "next"
import { DownloadCard } from "@/components/download-card"

export const metadata: Metadata = {
  title: "Dashboard",
}

const MVP_API_URL =
  process.env.NEXT_PUBLIC_MVP_API_URL ?? "http://localhost:3003"

const products = [
  {
    name: "PV Layout Basic",
    price: "$1.99",
    calculations: "5 layout calculations per purchase",
    productSlug: "pv-layout-basic" as const,
  },
  {
    name: "PV Layout Pro",
    price: "$4.99",
    calculations: "10 layout calculations per purchase",
    productSlug: "pv-layout-pro" as const,
    highlighted: true,
  },
  {
    name: "PV Layout Pro Plus",
    price: "$14.99",
    calculations: "50 layout and yield calculations per purchase",
    productSlug: "pv-layout-pro-plus" as const,
  },
]

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Downloads
        </h1>
        <p className="mt-1 text-muted-foreground">
          Download the SolarLayout desktop application for your plan.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <DownloadCard
            key={product.productSlug}
            name={product.name}
            price={product.price}
            calculations={product.calculations}
            productSlug={product.productSlug}
            apiBaseUrl={MVP_API_URL}
            highlighted={product.highlighted}
          />
        ))}
      </div>
    </div>
  )
}
