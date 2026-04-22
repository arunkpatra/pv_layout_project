"use client"

import { useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { useAuth } from "@clerk/nextjs"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@renewable-energy/ui/components/card"
import { Button } from "@renewable-energy/ui/components/button"

type ProductSlug = "pv-layout-basic" | "pv-layout-pro" | "pv-layout-pro-plus"

interface DownloadCardProps {
  name: string
  price: string
  calculations: string
  productSlug: ProductSlug
  apiBaseUrl: string
  highlighted?: boolean
}

export function DownloadCard({
  name,
  price,
  calculations,
  productSlug,
  apiBaseUrl,
  highlighted,
}: DownloadCardProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { getToken } = useAuth()

  async function handleDownload() {
    setLoading(true)
    setError(null)

    try {
      const token = await getToken()
      const res = await fetch(
        `${apiBaseUrl}/dashboard/download/${productSlug}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      )

      const body = (await res.json()) as
        | { success: true; data: { url: string } }
        | { success: false; error: { message: string } }

      if (!body.success) {
        setError("Download failed. Please try again.")
        return
      }

      // Trigger browser download
      const a = document.createElement("a")
      a.href = body.data.url
      a.download = `${productSlug}.exe`
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (err) {
      console.error("Download error:", err)
      setError("Download failed. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card
      className={`flex flex-col text-center ${highlighted ? "border-accent ring-2 ring-accent/20" : ""}`}
    >
      <CardHeader>
        <CardTitle className="text-xl">{name}</CardTitle>
        <div className="mt-2">
          <span className="text-4xl font-bold text-foreground">{price}</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{calculations}</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-end gap-2">
        <Button onClick={handleDownload} disabled={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Preparing…
            </>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              Download
            </>
          )}
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}
