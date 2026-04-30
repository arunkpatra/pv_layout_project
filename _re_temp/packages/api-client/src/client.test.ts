import { describe, test, expect, mock, beforeEach } from "bun:test"
import { createApiClient, ApiError } from "./client.js"

const mockFetch = mock(() => Promise.resolve(new Response()))
global.fetch = mockFetch as unknown as typeof fetch

function makeSuccessResponse<T>(data: T, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function makeErrorResponse(code: string, message: string, status = 400) {
  return new Response(JSON.stringify({ success: false, error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("createApiClient", () => {
  const getToken = () => Promise.resolve("test-token")
  const client = createApiClient("http://localhost:3001", getToken)

  beforeEach(() => mockFetch.mockClear())

  test("attaches Authorization header when token is present", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve(makeSuccessResponse({ id: "usr_123" }))
    )
    await client.request("/auth/me")
    const [_url, init] = mockFetch.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer test-token"
    )
  })

  test("omits Authorization header when token is null", async () => {
    const noTokenClient = createApiClient("http://localhost:3001", () =>
      Promise.resolve(null)
    )
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve(makeSuccessResponse({ ok: true }))
    )
    await noTokenClient.request("/health")
    const [_url, init] = mockFetch.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>)["Authorization"]).toBeUndefined()
  })

  test("prefixes path with baseUrl", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve(makeSuccessResponse({ ok: true }))
    )
    await client.request("/health")
    const [url] = mockFetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("http://localhost:3001/health")
  })

  test("returns data on success response", async () => {
    const payload = { id: "usr_abc", name: "Test" }
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve(makeSuccessResponse(payload))
    )
    const result = await client.request<typeof payload>("/auth/me")
    expect(result).toEqual(payload)
  })

  test("throws ApiError with server code and message on API error response", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve(makeErrorResponse("NOT_FOUND", "User not found", 404))
    )
    let caught: unknown
    try {
      await client.request("/auth/me")
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as ApiError).code).toBe("NOT_FOUND")
    expect((caught as ApiError).message).toBe("User not found")
  })

  test("throws ApiError with HTTP_ERROR code and status message when response is not ok", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: true, data: {} }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      )
    )
    let caught: unknown
    try {
      await client.request("/auth/me")
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(ApiError)
    expect((caught as ApiError).code).toBe("HTTP_ERROR")
    expect((caught as ApiError).message).toBe("Request failed with status 500")
  })

  test("throws ApiError with NETWORK_ERROR on fetch failure", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.reject(new Error("Connection refused"))
    )
    try {
      await client.request("/auth/me")
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).code).toBe("NETWORK_ERROR")
      expect((err as ApiError).message).toBe("Connection refused")
    }
  })

  test("throws ApiError with PARSE_ERROR on non-JSON response", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve(new Response("not json", { status: 200 }))
    )
    try {
      await client.request("/auth/me")
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).code).toBe("PARSE_ERROR")
    }
  })
})

describe("createWebClient", () => {
  beforeEach(() => mockFetch.mockClear())

  test("exposes getMe method", async () => {
    const { createWebClient } = await import("./identity.js")
    const client = createApiClient("http://localhost:3001", () =>
      Promise.resolve("tok")
    )
    const api = createWebClient(client)
    expect(typeof api.getMe).toBe("function")
  })

  test("getMe calls GET /auth/me", async () => {
    const { createWebClient } = await import("./identity.js")
    const user = {
      id: "usr_abc",
      clerkId: "clerk_123",
      email: "a@b.com",
      name: "Test",
      avatarUrl: null,
      status: "ACTIVE" as const,
      createdAt: "2026-04-19T00:00:00.000Z",
      updatedAt: "2026-04-19T00:00:00.000Z",
    }
    mockFetch.mockImplementationOnce(() => Promise.resolve(makeSuccessResponse(user)))
    const client = createApiClient("http://localhost:3001", () =>
      Promise.resolve("tok")
    )
    const api = createWebClient(client)
    const result = await api.getMe()
    const [url] = mockFetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("http://localhost:3001/auth/me")
    expect(result.id).toBe(user.id)
  })
})
