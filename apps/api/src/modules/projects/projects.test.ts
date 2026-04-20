import { describe, test, expect, mock, beforeEach } from "bun:test"

// ─── Mock layout-engine and sqs ───────────────────────────────────────────────

const mockDispatchLayoutJobHttp = mock(() => undefined)
const mockPublishLayoutJob = mock(() => Promise.resolve())

mock.module("../../lib/layout-engine.js", () => ({
  dispatchLayoutJobHttp: mockDispatchLayoutJobHttp,
}))

mock.module("../../lib/sqs.js", () => ({
  publishLayoutJob: mockPublishLayoutJob,
}))

// ─── Mock db ───────────────────────────────────────────────────────────────────

const now = new Date("2026-04-19T00:00:00.000Z")

const mockDbProject = {
  id: "prj_testProject00000000000000000000000000",
  userId: "usr_testUser000000000000000000000000000000",
  name: "Test Project",
  createdAt: now,
  updatedAt: now,
}

const mockDbVersion = {
  id: "ver_testVersion0000000000000000000000000",
  projectId: mockDbProject.id,
  number: 1,
  label: null,
  status: "QUEUED" as const,
  kmzS3Key: null,
  inputSnapshot: { tablePower: 540 },
  layoutJob: null,
  energyJob: null,
  createdAt: now,
  updatedAt: now,
}

// findMany returns ProjectSummary-shaped rows (with _count and versions)
const mockProjectFindMany = mock(() =>
  Promise.resolve([
    {
      ...mockDbProject,
      _count: { versions: 2 },
      versions: [{ status: "COMPLETE" }],
    },
  ]),
)
const mockProjectFindUnique = mock(() => Promise.resolve(mockDbProject))
const mockProjectCreate = mock(() => Promise.resolve(mockDbProject))
const mockProjectDelete = mock(() => Promise.resolve(mockDbProject))
const mockProjectCount = mock(() => Promise.resolve(1))

const mockVersionFindUnique = mock(() =>
  Promise.resolve({
    ...mockDbVersion,
    project: { userId: mockDbProject.userId },
    layoutJob: null,
    energyJob: null,
  }),
)
const mockVersionCreate = mock(() => Promise.resolve(mockDbVersion))
const mockVersionUpdate = mock(() => Promise.resolve(mockDbVersion))
const mockVersionCount = mock(() => Promise.resolve(0))
const mockVersionFindMany = mock(() =>
  Promise.resolve([
    {
      ...mockDbVersion,
      layoutJob: null,
      energyJob: null,
    },
  ]),
)

const mockLayoutJobCreate = mock(() =>
  Promise.resolve({
    id: "ljo_testLayoutJob000000000000000000000000",
    versionId: mockDbVersion.id,
    status: "QUEUED" as const,
    kmzArtifactS3Key: null,
    svgArtifactS3Key: null,
    dxfArtifactS3Key: null,
    statsJson: null,
    errorDetail: null,
    startedAt: null,
    completedAt: null,
  }),
)

const mockEnergyJobCreate = mock(() =>
  Promise.resolve({
    id: "ejo_testEnergyJob000000000000000000000000",
    versionId: mockDbVersion.id,
    status: "QUEUED" as const,
    pdfArtifactS3Key: null,
    statsJson: null,
    irradianceSource: null,
    errorDetail: null,
    startedAt: null,
    completedAt: null,
  }),
)

// $transaction resolves all passed PrismaPromises in order
const mockDbTransaction = mock((queries: unknown[]) =>
  Promise.all(queries as Promise<unknown>[]),
)

mock.module("../../lib/db.js", () => ({
  db: {
    $transaction: mockDbTransaction,
    project: {
      findUnique: mockProjectFindUnique,
      findMany: mockProjectFindMany,
      create: mockProjectCreate,
      delete: mockProjectDelete,
      count: mockProjectCount,
    },
    version: {
      findUnique: mockVersionFindUnique,
      findMany: mockVersionFindMany,
      create: mockVersionCreate,
      count: mockVersionCount,
      update: mockVersionUpdate,
    },
    layoutJob: {
      create: mockLayoutJobCreate,
    },
    energyJob: {
      create: mockEnergyJobCreate,
    },
  },
}))

