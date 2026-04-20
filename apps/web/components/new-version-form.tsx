"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRouter } from "next/navigation"
import { useCreateVersion } from "@/hooks/use-create-version"
import { Button } from "@renewable-energy/ui/components/button"
import { Alert, AlertDescription } from "@renewable-energy/ui/components/alert"
import { cn } from "@renewable-energy/ui/lib/utils"

// ─── Zod schema ──────────────────────────────────────────────────────────────

export const newVersionSchema = z.object({
  label: z.string().optional(),
  // Module
  module_length: z.number().min(0.5).max(5.0),
  module_width: z.number().min(0.5).max(3.0),
  module_wattage: z.number().min(100).max(1000),
  // Table config
  orientation: z.enum(["portrait", "landscape"]),
  modules_in_row: z.number().min(1).max(100),
  rows_per_table: z.number().min(1).max(10),
  table_gap_ew: z.number().min(0).max(20),
  // Layout
  tilt_angle: z.number().min(5).max(40).nullable(),
  row_spacing: z.number().min(1).max(50).nullable(),
  gcr: z.number().min(0.1).max(0.9).nullable(),
  perimeter_road_width: z.number().min(0).max(50),
  // Inverter
  max_strings_per_inverter: z.number().min(1).max(500),
  // Energy
  ghi_kwh_m2_yr: z.number().min(0).max(3000),
  gti_kwh_m2_yr: z.number().min(0).max(3500),
  inverter_efficiency_pct: z.number().min(50).max(100),
  dc_cable_loss_pct: z.number().min(0).max(20),
  ac_cable_loss_pct: z.number().min(0).max(20),
  soiling_loss_pct: z.number().min(0).max(20),
  temperature_loss_pct: z.number().min(0).max(20),
  mismatch_loss_pct: z.number().min(0).max(10),
  shading_loss_pct: z.number().min(0).max(20),
  availability_pct: z.number().min(50).max(100),
  transformer_loss_pct: z.number().min(0).max(10),
  other_loss_pct: z.number().min(0).max(10),
  first_year_degradation_pct: z.number().min(0).max(10),
  annual_degradation_pct: z.number().min(0).max(5),
  plant_lifetime_years: z.number().min(1).max(50),
})

export type NewVersionFormValues = z.infer<typeof newVersionSchema>

export const FORM_DEFAULTS: NewVersionFormValues = {
  label: "",
  module_length: 2.38,
  module_width: 1.13,
  module_wattage: 580,
  orientation: "portrait",
  modules_in_row: 28,
  rows_per_table: 2,
  table_gap_ew: 1.0,
  tilt_angle: null,
  row_spacing: null,
  gcr: null,
  perimeter_road_width: 6.0,
  max_strings_per_inverter: 20,
  ghi_kwh_m2_yr: 0,
  gti_kwh_m2_yr: 0,
  inverter_efficiency_pct: 97.0,
  dc_cable_loss_pct: 2.0,
  ac_cable_loss_pct: 1.0,
  soiling_loss_pct: 4.0,
  temperature_loss_pct: 6.0,
  mismatch_loss_pct: 2.0,
  shading_loss_pct: 2.0,
  availability_pct: 98.0,
  transformer_loss_pct: 1.0,
  other_loss_pct: 1.0,
  first_year_degradation_pct: 2.0,
  annual_degradation_pct: 0.5,
  plant_lifetime_years: 25,
}

// ─── Section config ───────────────────────────────────────────────────────────

const SECTIONS = [
  { id: "run-setup", label: "Run setup" },
  { id: "module", label: "Module" },
  { id: "table-config", label: "Table config" },
  { id: "layout", label: "Layout" },
  { id: "inverter", label: "Inverter" },
  { id: "energy-losses", label: "Energy losses" },
] as const

// ─── Component ────────────────────────────────────────────────────────────────

