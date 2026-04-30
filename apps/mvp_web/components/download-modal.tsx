"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@solarlayout/ui/components/button"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@solarlayout/ui/components/dialog"
import { Input } from "@solarlayout/ui/components/input"
import { Label } from "@solarlayout/ui/components/label"
import { Checkbox } from "@solarlayout/ui/components/checkbox"
import Link from "next/link"

const API_URL =
  process.env.NEXT_PUBLIC_MVP_API_URL ?? "http://localhost:3003"

interface DownloadModalProps {
  productName: string
  children: React.ReactNode
}

export function DownloadModal({
  productName,
  children,
}: DownloadModalProps) {
  const [open, setOpen] = useState(false)
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [mobile, setMobile] = useState("")
  const [agreed, setAgreed] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!fullName.trim() || !email.trim()) {
      toast.error("Please fill in all required fields.")
      return
    }

    if (!agreed) {
      toast.error(
        "Please agree to the Terms & Conditions and Privacy Policy."
      )
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`${API_URL}/download-register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fullName.trim(),
          email: email.trim(),
          mobile: mobile.trim() || undefined,
          product: productName,
        }),
      })

      const json = await res.json()

      if (!res.ok || !json.success) {
        const message =
          json.error?.message ?? "Download failed. Please try again."
        toast.error(message)
        return
      }

      const { downloadUrl } = json.data as { downloadUrl: string }
      window.location.href = downloadUrl
      toast.info("Download started")
      setOpen(false)
      setFullName("")
      setEmail("")
      setMobile("")
      setAgreed(false)
    } catch {
      toast.error("Download failed. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enter your details to download</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`name-${productName}`}>
              Full Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`name-${productName}`}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your full name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`email-${productName}`}>
              Email Address <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`email-${productName}`}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`mobile-${productName}`}>
              Mobile Number{" "}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id={`mobile-${productName}`}
              type="tel"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="+91 98765 43210"
            />
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id={`agree-${productName}`}
              checked={agreed}
              onCheckedChange={(checked) =>
                setAgreed(checked === true)
              }
            />
            <Label
              htmlFor={`agree-${productName}`}
              className="text-sm leading-snug"
            >
              I agree to the{" "}
              <Link
                href="/terms"
                className="text-primary underline"
                target="_blank"
              >
                Terms &amp; Conditions
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                className="text-primary underline"
                target="_blank"
              >
                Privacy Policy
              </Link>
            </Label>
          </div>

          <Button
            type="submit"
            disabled={submitting || !agreed}
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {submitting ? "Submitting\u2026" : "Submit & Download"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
