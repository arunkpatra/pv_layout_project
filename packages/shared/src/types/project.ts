export type VersionStatus = "QUEUED" | "PROCESSING" | "COMPLETE" | "FAILED"
export type JobStatus = "QUEUED" | "PROCESSING" | "COMPLETE" | "FAILED"

export interface Project {
  id: string
  userId: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface LayoutJobSummary {
  id: string
  status: JobStatus
  kmzArtifactS3Key: string | null
  svgArtifactS3Key: string | null
  dxfArtifactS3Key: string | null
  statsJson: unknown | null
  errorDetail: string | null
  startedAt: string | null
  completedAt: string | null
}

export interface EnergyJobSummary {
  id: string
  status: JobStatus
  pdfArtifactS3Key: string | null
  statsJson: unknown | null
  irradianceSource: string | null
  errorDetail: string | null
  startedAt: string | null
  completedAt: string | null
}

export interface VersionDetail {
  id: string
  projectId: string
  number: number
  label: string | null
  status: VersionStatus
  kmzS3Key: string | null
  inputSnapshot: unknown
  layoutJob: LayoutJobSummary | null
  energyJob: EnergyJobSummary | null
  createdAt: string
  updatedAt: string
  svgPresignedUrl: string | null
}

export interface ProjectSummary extends Project {
  versionCount: number
  latestVersionStatus: VersionStatus | null
}

export interface LayoutInputSnapshot {
  // Module specification
  module_length: number
  module_width: number
  module_wattage: number
  // Table configuration
  orientation: "portrait" | "landscape"
  modules_in_row: number
  rows_per_table: number
  table_gap_ew: number
  // Layout parameters
  tilt_angle: number | null
  row_spacing: number | null
  gcr: number | null
  perimeter_road_width: number
  // Inverter configuration
  max_strings_per_inverter: number
  // Energy parameters
  ghi_kwh_m2_yr: number
  gti_kwh_m2_yr: number
  inverter_efficiency_pct: number
  dc_cable_loss_pct: number
  ac_cable_loss_pct: number
  soiling_loss_pct: number
  temperature_loss_pct: number
  mismatch_loss_pct: number
  shading_loss_pct: number
  availability_pct: number
  transformer_loss_pct: number
  other_loss_pct: number
  first_year_degradation_pct: number
  annual_degradation_pct: number
  plant_lifetime_years: number
}

export interface CreateProjectInput {
  name: string
}

export interface CreateVersionInput {
  projectId: string
  label?: string
  inputSnapshot: Record<string, unknown>
  kmzFile?: File
}
