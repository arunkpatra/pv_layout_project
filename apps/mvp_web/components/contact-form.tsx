"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@renewable-energy/ui/components/button"
import { Input } from "@renewable-energy/ui/components/input"
import { Textarea } from "@renewable-energy/ui/components/textarea"
import { Label } from "@renewable-energy/ui/components/label"

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
          json.error?.message ?? "Failed to send message. Please try again."
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="contact-name">
          Full Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="contact-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Enter your full name"
          required
          disabled={submitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-email">
          Email Address <span className="text-destructive">*</span>
        </Label>
        <Input
          id="contact-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          required
          disabled={submitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-subject">
          Subject <span className="text-destructive">*</span>
        </Label>
        <Input
          id="contact-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="What is this regarding?"
          required
          disabled={submitting}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-message">
          Message <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us more..."
          rows={5}
          required
          disabled={submitting}
        />
      </div>

      <Button
        type="submit"
        disabled={submitting}
        className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
      >
        {submitting ? "Sending\u2026" : "Send Message"}
      </Button>
    </form>
  )
}
