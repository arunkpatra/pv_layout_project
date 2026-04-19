import type { User } from "@renewable-energy/shared"
import type { ApiClient } from "./client.js"
import { createProjectsClient } from "./projects.js"

export function createWebClient(client: ApiClient) {
  const { request } = client

  return {
    getMe(): Promise<User> {
      return request<User>("/auth/me")
    },
    ...createProjectsClient(client),
  }
}