mock.module("../../lib/s3.js", () => ({
  uploadToS3: mock(() => Promise.resolve()),
  getPresignedUrl: mock(() => Promise.resolve(null)),
}))

import {
  listProjects,
  getProject,
  createProject,
  deleteProject,
  createVersion,
  getVersion,
  listVersions,
} from "./projects.service.js"
import { NotFoundError, ForbiddenError } from "../../lib/errors.js"

// ─── listProjects ──────────────────────────────────────────────────────────────

describe("listProjects", () => {
  beforeEach(() => {
    mockProjectFindMany.mockClear()
    mockProjectCount.mockClear()
    mockDbTransaction.mockClear()
  })

  test("returns PaginatedResponse with items and pagination meta", async () => {
    mockDbTransaction.mockImplementationOnce(() =>
      Promise.resolve([
        1,
        [
          {
            ...mockDbProject,
            _count: { versions: 2 },
            versions: [{ status: "COMPLETE" }],
          },
        ],
      ]),
    )
    const result = await listProjects(mockDbProject.userId)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.id).toBe(mockDbProject.id)
    expect(result.items[0]!.name).toBe(mockDbProject.name)
    expect(result.items[0]!.versionCount).toBe(2)
    expect(result.items[0]!.latestVersionStatus).toBe("COMPLETE")
    expect(result.total).toBe(1)
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(20)
    expect(result.totalPages).toBe(1)
  })

  test("returns null latestVersionStatus when project has no versions", async () => {
    mockDbTransaction.mockImplementationOnce(() =>
      Promise.resolve([
        1,
        [{ ...mockDbProject, _count: { versions: 0 }, versions: [] }],
      ]),
    )
    const result = await listProjects(mockDbProject.userId)
    expect(result.items[0]!.latestVersionStatus).toBeNull()
    expect(result.items[0]!.versionCount).toBe(0)
  })

  test("returns correct pagination meta for page 2 pageSize 5", async () => {
    mockDbTransaction.mockImplementationOnce(() =>
      Promise.resolve([
        11,
        [{ ...mockDbProject, _count: { versions: 0 }, versions: [] }],
      ]),
    )
    const result = await listProjects(mockDbProject.userId, { page: 2, pageSize: 5 })
    expect(mockDbTransaction).toHaveBeenCalledTimes(1)
    expect(result.page).toBe(2)
    expect(result.pageSize).toBe(5)
    expect(result.totalPages).toBe(3) // ceil(11/5)
  })
})

// ─── listVersions ──────────────────────────────────────────────────────────────

describe("listVersions", () => {
  beforeEach(() => {
    mockProjectFindUnique.mockClear()
    mockVersionFindMany.mockClear()
    mockDbTransaction.mockClear()
  })

  test("returns PaginatedResponse for a project's versions", async () => {
    // Override $transaction to return count=1 + versions array
    mockDbTransaction.mockImplementationOnce(() =>
      Promise.resolve([1, [{ ...mockDbVersion, layoutJob: null, energyJob: null }]]),
    )
    const result = await listVersions(mockDbProject.id, mockDbProject.userId)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.id).toBe(mockDbVersion.id)
    expect(result.total).toBe(1)
    expect(result.page).toBe(1)
    expect(result.totalPages).toBe(1)
  })

  test("throws NotFoundError when project does not exist", async () => {
    mockProjectFindUnique.mockImplementationOnce(() => Promise.resolve(null as any))
    await expect(
      listVersions("prj_nonexistent", mockDbProject.userId),
    ).rejects.toThrow(NotFoundError)
  })

  test("throws ForbiddenError when project belongs to another user", async () => {
    mockProjectFindUnique.mockImplementationOnce(() =>
      Promise.resolve({
        ...mockDbProject,
        userId: "usr_other00000000000000000000000000000000",
      } as any),
    )
    await expect(
      listVersions(mockDbProject.id, mockDbProject.userId),
    ).rejects.toThrow(ForbiddenError)
  })
})

// ─── getProject ────────────────────────────────────────────────────────────────

