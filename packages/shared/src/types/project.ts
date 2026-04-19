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
