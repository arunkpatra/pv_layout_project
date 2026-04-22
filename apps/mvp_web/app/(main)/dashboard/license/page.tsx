"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@clerk/nextjs"
import { Key, Copy, CheckCheck, Loader2 } from "lucide-react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@renewable-energy/ui/components/card"
import { Button } from "@renewable-energy/ui/components/button"

const MVP_API_URL =
  process.env.NEXT_PUBLIC_MVP_API_URL ?? "http://localhost:3003"

export default function LicensePage() {
  const { getToken } = useAuth()
  const [licenseKey, setLicenseKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const token = await getToken()
        if (!token) return
        const res = await fetch(`${MVP_API_URL}/billing/entitlements`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          if (data.success) setLicenseKey(data.data.licenseKey)
        }
      } catch (err) {
        console.error("Failed to load license key:", err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [getToken])

  async function copyKey() {
    if (!licenseKey) return
    await navigator.clipboard.writeText(licenseKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          License
        </h1>
        <p className="mt-1 text-muted-foreground">Your licence key.</p>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Key className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Licence Key</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {licenseKey ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <code className="rounded bg-muted px-3 py-2 text-sm font-mono break-all">
                  {licenseKey}
                </code>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={copyKey}
                  aria-label="Copy license key"
                >
                  {copied ? (
                    <CheckCheck className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Enter this key in your SolarLayout desktop application to
                activate it.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Purchase a plan from the{" "}
              <a
                href="/dashboard/plan"
                className="text-primary underline underline-offset-4"
              >
                Plan page
              </a>{" "}
              to get your licence key.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
