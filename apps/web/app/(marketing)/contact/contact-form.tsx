"use client"

import { useState } from "react"
import { Button } from "@renewable-energy/ui/components/button"
import { Input } from "@renewable-energy/ui/components/input"
import { Label } from "@renewable-energy/ui/components/label"
import { Textarea } from "@renewable-energy/ui/components/textarea"
import { CircleCheck } from "lucide-react"

type Field = {
  name: string
  workEmail: string
  organisation: string
  role: string
  enquiry: string
  message: string
}

const EMPTY: Field = {
  name: "",
  workEmail: "",
  organisation: "",
  role: "",
  enquiry: "",
  message: "",
}

const enquiryOptions = [
  { value: "", label: "Select enquiry type" },
  { value: "enterprise", label: "Enterprise plan" },
  { value: "trial", label: "Professional trial" },
  { value: "integration", label: "Custom integration or DISCOM format" },
  { value: "demo", label: "Product walkthrough" },
  { value: "other", label: "Other" },
]

export function ContactForm() {
  const [fields, setFields] = useState<Field>(EMPTY)
  const [errors, setErrors] = useState<Partial<Field>>({})
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  function set(key: keyof Field, value: string) {
    setFields((f) => ({ ...f, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function validate(): boolean {
    const e: Partial<Field> = {}
    if (!fields.name.trim()) e.name = "Name is required."
    if (!fields.workEmail.trim()) {
      e.workEmail = "Work email is required."
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.workEmail)) {
      e.workEmail = "Enter a valid email address."
    }
    if (!fields.organisation.trim()) e.organisation = "Organisation is required."
    if (!fields.enquiry) e.enquiry = "Select an enquiry type."
    if (!fields.message.trim()) e.message = "Message is required."
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    // Mock submission delay
    setTimeout(() => {
      setSubmitting(false)
      setSubmitted(true)
    }, 800)
  }

  if (submitted) {
    return (
      <div className="flex flex-col gap-4 border px-6 py-10">
        <CircleCheck className="h-10 w-10 text-green-600 dark:text-green-400" />
        <h2 className="text-lg font-semibold">Message received</h2>
        <p className="text-sm text-muted-foreground">
          We have received your message and will respond to{" "}
          <span className="font-medium text-foreground">{fields.workEmail}</span> within one
          business day.
        </p>
        <Button
          variant="outline"
          className="mt-2 w-fit"
          onClick={() => { setFields(EMPTY); setSubmitted(false) }}
        >
          Send another message
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            placeholder="Arjun Sharma"
            value={fields.name}
            onChange={(e) => set("name", e.target.value)}
            aria-describedby={errors.name ? "name-error" : undefined}
          />
          {errors.name && (
            <p id="name-error" className="text-xs text-destructive">{errors.name}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="workEmail">Work email</Label>
          <Input
            id="workEmail"
            type="email"
            placeholder="arjun@company.in"
            value={fields.workEmail}
            onChange={(e) => set("workEmail", e.target.value)}
            aria-describedby={errors.workEmail ? "email-error" : undefined}
          />
          {errors.workEmail && (
            <p id="email-error" className="text-xs text-destructive">{errors.workEmail}</p>
          )}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="organisation">Organisation</Label>
          <Input
            id="organisation"
            placeholder="ABC Solar EPC Pvt. Ltd."
            value={fields.organisation}
            onChange={(e) => set("organisation", e.target.value)}
            aria-describedby={errors.organisation ? "org-error" : undefined}
          />
          {errors.organisation && (
            <p id="org-error" className="text-xs text-destructive">{errors.organisation}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="role">
            Role <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="role"
            placeholder="Design Engineer"
            value={fields.role}
            onChange={(e) => set("role", e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="enquiry">Enquiry type</Label>
        <select
          id="enquiry"
          value={fields.enquiry}
          onChange={(e) => set("enquiry", e.target.value)}
          aria-describedby={errors.enquiry ? "enquiry-error" : undefined}
          className="flex h-9 w-full border border-input bg-background px-3 py-1 text-sm text-foreground shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          {enquiryOptions.map((o) => (
            <option key={o.value} value={o.value} disabled={o.value === ""}>
              {o.label}
            </option>
          ))}
        </select>
        {errors.enquiry && (
          <p id="enquiry-error" className="text-xs text-destructive">{errors.enquiry}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="message">Message</Label>
        <Textarea
          id="message"
          placeholder="Describe your project scale, team size, or specific requirement."
          rows={5}
          value={fields.message}
          onChange={(e) => set("message", e.target.value)}
          aria-describedby={errors.message ? "message-error" : undefined}
        />
        {errors.message && (
          <p id="message-error" className="text-xs text-destructive">{errors.message}</p>
        )}
      </div>

      <div>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Sending…" : "Send message"}
        </Button>
      </div>
    </form>
  )
}
