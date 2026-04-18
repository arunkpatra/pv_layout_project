// Auth types — Clerk integration will be wired here in a future spike.
// HonoEnv is used throughout the app so all handlers share the same type.

export type AuthUser = {
  id: string
  clerkId: string
}

export type HonoEnv = { Variables: { user: AuthUser } }
