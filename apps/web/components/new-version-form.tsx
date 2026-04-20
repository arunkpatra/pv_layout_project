"use client"

import * as React from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRouter } from "next/navigation"
import { useCreateVersion } from "@/hooks/use-create-version"
import { Button } from "@renewable-energy/ui/components/button"
import { Alert, AlertDescription } from "@renewable-energy/ui/components/alert"
import { Input } from "@renewable-energy/ui/components/input"
import { Label } from "@renewable-energy/ui/components/label"
import { cn } from "@renewable-energy/ui/lib/utils"
import { Upload, X } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renewable-energy/ui/components/select"
import { Switch } from "@renewable-energy/ui/components/switch"

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

// ─── NumericField helper ──────────────────────────────────────────────────────

function NumericField({
  id,
  label,
  unit,
  register: reg,
  error,
}: {
  id: string
  label: string
  unit?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any
  error?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input id={id} type="number" step="any" className="flex-1" {...reg} />
        {unit && <span className="text-sm text-muted-foreground shrink-0">{unit}</span>}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

// ─── OverrideField helper ─────────────────────────────────────────────────────

function OverrideField({
  id,
  label,
  unit,
  enabled,
  onToggle,
  field,
  error,
}: {
  id: string
  label: string
  unit?: string
  enabled: boolean
  onToggle: (on: boolean) => void
  field: { value: number | null; onChange: (v: number | null) => void }
  error?: string
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Switch
          id={`${id}-switch`}
          checked={enabled}
          onCheckedChange={onToggle}
          aria-label={`Override ${label}`}
        />
        <Label htmlFor={id} className={enabled ? "" : "text-muted-foreground"}>
          {label}
        </Label>
      </div>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="number"
          step="any"
          disabled={!enabled}
          placeholder="Auto"
          value={field.value ?? ""}
          onChange={(e) =>
            field.onChange(e.target.value ? Number(e.target.value) : null)
          }
          className="flex-1"
        />
        {unit && (
          <span className="text-sm text-muted-foreground shrink-0">{unit}</span>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

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
            <h2 className="text-base font-semibold mb-4 pb-2 border-b">Run setup</h2>
            <div className="space-y-4">

              {/* KMZ upload */}
              <div className="space-y-1.5">
                <Label>KMZ boundary file</Label>
                {kmzFile ? (
                  <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                    <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate">{kmzFile.name}</span>
                    <span className="text-muted-foreground shrink-0">
                      {(kmzFile.size / 1024).toFixed(0)} KB
                    </span>
                    <button
                      type="button"
                      onClick={() => { setKmzFile(null); setKmzError(null) }}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Remove file"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <label
                    className={cn(
                      "flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-6 py-8 text-center cursor-pointer transition-colors hover:bg-muted/20",
                      kmzError && "border-destructive",
                    )}
                  >
                    <Upload className="h-6 w-6 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Drop KMZ file here or click to browse
                    </span>
                    <input
                      type="file"
                      accept=".kmz"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null
                        setKmzFile(f)
                        if (f) setKmzError(null)
                      }}
                    />
                  </label>
                )}
                {kmzError && (
                  <p className="text-xs text-destructive">{kmzError}</p>
                )}
              </div>

              {/* Run label */}
              <div className="space-y-1.5">
                <Label htmlFor="run-label">
                  Run label{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="run-label"
                  placeholder="e.g. Phase 1 baseline"
                  {...register("label")}
                />
              </div>

            </div>
          </section>
          <section id="module">
            <h2 className="text-base font-semibold mb-4 pb-2 border-b">Module</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <NumericField
                id="module-length"
                label="Module length"
                unit="m"
                register={register("module_length", { valueAsNumber: true })}
                error={errors.module_length?.message}
              />
              <NumericField
                id="module-width"
                label="Module width"
                unit="m"
                register={register("module_width", { valueAsNumber: true })}
                error={errors.module_width?.message}
              />
              <NumericField
                id="module-wattage"
                label="Wattage"
                unit="Wp"
                register={register("module_wattage", { valueAsNumber: true })}
                error={errors.module_wattage?.message}
              />
            </div>
          </section>
          <section id="table-config">
            <h2 className="text-base font-semibold mb-4 pb-2 border-b">Table config</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="orientation">Orientation</Label>
                <Controller
                  control={control}
                  name="orientation"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="orientation">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="portrait">Portrait</SelectItem>
                        <SelectItem value="landscape">Landscape</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <NumericField
                id="modules-in-row"
                label="Modules per row"
                register={register("modules_in_row", { valueAsNumber: true })}
                error={errors.modules_in_row?.message}
              />
              <NumericField
                id="rows-per-table"
                label="Rows per table"
                register={register("rows_per_table", { valueAsNumber: true })}
                error={errors.rows_per_table?.message}
              />
              <NumericField
                id="table-gap-ew"
                label="East–west gap"
                unit="m"
                register={register("table_gap_ew", { valueAsNumber: true })}
                error={errors.table_gap_ew?.message}
              />
            </div>
          </section>
          <section id="layout">
            <h2 className="text-base font-semibold mb-4 pb-2 border-b">Layout</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Controller
                control={control}
                name="tilt_angle"
                render={({ field }) => (
                  <OverrideField
                    id="tilt-angle"
                    label="Tilt angle"
                    unit="°"
                    enabled={tiltOverride}
                    onToggle={(on) => {
                      setTiltOverride(on)
                      setValue("tilt_angle", on ? 20 : null)
                    }}
                    field={field}
                    error={errors.tilt_angle?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="row_spacing"
                render={({ field }) => (
                  <OverrideField
                    id="row-spacing"
                    label="Row pitch"
                    unit="m"
                    enabled={rowSpacingOverride}
                    onToggle={(on) => {
                      setRowSpacingOverride(on)
                      setValue("row_spacing", on ? 7.0 : null)
                    }}
                    field={field}
                    error={errors.row_spacing?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="gcr"
                render={({ field }) => (
                  <OverrideField
                    id="gcr"
                    label="GCR"
                    enabled={gcrOverride}
                    onToggle={(on) => {
                      setGcrOverride(on)
                      setValue("gcr", on ? 0.40 : null)
                    }}
                    field={field}
                    error={errors.gcr?.message}
                  />
                )}
              />
              <NumericField
                id="road-width"
                label="Perimeter road width"
                unit="m"
                register={register("perimeter_road_width", { valueAsNumber: true })}
                error={errors.perimeter_road_width?.message}
              />
            </div>
          </section>
          <section id="inverter">
            <h2 className="text-base font-semibold mb-4 pb-2 border-b">Inverter</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <NumericField
                id="max-strings"
                label="Max strings per inverter"
                register={register("max_strings_per_inverter", { valueAsNumber: true })}
                error={errors.max_strings_per_inverter?.message}
              />
            </div>
          </section>
          <section id="energy-losses">
            <h2 className="text-base font-semibold mb-4 pb-2 border-b">
              Energy losses
            </h2>

            {/* Irradiance */}
            <div className="mb-6">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
                Irradiance
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <NumericField
                  id="ghi"
                  label="GHI"
                  unit="kWh/m²/yr"
                  register={register("ghi_kwh_m2_yr", { valueAsNumber: true })}
                  error={errors.ghi_kwh_m2_yr?.message}
                />
                <NumericField
                  id="gti"
                  label="GTI (in-plane)"
                  unit="kWh/m²/yr"
                  register={register("gti_kwh_m2_yr", { valueAsNumber: true })}
                  error={errors.gti_kwh_m2_yr?.message}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Enter site irradiance values. Leave 0 to skip energy
                calculation.
              </p>
            </div>

            {/* Performance ratio breakdown */}
            <div className="mb-6">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
                Performance ratio breakdown
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <NumericField
                  id="inverter-efficiency"
                  label="Inverter efficiency"
                  unit="%"
                  register={register("inverter_efficiency_pct", {
                    valueAsNumber: true,
                  })}
                  error={errors.inverter_efficiency_pct?.message}
                />
                <NumericField
                  id="dc-cable-loss"
                  label="DC cable losses"
                  unit="%"
                  register={register("dc_cable_loss_pct", {
                    valueAsNumber: true,
                  })}
                  error={errors.dc_cable_loss_pct?.message}
                />
                <NumericField
                  id="ac-cable-loss"
                  label="AC cable losses"
                  unit="%"
                  register={register("ac_cable_loss_pct", {
                    valueAsNumber: true,
                  })}
                  error={errors.ac_cable_loss_pct?.message}
                />
                <NumericField
                  id="soiling-loss"
                  label="Soiling losses"
                  unit="%"
                  register={register("soiling_loss_pct", {
                    valueAsNumber: true,
                  })}
                  error={errors.soiling_loss_pct?.message}
                />
                <NumericField
                  id="temperature-loss"
                  label="Temperature losses"
                  unit="%"
                  register={register("temperature_loss_pct", {
                    valueAsNumber: true,
                  })}
                  error={errors.temperature_loss_pct?.message}
                />
                <NumericField
                  id="mismatch-loss"
                  label="Module mismatch"
                  unit="%"
                  register={register("mismatch_loss_pct", {
                    valueAsNumber: true,
                  })}
                  error={errors.mismatch_loss_pct?.message}
                />
                <NumericField
                  id="shading-loss"
                  label="Shading losses"
                  unit="%"
                  register={register("shading_loss_pct", {
                    valueAsNumber: true,
                  })}
                  error={errors.shading_loss_pct?.message}
                />
                <NumericField
                  id="availability"
                  label="Availability"
                  unit="%"
                  register={register("availability_pct", {
                    valueAsNumber: true,
                  })}
                  error={errors.availability_pct?.message}
                />
                <NumericField
                  id="transformer-loss"
                  label="Transformer losses"
                  unit="%"
                  register={register("transformer_loss_pct", {
                    valueAsNumber: true,
                  })}
                  error={errors.transformer_loss_pct?.message}
                />
                <NumericField
                  id="other-loss"
                  label="Other losses"
                  unit="%"
                  register={register("other_loss_pct", {
                    valueAsNumber: true,
                  })}
                  error={errors.other_loss_pct?.message}
                />
              </div>
            </div>

            {/* Degradation */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
                Degradation
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <NumericField
                  id="first-year-deg"
                  label="1st year degradation"
                  unit="%"
                  register={register("first_year_degradation_pct", {
                    valueAsNumber: true,
                  })}
                  error={errors.first_year_degradation_pct?.message}
                />
                <NumericField
                  id="annual-deg"
                  label="Annual degradation"
                  unit="%/yr"
                  register={register("annual_degradation_pct", {
                    valueAsNumber: true,
                  })}
                  error={errors.annual_degradation_pct?.message}
                />
                <NumericField
                  id="plant-lifetime"
                  label="Plant lifetime"
                  unit="years"
                  register={register("plant_lifetime_years", {
                    valueAsNumber: true,
                  })}
                  error={errors.plant_lifetime_years?.message}
                />
              </div>
            </div>
          </section>
        </form>

        {/* Mobile submit button */}
        <div className="lg:hidden mt-6">{submitButton}</div>
      </div>
    </div>
  )
}
