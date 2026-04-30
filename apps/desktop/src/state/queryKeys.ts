/**
 * TanStack Query key builders.
 *
 * Centralised so the keys can't drift between callers and so a future
 * refactor (e.g. adding a versioning prefix to invalidate all caches at
 * once) is one-line.
 *
 * Each builder returns an `as const` tuple so TanStack Query's exact-
 * match dedup works on literal types, not generic `string[]`.
 */
import type { ProjectId, RunId } from "./project"

export const queryKeys = {
  /** GET /entitlements on api.solarlayout.in for a given license key. */
  entitlements: (licenseKey: string | null) =>
    ["entitlements", licenseKey] as const,

  /**
   * POST /layout on the local sidecar. Cached per (project identity, hash
   * of LayoutParameters). S9 lands the actual mutation; this builder is
   * scaffolded here so the slice + query layers come up together.
   */
  layout: (projectId: string, paramsHash: string) =>
    ["layout", projectId, paramsHash] as const,

  /** POST /usage/report on api.solarlayout.in for a given feature key. */
  usageReport: (featureKey: string) => ["usage", featureKey] as const,

  // ---------------------------------------------------------------------
  // Post-parity V2 — projects + runs (server cache via TanStack Query).
  // The actual hooks land with F5 (V2 backend HTTP client). These builders
  // are scaffolded in F4 alongside the project slice so call-sites don't
  // need to invent ad-hoc keys.
  // ---------------------------------------------------------------------

  /** GET /v2/projects — list of the user's projects. */
  projects: () => ["projects"] as const,

  /** GET /v2/projects/:id — single project + embedded runs summary. */
  project: (id: ProjectId) => ["project", id] as const,

  /** GET /v2/projects/:id/runs — runs for a project. */
  projectRuns: (projectId: ProjectId) =>
    ["project", projectId, "runs"] as const,

  /** GET /v2/projects/:id/runs/:runId — full run detail. */
  run: (projectId: ProjectId, runId: RunId) =>
    ["project", projectId, "runs", runId] as const,
} as const
