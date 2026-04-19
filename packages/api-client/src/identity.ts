import type { User } from "@renewable-energy/shared"
import type { ApiClient } from "./client.js"

export function createWebClient(client: ApiClient) {
  const { request } = client

  return {
    getMe(): Promise<User> {
      return request<User>("/auth/me")
    },
  }
}
