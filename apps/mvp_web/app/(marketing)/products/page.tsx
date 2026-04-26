import type { Metadata } from "next"
import { Download } from "lucide-react"
import { Button } from "@renewable-energy/ui/components/button"
import { DownloadModal } from "@/components/download-modal"
import { PageHeader } from "@/components/page-header"

export const metadata: Metadata = {
  title: "Products",
  description:
    "PV Layout — automated solar plant layout design for Windows.",
}

export default function ProductsPage() {
  return (
    <PageHeader
      breadcrumb={["SolarLayout", "Products"]}
      title="PV Layout"
      description="One desktop application for utility-scale solar PV plant development. Upload your KMZ boundary, generate layouts, route cables, and estimate energy yield — in minutes."
    >
      <div>
        <DownloadModal productName="PV Layout">
          <Button
            size="lg"
            className="gap-2 bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <Download className="h-5 w-5" />
            Download PV Layout
          </Button>
        </DownloadModal>
      </div>
    </PageHeader>
  )
}
