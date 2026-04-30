import { describe, test, expect, mock, beforeEach } from "bun:test"
import { createApiClient } from "./client.js"
import { createProjectsClient } from "./projects.js"

const mockFetch = mock(() => Promise.resolve(new Response()))
global.fetch = mockFetch as unknown as typeof fetch

function makeSuccessResponse<T>(data: T) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

function makeTestClient() {
  const client = createApiClient("http://localhost:3001", () =>
    Promise.resolve("test-token"),
  )
  return createProjectsClient(client)
}

beforeEach(() => mockFetch.mockClear())

describe("listProjects (paginated)", () => {
  test("calls /projects with no params by default", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve(
        makeSuccessResponse({
          items: [],
          total: 0,
          page: 1,
          pageSize: 20,
          totalPages: 0,
        }),
      ),
    )
    const client = makeTestClient()
    await client.listProjects()
    const [url] = mockFetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("http://localhost:3001/projects")
  })

  test("appends page and pageSize query params when provided", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve(
        makeSuccessResponse({
          items: [],
          total: 0,
          page: 2,
          pageSize: 10,
          totalPages: 0,
        }),
      ),
    )
    const client = makeTestClient()
    await client.listProjects({ page: 2, pageSize: 10 })
    const [url] = mockFetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain("page=2")
    expect(url).toContain("pageSize=10")
  })

  test("returns PaginatedResponse shape", async () => {
    const mockData = {
      items: [
        {
          id: "prj_1",
          name: "Alpha",
          userId: "usr_1",
          versionCount: 3,
          latestVersionStatus: "COMPLETE",
          createdAt: "2026-04-20T00:00:00Z",
          updatedAt: "2026-04-20T00:00:00Z",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    }
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve(makeSuccessResponse(mockData)),
    )
    const client = makeTestClient()
    const result = await client.listProjects()
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.versionCount).toBe(3)
    expect(result.total).toBe(1)
    expect(result.totalPages).toBe(1)
  })
})

describe("listVersions", () => {
  test("calls /projects/:projectId/versions", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve(
        makeSuccessResponse({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
      ),
    )
    const client = makeTestClient()
    await client.listVersions("prj_abc")
    const [url] = mockFetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain("/projects/prj_abc/versions")
  })

  test("appends pagination params when provided", async () => {
    mockFetch.mockImplementationOnce(() =>
      Promise.resolve(
        makeSuccessResponse({ items: [], total: 0, page: 1, pageSize: 5, totalPages: 0 }),
      ),
    )
    const client = makeTestClient()
    await client.listVersions("prj_abc", { page: 1, pageSize: 5 })
    const [url] = mockFetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain("page=1")
    expect(url).toContain("pageSize=5")
  })
})
