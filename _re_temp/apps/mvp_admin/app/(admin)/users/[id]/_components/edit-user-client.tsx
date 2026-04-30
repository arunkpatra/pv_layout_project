"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAdminUser } from "@/lib/hooks/use-admin-user"
import { useUpdateUserRoles } from "@/lib/hooks/mutations/use-update-user-roles"
import { useUpdateUserStatus } from "@/lib/hooks/mutations/use-update-user-status"
import { Button } from "@renewable-energy/ui/components/button"
import { Checkbox } from "@renewable-energy/ui/components/checkbox"
import { Label } from "@renewable-energy/ui/components/label"
import { Skeleton } from "@renewable-energy/ui/components/skeleton"
import { Badge } from "@renewable-energy/ui/components/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@renewable-energy/ui/components/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renewable-energy/ui/components/select"

type Role = "ADMIN" | "OPS"
type Status = "ACTIVE" | "INACTIVE"

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "ADMIN", label: "Admin" },
  { value: "OPS", label: "OPS" },
]

export function EditUserClient({ userId }: { userId: string }) {
  const router = useRouter()
  const { data: user, isLoading, error } = useAdminUser(userId)
  const { mutate: updateRoles, isPending: rolesPending } = useUpdateUserRoles()
  const { mutate: updateStatus, isPending: statusPending } =
    useUpdateUserStatus()

  const [selectedRoles, setSelectedRoles] = useState<Role[]>([])
  const [selectedStatus, setSelectedStatus] = useState<Status>("ACTIVE")
  const [rolesSaved, setRolesSaved] = useState(false)
  const [statusSaved, setStatusSaved] = useState(false)

  useEffect(() => {
    if (user) {
      setSelectedRoles((user.roles as Role[]) ?? [])
      setSelectedStatus((user.status as Status) ?? "ACTIVE")
    }
  }, [user])

  function toggleRole(role: Role, checked: boolean) {
    setSelectedRoles((prev) =>
      checked ? [...prev, role] : prev.filter((r) => r !== role),
    )
    setRolesSaved(false)
  }

  function handleSaveRoles() {
    if (!user) return
    const current = (user.roles as Role[]) ?? []

    const toAdd = selectedRoles.filter((r) => !current.includes(r))
    const toRemove = current.filter((r) => !selectedRoles.includes(r))

    const mutations = [
      ...toAdd.map((role) => ({ role, action: "add" as const })),
      ...toRemove.map((role) => ({ role, action: "remove" as const })),
    ]

    if (mutations.length === 0) {
      setRolesSaved(true)
      return
    }

    let chain = Promise.resolve()
    for (const m of mutations) {
      chain = chain.then(
        () =>
          new Promise<void>((res, rej) =>
            updateRoles(
              { userId, ...m },
              { onSuccess: () => res(), onError: rej },
            ),
          ),
      )
    }
    chain.then(() => setRolesSaved(true)).catch(() => {})
  }

  function handleSaveStatus() {
    updateStatus(
      { userId, status: selectedStatus },
      { onSuccess: () => setStatusSaved(true) },
    )
  }

  if (isLoading) {
    return (
      <div className="max-w-lg space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (error || !user) {
    return (
      <div className="max-w-lg">
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "User not found."}
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push("/users")}
        >
          Back to Users
        </Button>
      </div>
    )
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/users")}
          className="text-muted-foreground"
        >
          ← Users
        </Button>
        <p className="font-semibold text-foreground">
          {user.name ?? user.email}
        </p>
      </div>

      <Tabs defaultValue="identity">
        <TabsList>
          <TabsTrigger value="identity">Identity</TabsTrigger>
          <TabsTrigger value="access">Access</TabsTrigger>
        </TabsList>

        <TabsContent value="identity" className="space-y-3 pt-4">
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Managed by Clerk
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Email</p>
                <p className="font-medium">{user.email}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Clerk ID</p>
                <p className="truncate font-mono text-xs text-muted-foreground">
                  {user.clerkId}
                </p>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            To change email or password, edit the user directly in the Clerk
            dashboard.
          </p>
        </TabsContent>

        <TabsContent value="access" className="space-y-5 pt-4">
          <div className="space-y-2">
            <Label>Roles</Label>
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
                  <label
                    htmlFor={`role-${value}`}
                    className="text-sm font-medium"
                  >
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
            {rolesSaved && (
              <p className="text-xs text-green-600">Roles saved.</p>
            )}
            <Button
              onClick={handleSaveRoles}
              disabled={rolesPending || selectedRoles.length === 0}
              size="sm"
            >
              {rolesPending ? "Saving…" : "Save Roles"}
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status">Account Status</Label>
            <Select
              value={selectedStatus}
              onValueChange={(v) => {
                setSelectedStatus(v as Status)
                setStatusSaved(false)
              }}
            >
              <SelectTrigger id="status" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">
                  <Badge variant="default" className="text-xs">
                    ACTIVE
                  </Badge>
                </SelectItem>
                <SelectItem value="INACTIVE">
                  <Badge variant="outline" className="text-xs">
                    INACTIVE
                  </Badge>
                </SelectItem>
              </SelectContent>
            </Select>
            {statusSaved && (
              <p className="text-xs text-green-600">Status saved.</p>
            )}
            <Button
              onClick={handleSaveStatus}
              disabled={statusPending}
              size="sm"
              variant="outline"
            >
              {statusPending ? "Saving…" : "Save Status"}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
