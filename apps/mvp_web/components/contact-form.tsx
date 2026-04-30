"use client"

import { useState } from "react"
import { toast } from "sonner"
import { ArrowRight } from "lucide-react"
import { Button } from "@solarlayout/ui/components/button"

const API_URL =
  process.env.NEXT_PUBLIC_MVP_API_URL ?? "http://localhost:3003"

export function ContactForm() {
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [subject, setSubject] = useState("")
  const [message, setMessage] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (
      !fullName.trim() ||
      !email.trim() ||
      !subject.trim() ||
      !message.trim()
    ) {
      toast.error("Please fill in all required fields.")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`${API_URL}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fullName.trim(),
          email: email.trim(),
          subject: subject.trim(),
          message: message.trim(),
        }),
      })

      const json = await res.json()

      if (!res.ok || !json.success) {
        const errorMessage =
          json.error?.message ??
          "Failed to send message. Please try again."
        toast.error(errorMessage)
        return
      }

      toast.success(
        "Thank you for reaching out. We will get back to you within 2 business days.",
      )
      setFullName("")
      setEmail("")
      setSubject("")
      setMessage("")
    } catch {
      toast.error("Failed to send message. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="rounded-[var(--radius)] border border-border bg-card p-7">
      <h3 className="mb-1.5 text-lg font-semibold">
        Send us a message
      </h3>
      <p className="mb-[22px] text-sm text-muted-foreground">
        All fields marked with an asterisk are required.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium">
            Full name
            <span className="ml-0.5 text-destructive">*</span>
          </label>
          <input
            type="text"
            required
            disabled={submitting}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Enter your full name"
            className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-[3px] focus:ring-primary/[0.12]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium">
            Work email
            <span className="ml-0.5 text-destructive">*</span>
          </label>
          <input
            type="email"
            required
            disabled={submitting}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-[3px] focus:ring-primary/[0.12]"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium">
            Subject
            <span className="ml-0.5 text-destructive">*</span>
          </label>
          <select
            required
            disabled={submitting}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-[3px] focus:ring-primary/[0.12]"
          >
            <option value="">Select…</option>
            <option>Sales enquiry</option>
            <option>Technical question</option>
            <option>Partnership</option>
            <option>Press / media</option>
            <option>Other</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium">
            Message
            <span className="ml-0.5 text-destructive">*</span>
          </label>
          <textarea
            required
            disabled={submitting}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Tell us more..."
            rows={5}
            className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-[3px] focus:ring-primary/[0.12]"
          />
        </div>

        <div className="flex items-center justify-between pt-1">
          <span className="font-mono text-[12.5px] text-muted-foreground">
            solarlayout.in &middot; v1
          </span>
          <Button
            type="submit"
            disabled={submitting}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {submitting ? "Sending\u2026" : "Send message"}
            {!submitting && (
              <ArrowRight className="ml-1.5 h-4 w-4" />
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
