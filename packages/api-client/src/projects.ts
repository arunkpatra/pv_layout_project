import type { Project, VersionDetail, CreateProjectInput } from "@renewable-energy/shared"
import type { ApiClient } from "./client.js"

export interface CreateVersionParams {
  projectId: string
  label?: string
  inputSnapshot: Record<string, unknown>
  kmzFile?: File
}

export function createProjectsClient(client: ApiClient) {
  const { request, upload } = client

  return {
    listProjects(): Promise<Project[]> {
      return request<Project[]>("/projects")
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