describe("getProject", () => {
  beforeEach(() => mockProjectFindUnique.mockClear())

  test("returns project when found and owned by user", async () => {
    const result = await getProject(mockDbProject.id, mockDbProject.userId)
    expect(result.id).toBe(mockDbProject.id)
    expect(result.name).toBe(mockDbProject.name)
  })

  test("throws NotFoundError when project does not exist", async () => {
    mockProjectFindUnique.mockImplementationOnce(() => Promise.resolve(null as any))
    await expect(getProject("prj_nonexistent", mockDbProject.userId)).rejects.toThrow(
      NotFoundError,
    )
  })

  test("throws ForbiddenError when project belongs to another user", async () => {
    mockProjectFindUnique.mockImplementationOnce(() =>
      Promise.resolve({ ...mockDbProject, userId: "usr_other00000000000000000000000000000000" } as any),
    )
    await expect(getProject(mockDbProject.id, mockDbProject.userId)).rejects.toThrow(
      ForbiddenError,
    )
  })
})

// ─── createProject ─────────────────────────────────────────────────────────────

describe("createProject", () => {
  beforeEach(() => mockProjectCreate.mockClear())

  test("creates and returns a project", async () => {
    const result = await createProject(mockDbProject.userId, { name: "Test Project" })
    expect(result.name).toBe(mockDbProject.name)
    expect(result.userId).toBe(mockDbProject.userId)
  })

  test("calls db.project.create with correct data", async () => {
    await createProject(mockDbProject.userId, { name: "New Project" })
    expect(mockProjectCreate).toHaveBeenCalledWith({
      data: { userId: mockDbProject.userId, name: "New Project" },
    })
  })
})

// ─── deleteProject ─────────────────────────────────────────────────────────────

describe("deleteProject", () => {
  beforeEach(() => {
    mockProjectFindUnique.mockClear()
    mockProjectDelete.mockClear()
  })

  test("deletes the project when owned by user", async () => {
    await deleteProject(mockDbProject.id, mockDbProject.userId)
    expect(mockProjectDelete).toHaveBeenCalledWith({
      where: { id: mockDbProject.id },
    })
  })

  test("throws ForbiddenError when project belongs to another user", async () => {
    mockProjectFindUnique.mockImplementationOnce(() =>
      Promise.resolve({ ...mockDbProject, userId: "usr_other00000000000000000000000000000000" } as any),
    )
    await expect(deleteProject(mockDbProject.id, mockDbProject.userId)).rejects.toThrow(
      ForbiddenError,
    )
  })
})

// ─── createVersion ─────────────────────────────────────────────────────────────

describe("createVersion", () => {
  beforeEach(() => {
    mockProjectFindUnique.mockClear()
    mockVersionCreate.mockClear()
    mockVersionCount.mockClear()
    mockLayoutJobCreate.mockClear()
    mockEnergyJobCreate.mockClear()
  })

  test("creates a version with number = count + 1", async () => {
    mockVersionCount.mockImplementationOnce(() => Promise.resolve(2))
    await createVersion(mockDbProject.userId, {
      projectId: mockDbProject.id,
      inputSnapshot: { tablePower: 540 },
    })
    expect(mockVersionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ number: 3, projectId: mockDbProject.id }),
      }),
    )
  })

  test("throws ForbiddenError when project belongs to another user", async () => {
    mockProjectFindUnique.mockImplementationOnce(() =>
      Promise.resolve({ ...mockDbProject, userId: "usr_other00000000000000000000000000000000" } as any),
    )
    await expect(
      createVersion(mockDbProject.userId, {
        projectId: mockDbProject.id,
        inputSnapshot: {},
      }),
    ).rejects.toThrow(ForbiddenError)
  })
})

// ─── getVersion ────────────────────────────────────────────────────────────────

