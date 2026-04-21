"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@renewable-energy/ui/components/button"
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@renewable-energy/ui/components/dialog"
import { Input } from "@renewable-energy/ui/components/input"
import { Label } from "@renewable-energy/ui/components/label"
import { Checkbox } from "@renewable-energy/ui/components/checkbox"
import Link from "next/link"

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

  function handleSubmit(e: React.FormEvent) {
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

    toast.info(
      `Download for ${productName} coming soon. We have noted your interest.`
    )
    setOpen(false)
    setFullName("")
    setEmail("")
    setMobile("")
    setAgreed(false)
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
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
          >
            Submit &amp; Download
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
