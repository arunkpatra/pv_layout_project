import type {
  Project,
  ProjectSummary,
  VersionDetail,
  CreateProjectInput,
  PaginatedResponse,
} from "@renewable-energy/shared"
import type { ApiClient } from "./client.js"

export interface PaginationParams {
  page?: number
  pageSize?: number
}

export interface CreateVersionParams {
  projectId: string
  label?: string
  inputSnapshot: Record<string, unknown>
  kmzFile?: File
}

function buildUrl(
  base: string,
  params: Record<string, string | number | undefined>,
): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value))
  }
  const qs = search.toString()
  return qs ? `${base}?${qs}` : base
}

export function createProjectsClient(client: ApiClient) {
  const { request, upload } = client

  return {
    listProjects(
      params?: PaginationParams,
    ): Promise<PaginatedResponse<ProjectSummary>> {
      return request<PaginatedResponse<ProjectSummary>>(
        buildUrl("/projects", { page: params?.page, pageSize: params?.pageSize }),
      )
    },

    getProject(projectId: string): Promise<Project> {
      return request<Project>(`/projects/${projectId}`)
    },

    createProject(input: CreateProjectInput): Promise<Project> {
      return request<Project>("/projects", {
        method: "POST",
        body: JSON.stringify(input),
      })
    },

    deleteProject(projectId: string): Promise<null> {
      return request<null>(`/projects/${projectId}`, { method: "DELETE" })
    },

    listVersions(
      projectId: string,
      params?: PaginationParams,
    ): Promise<PaginatedResponse<VersionDetail>> {
      return request<PaginatedResponse<VersionDetail>>(
        buildUrl(`/projects/${projectId}/versions`, {
          page: params?.page,
          pageSize: params?.pageSize,
        }),
      )
    },

    createVersion(params: CreateVersionParams): Promise<VersionDetail> {
      const formData = new FormData()
      const paramsPayload: Record<string, unknown> = { ...params.inputSnapshot }
      if (params.label !== undefined) {
        paramsPayload.label = params.label
      }
      formData.append("params", JSON.stringify(paramsPayload))
      if (params.kmzFile) {
        formData.append("kmz", params.kmzFile)
      }
      return upload<VersionDetail>(`/projects/${params.projectId}/versions`, formData)
    },

    getVersion(projectId: string, versionId: string): Promise<VersionDetail> {
      return request<VersionDetail>(`/projects/${projectId}/versions/${versionId}`)
    },
  }
}