describe("getVersion", () => {
  beforeEach(() => {
    mockProjectFindUnique.mockClear()
    mockVersionFindUnique.mockClear()
  })

  test("returns version detail when owned by user", async () => {
    const result = await getVersion(mockDbVersion.id, mockDbProject.userId)
    expect(result.id).toBe(mockDbVersion.id)
    expect(result.status).toBe("QUEUED")
    expect(result.layoutJob).toBeNull()
    expect(result.energyJob).toBeNull()
  })

  test("throws NotFoundError when version does not exist", async () => {
    mockVersionFindUnique.mockImplementationOnce(() => Promise.resolve(null as any))
    await expect(getVersion("ver_nonexistent", mockDbProject.userId)).rejects.toThrow(
      NotFoundError,
    )
  })

  test("throws ForbiddenError when version project belongs to another user", async () => {
    mockVersionFindUnique.mockImplementationOnce(() =>
      Promise.resolve({
        ...mockDbVersion,
        project: { userId: "usr_other00000000000000000000000000000000" },
      } as any),
    )
    mockProjectFindUnique.mockImplementationOnce(() =>
      Promise.resolve({ ...mockDbProject, userId: "usr_other00000000000000000000000000000000" } as any),
    )
    await expect(getVersion(mockDbVersion.id, mockDbProject.userId)).rejects.toThrow(
      ForbiddenError,
    )
  })
})

// ─── createVersion dispatch ────────────────────────────────────────────────────

describe("createVersion dispatch", () => {
  beforeEach(() => {
    mockDispatchLayoutJobHttp.mockClear()
    mockPublishLayoutJob.mockClear()
    mockProjectFindUnique.mockReset()
    mockProjectFindUnique.mockImplementation(() => Promise.resolve(mockDbProject))
    mockVersionCreate.mockClear()
    mockVersionUpdate.mockClear()
    mockVersionCount.mockClear()
    mockLayoutJobCreate.mockClear()
    mockEnergyJobCreate.mockClear()
  })

  test("calls dispatchLayoutJobHttp when USE_LOCAL_ENV is 'true'", async () => {
    const prev = process.env.USE_LOCAL_ENV
    process.env.USE_LOCAL_ENV = "true"
    try {
      await createVersion(mockDbProject.userId, {
        projectId: mockDbProject.id,
        inputSnapshot: {},
      })
    } finally {
      if (prev !== undefined) process.env.USE_LOCAL_ENV = prev
      else delete process.env.USE_LOCAL_ENV
    }
    expect(mockDispatchLayoutJobHttp).toHaveBeenCalledTimes(1)
    expect(mockDispatchLayoutJobHttp).toHaveBeenCalledWith(mockDbVersion.id)
    expect(mockPublishLayoutJob).not.toHaveBeenCalled()
  })

  test("calls publishLayoutJob when USE_LOCAL_ENV is not 'true'", async () => {
    const prev = process.env.USE_LOCAL_ENV
    delete process.env.USE_LOCAL_ENV
    try {
      await createVersion(mockDbProject.userId, {
        projectId: mockDbProject.id,
        inputSnapshot: {},
      })
    } finally {
      if (prev !== undefined) process.env.USE_LOCAL_ENV = prev
    }
    expect(mockPublishLayoutJob).toHaveBeenCalledTimes(1)
    expect(mockPublishLayoutJob).toHaveBeenCalledWith(mockDbVersion.id)
    expect(mockDispatchLayoutJobHttp).not.toHaveBeenCalled()
  })

  test("createVersion resolves successfully even when publishLayoutJob rejects", async () => {
    mockPublishLayoutJob.mockRejectedValueOnce(new Error("SQS down"))
    const prev = process.env.USE_LOCAL_ENV
    delete process.env.USE_LOCAL_ENV
    try {
      const result = await createVersion(mockDbProject.userId, {
        projectId: mockDbProject.id,
        inputSnapshot: {},
      })
      expect(result).toBeDefined()
    } finally {
      if (prev !== undefined) process.env.USE_LOCAL_ENV = prev
    }
  })

  test("createVersion resolves successfully even when dispatchLayoutJobHttp errors internally", async () => {
    mockDispatchLayoutJobHttp.mockImplementationOnce(() => {
      throw new Error("fetch failed")
    })
    const prev = process.env.USE_LOCAL_ENV
    process.env.USE_LOCAL_ENV = "true"
    try {
      const result = await createVersion(mockDbProject.userId, {
        projectId: mockDbProject.id,
        inputSnapshot: {},
      })
      expect(result).toBeDefined()
    } finally {
      if (prev !== undefined) process.env.USE_LOCAL_ENV = prev
      else delete process.env.USE_LOCAL_ENV
    }
  })
})
