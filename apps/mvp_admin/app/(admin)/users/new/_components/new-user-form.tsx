"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useCreateAdminUser } from "@/lib/hooks/mutations/use-create-admin-user"
import { Button } from "@renewable-energy/ui/components/button"
import { Input } from "@renewable-energy/ui/components/input"
import { Label } from "@renewable-energy/ui/components/label"
import { Checkbox } from "@renewable-energy/ui/components/checkbox"

type Role = "ADMIN" | "OPS"
const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "ADMIN", label: "Admin" },
  { value: "OPS", label: "OPS" },
]

export function NewUserForm() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [selectedRoles, setSelectedRoles] = useState<Role[]>(["OPS"])

  const { mutate, isPending, isError, error } = useCreateAdminUser()

  function toggleRole(role: Role, checked: boolean) {
    setSelectedRoles((prev) =>
      checked ? [...prev, role] : prev.filter((r) => r !== role),
    )
  }

  function handleSubmit() {
    if (!name.trim() || !email.trim() || selectedRoles.length === 0) return
    mutate(
      { name: name.trim(), email: email.trim(), roles: selectedRoles },
      { onSuccess: () => router.push("/users") },
    )
  }

  return (
    <div className="max-w-lg space-y-5">
      <div className="space-y-1">
        <Label htmlFor="name">Full Name *</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ravi Kumar"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="email">Email *</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ravi@solarlayout.in"
        />
      </div>

      <div className="space-y-2">
        <Label>Roles *</Label>
        <p className="text-xs text-muted-foreground">
          User is created in Clerk with these roles. No invite email is sent —
          share credentials out of band.
        </p>
        <div className="flex flex-col gap-2">
          {ROLE_OPTIONS.map(({ value, label }) => (
            <div key={value} className="flex items-center gap-2">
              <Checkbox
                id={`role-${value}`}
                checked={selectedRoles.includes(value)}
                onCheckedChange={(checked) =>
                  toggleRole(value, checked === true)
                }
              />
              <label htmlFor={`role-${value}`} className="text-sm font-medium">
                {label}
              </label>
            </div>
          ))}
        </div>
        {selectedRoles.length === 0 && (
          <p className="text-xs text-destructive">
            At least one role is required.
          </p>
        )}
      </div>

      {isError && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to create user"}
        </p>
      )}

      <div className="flex gap-3">
        <Button
          onClick={handleSubmit}
          disabled={
            isPending ||
            !name.trim() ||
            !email.trim() ||
            selectedRoles.length === 0
          }
        >
          {isPending ? "Creating…" : "Create User"}
        </Button>
        <Button
          variant="outline"
          onClick={() => router.push("/users")}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