export function NewVersionForm({ projectId }: { projectId: string }) {
  const router = useRouter()
  const { mutateAsync, isPending } = useCreateVersion()

  const [kmzFile, setKmzFile] = React.useState<File | null>(null)
  const [kmzError, setKmzError] = React.useState<string | null>(null)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const [activeSection, setActiveSection] = React.useState<string>(
    SECTIONS[0].id,
  )

  // Auto-override switch state for the three nullable layout fields
  const [tiltOverride, setTiltOverride] = React.useState(false)
  const [rowSpacingOverride, setRowSpacingOverride] = React.useState(false)
  const [gcrOverride, setGcrOverride] = React.useState(false)

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { handleSubmit, register, control, setValue, formState: { errors } } =
    useForm<NewVersionFormValues>({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolver: zodResolver(newVersionSchema as any),
      defaultValues: FORM_DEFAULTS,
    })

  // IntersectionObserver: highlight active section in nav
  React.useEffect(() => {
    const observers: IntersectionObserver[] = []
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (!el) return
      const obs = new IntersectionObserver(
        (entries) => {
          const entry = entries[0]
          if (entry?.isIntersecting) setActiveSection(id)
        },
        { threshold: 0.3 },
      )
      obs.observe(el)
      observers.push(obs)
    })
    return () => observers.forEach((o) => o.disconnect())
  }, [])

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })
  }

  async function onSubmit(data: NewVersionFormValues) {
    if (!kmzFile) {
      setKmzError("KMZ file is required.")
      return
    }
    setKmzError(null)
    setSubmitError(null)
    try {
      const inputSnapshot: Record<string, unknown> = {
        module_length: data.module_length,
        module_width: data.module_width,
        module_wattage: data.module_wattage,
        orientation: data.orientation,
        modules_in_row: data.modules_in_row,
        rows_per_table: data.rows_per_table,
        table_gap_ew: data.table_gap_ew,
        tilt_angle: tiltOverride ? data.tilt_angle : null,
        row_spacing: rowSpacingOverride ? data.row_spacing : null,
        gcr: gcrOverride ? data.gcr : null,
        perimeter_road_width: data.perimeter_road_width,
        max_strings_per_inverter: data.max_strings_per_inverter,
        ghi_kwh_m2_yr: data.ghi_kwh_m2_yr,
        gti_kwh_m2_yr: data.gti_kwh_m2_yr,
        inverter_efficiency_pct: data.inverter_efficiency_pct,
        dc_cable_loss_pct: data.dc_cable_loss_pct,
        ac_cable_loss_pct: data.ac_cable_loss_pct,
        soiling_loss_pct: data.soiling_loss_pct,
        temperature_loss_pct: data.temperature_loss_pct,
        mismatch_loss_pct: data.mismatch_loss_pct,
        shading_loss_pct: data.shading_loss_pct,
        availability_pct: data.availability_pct,
        transformer_loss_pct: data.transformer_loss_pct,
        other_loss_pct: data.other_loss_pct,
        first_year_degradation_pct: data.first_year_degradation_pct,
        annual_degradation_pct: data.annual_degradation_pct,
        plant_lifetime_years: data.plant_lifetime_years,
      }
      const version = await mutateAsync({
        projectId,
        label: data.label?.trim() || undefined,
        inputSnapshot,
        kmzFile,
      })
      router.push(
        `/dashboard/projects/${projectId}/versions/${version.id}`,
      )
    } catch (err: unknown) {
      const e = err as { code?: string }
      if (e.code === "NETWORK_ERROR") {
        setSubmitError(
          "Layout submission failed. Could not reach the server. Check your connection and try again.",
        )
      } else if (e.code === "HTTP_ERROR" || e.code === "PARSE_ERROR") {
        setSubmitError(
          "Layout submission failed. The server rejected the request. Check your inputs and try again.",
        )
      } else {
        setSubmitError(
          "Layout submission failed. An unexpected error occurred. Try again or contact support.",
        )
      }
    }
  }

  const submitButton = (
    <Button
      type="submit"
      form="new-version-form"
      disabled={isPending}
      className="w-full"
    >
      {isPending ? (
        <>
          <svg
            className="animate-spin mr-2 h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v8H4z"
            />
          </svg>
          Running…
        </>
      ) : (
        "Run layout"
      )}
    </Button>
  )

  // Suppress unused variable warnings for state setters used in later tasks
  void setKmzFile
  void setKmzError
  void tiltOverride
  void setTiltOverride
  void rowSpacingOverride
  void setRowSpacingOverride
  void gcrOverride
  void setGcrOverride

  return (
    <div className="flex gap-8">
      {/* Desktop sticky left-nav */}
      <aside className="hidden lg:flex flex-col w-[200px] shrink-0">
        <nav className="sticky top-6 flex flex-col gap-1">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => scrollTo(s.id)}
              className={cn(
                "text-left text-sm px-3 py-1.5 rounded-md transition-colors",
                activeSection === s.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
              )}
            >
              {s.label}
            </button>
          ))}
          <div className="mt-4">{submitButton}</div>
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Mobile chip nav */}
        <div className="lg:hidden flex gap-2 overflow-x-auto pb-2 mb-6">
          {SECTIONS.map((s) => (
            <Button
              key={s.id}
              type="button"
              variant={activeSection === s.id ? "default" : "outline"}
              size="sm"
              className="shrink-0"
              onClick={() => scrollTo(s.id)}
            >
              {s.label}
            </Button>
          ))}
        </div>

        <form
          id="new-version-form"
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-10"
        >
          {submitError && (
            <Alert variant="destructive">
              <AlertDescription>{submitError}</AlertDescription>
            </Alert>
          )}

          <section id="run-setup">
            <h2 className="text-base font-semibold mb-4 pb-2 border-b">
              Run setup
            </h2>
          </section>
          <section id="module">
            <h2 className="text-base font-semibold mb-4 pb-2 border-b">
              Module
            </h2>
          </section>
          <section id="table-config">
            <h2 className="text-base font-semibold mb-4 pb-2 border-b">
              Table config
            </h2>
          </section>
          <section id="layout">
            <h2 className="text-base font-semibold mb-4 pb-2 border-b">
              Layout
            </h2>
          </section>
          <section id="inverter">
            <h2 className="text-base font-semibold mb-4 pb-2 border-b">
              Inverter
            </h2>
          </section>
          <section id="energy-losses">
            <h2 className="text-base font-semibold mb-4 pb-2 border-b">
              Energy losses
            </h2>
          </section>
        </form>

        {/* Mobile submit button */}
        <div className="lg:hidden mt-6">{submitButton}</div>
      </div>
    </div>
  )
}
