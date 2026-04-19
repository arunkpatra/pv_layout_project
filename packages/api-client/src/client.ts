import type { ApiResponse } from "@renewable-energy/shared"

export type TokenGetter = () => Promise<string | null>

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export type ApiClient = ReturnType<typeof createApiClient>

export function createApiClient(baseUrl: string, getToken: TokenGetter) {
  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = await getToken()
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }

    let response: Response
    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: { ...headers, ...(options.headers as Record<string, string>) },
      })
    } catch (err: unknown) {
      throw new ApiError(
        "NETWORK_ERROR",
        err instanceof Error ? err.message : "Network request failed",
      )
    }

    let json: ApiResponse<T>
    try {
      json = (await response.json()) as ApiResponse<T>
    } catch {
      throw new ApiError(
        "PARSE_ERROR",
        `Server returned non-JSON response (HTTP ${response.status})`,
      )
    }

    if (!response.ok || !json.success) {
      const code = json.success === false ? json.error.code : "HTTP_ERROR"
      const message =
        json.success === false
          ? json.error.message
          : `Request failed with status ${response.status}`
      throw new ApiError(code, message)
    }

    return json.data
  }

  async function upload<T>(path: string, formData: FormData): Promise<T> {
    const token = await getToken()
    const headers: Record<string, string> = {}
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }

    let response: Response
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers,
        body: formData,
      })
    } catch (err: unknown) {
      throw new ApiError(
        "NETWORK_ERROR",
        err instanceof Error ? err.message : "Network request failed",
      )
    }

    let json: ApiResponse<T>
    try {
      json = (await response.json()) as ApiResponse<T>
    } catch {
      throw new ApiError(
        "PARSE_ERROR",
        `Server returned non-JSON response (HTTP ${response.status})`,
      )
    }

    if (!response.ok || !json.success) {
      const code = json.success === false ? json.error.code : "HTTP_ERROR"
      const message =
        json.success === false
          ? json.error.message
          : `Request failed with status ${response.status}`
      throw new ApiError(code, message)
    }

    return json.data
  }

  return { request, upload }
}
