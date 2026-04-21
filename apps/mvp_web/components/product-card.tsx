import { Download } from "lucide-react"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@renewable-energy/ui/components/card"
import { Button } from "@renewable-energy/ui/components/button"
import { DownloadModal } from "./download-modal"

interface ProductCardProps {
  name: string
  price: string
  calculations: string
  features: string[]
  highlighted?: boolean
}

export function ProductCard({
  name,
  price,
  calculations,
  features,
  highlighted = false,
}: ProductCardProps) {
  return (
    <Card
      className={`flex flex-col ${highlighted ? "border-accent ring-2 ring-accent/20" : ""}`}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl">{name}</CardTitle>
          <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
            {price}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{calculations}</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <ul className="flex-1 space-y-2">
          {features.map((feature) => (
            <li
              key={feature}
              className="flex items-start gap-2 text-sm text-muted-foreground"
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              {feature}
            </li>
          ))}
        </ul>
        <DownloadModal productName={name}>
          <Button className="mt-6 w-full bg-accent text-accent-foreground hover:bg-accent/90">
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
        </DownloadModal>
      </CardContent>
    </Card>
  )
}
