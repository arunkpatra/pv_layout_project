/**
 * Tests for the F6 S3 upload helpers.
 *
 *   sha256Hex                — pure crypto-Subtle hash; sanity check.
 *   putToS3                  — generic presigned PUT; status-code mapping.
 *   uploadKmzToS3            — orchestrator (hash → mint → PUT).
 *   uploadRunResultToS3      — orchestrator for per-run blobs.
 *
 * The S3 PUT is exercised against a fake `fetchImpl` so we never hit a
 * real bucket. Status mapping is the load-bearing assertion: every
 * branch the desktop UI maps a message to (EXPIRED_URL → re-request,
 * CONTENT_MISMATCH → bug, TRANSIENT → retry, NETWORK → connection).
 */
import { describe, it, expect, vi } from "vitest"
import type { EntitlementsClient } from "@solarlayout/entitlements-client"
import {
  S3UploadError,
  S3DownloadError,
  putToS3,
  downloadKmzFromS3,
  sha256Hex,
  uploadKmzToS3,
  uploadRunResultToS3,
} from "./s3upload"

function jsonResponse(status = 200): Response {
  // Body content doesn't matter — putToS3 ignores S3's text/XML bodies.
  return new Response("", { status })
}

function makeClient(
  overrides: Partial<EntitlementsClient> = {}
): EntitlementsClient {
  return {
    baseUrl: "http://localhost:3003",
    getEntitlements: vi.fn(),
    reportUsage: vi.fn(),
    getEntitlementsV2: vi.fn(),
    reportUsageV2: vi.fn(),
    getKmzUploadUrl: vi.fn(),
    getRunResultUploadUrl: vi.fn(),
    createProjectV2: vi.fn(),
    getProjectV2: vi.fn(),
    createRunV2: vi.fn(),
    patchProjectV2: vi.fn(),
    deleteProjectV2: vi.fn(),
    listProjectsV2: vi.fn(),
    getRunV2: vi.fn(),
    deleteRunV2: vi.fn(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// sha256Hex
// ---------------------------------------------------------------------------

describe("sha256Hex", () => {
  it("returns the canonical 64-char lowercase hex digest", async () => {
    // Verified against `printf 'abc' | sha256sum`.
    const expected =
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    const bytes = new TextEncoder().encode("abc")
    expect(await sha256Hex(bytes)).toBe(expected)
  })

  it("hashes an empty input to the well-known empty-sha256 digest", async () => {
    const expected =
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    expect(await sha256Hex(new Uint8Array(0))).toBe(expected)
  })

  it("accepts ArrayBuffer as well as Uint8Array", async () => {
    const buf = new TextEncoder().encode("abc").buffer
    expect(await sha256Hex(buf)).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    )
  })
})

// ---------------------------------------------------------------------------
// putToS3
// ---------------------------------------------------------------------------

describe("putToS3", () => {
  const SAMPLE_URL =
    "https://solarlayout-local-projects.s3.ap-south-1.amazonaws.com/projects/usr_x/kmz/abc.kmz?X-Amz-Signature=..."

  it("PUTs with Content-Type + Content-Length and returns void on 200", async () => {
    let seenInit: RequestInit | undefined
    let seenUrl = ""
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      seenUrl = input.toString()
      seenInit = init
      return jsonResponse(200)
    })
    const bytes = new Uint8Array([0xab, 0xcd])
    await putToS3({
      url: SAMPLE_URL,
      bytes,
      contentType: "application/vnd.google-earth.kmz",
      contentLength: bytes.byteLength,
      fetchImpl,
    })
    expect(seenUrl).toBe(SAMPLE_URL)
    expect(seenInit?.method).toBe("PUT")
    const headers = seenInit?.headers as Record<string, string>
    expect(headers["Content-Type"]).toBe("application/vnd.google-earth.kmz")
    expect(headers["Content-Length"]).toBe("2")
    expect(seenInit?.body).toBe(bytes)
  })

  it("maps 403 to EXPIRED_URL (re-request a fresh URL)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(403))
    try {
      await putToS3({
        url: SAMPLE_URL,
        bytes: new Uint8Array(0),
        contentType: "application/json",
        contentLength: 0,
        fetchImpl,
      })
      throw new Error("expected throw")
    } catch (err) {
      expect(err).toBeInstanceOf(S3UploadError)
      const e = err as S3UploadError
      expect(e.kind).toBe("EXPIRED_URL")
      expect(e.status).toBe(403)
    }
  })

  it("maps 400 to CONTENT_MISMATCH (signed length / digest didn't match)", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(400))
    try {
      await putToS3({
        url: SAMPLE_URL,
        bytes: new Uint8Array(0),
        contentType: "application/json",
        contentLength: 0,
        fetchImpl,
      })
      throw new Error("expected throw")
    } catch (err) {
      const e = err as S3UploadError
      expect(e.kind).toBe("CONTENT_MISMATCH")
      expect(e.status).toBe(400)
    }
  })

  it("maps 412 to CONTENT_MISMATCH", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(412))
    try {
      await putToS3({
        url: SAMPLE_URL,
        bytes: new Uint8Array(0),
        contentType: "application/json",
        contentLength: 0,
        fetchImpl,
      })
      throw new Error("expected throw")
    } catch (err) {
      expect((err as S3UploadError).kind).toBe("CONTENT_MISMATCH")
    }
  })

  it("maps 500/502/503/504 to TRANSIENT", async () => {
    for (const status of [500, 502, 503, 504]) {
      const fetchImpl = vi.fn(async () => jsonResponse(status))
      try {
        await putToS3({
          url: SAMPLE_URL,
          bytes: new Uint8Array(0),
          contentType: "application/json",
          contentLength: 0,
          fetchImpl,
        })
        throw new Error("expected throw")
      } catch (err) {
        const e = err as S3UploadError
        expect(e.kind).toBe("TRANSIENT")
        expect(e.status).toBe(status)
      }
    }
  })

  it("maps a thrown error in fetch to NETWORK with status=0", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch")
    })
    try {
      await putToS3({
        url: SAMPLE_URL,
        bytes: new Uint8Array(0),
        contentType: "application/json",
        contentLength: 0,
        fetchImpl,
      })
      throw new Error("expected throw")
    } catch (err) {
      const e = err as S3UploadError
      expect(e.kind).toBe("NETWORK")
      expect(e.status).toBe(0)
      expect(e.message).toBe("Failed to fetch")
    }
  })

  it("maps an unexpected status (e.g. 418) to UNEXPECTED", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(418))
    try {
      await putToS3({
        url: SAMPLE_URL,
        bytes: new Uint8Array(0),
        contentType: "application/json",
        contentLength: 0,
        fetchImpl,
      })
      throw new Error("expected throw")
    } catch (err) {
      const e = err as S3UploadError
      expect(e.kind).toBe("UNEXPECTED")
      expect(e.status).toBe(418)
    }
  })
})

// ---------------------------------------------------------------------------
// uploadKmzToS3
// ---------------------------------------------------------------------------

describe("uploadKmzToS3", () => {
  const KEY = "sl_live_test"
  const KMZ_BYTES = new TextEncoder().encode("PK\x03\x04faux-kmz-bytes")
  const EXPECTED_SHA =
    // computed once; re-asserts the helper's hashing path.
    null as unknown as string // resolved at runtime in the test below

  it("hashes the bytes, mints a B6 URL with the hash + size, then PUTs", async () => {
    void EXPECTED_SHA
    const sha = await sha256Hex(KMZ_BYTES)

    const getKmzUploadUrl = vi.fn().mockResolvedValue({
      uploadUrl:
        "https://solarlayout-local-projects.s3.ap-south-1.amazonaws.com/projects/usr_x/kmz/abc.kmz?signed",
      blobUrl: `s3://solarlayout-local-projects/projects/usr_x/kmz/${sha}.kmz`,
      expiresAt: "2026-04-30T12:15:00.000Z",
    })
    const client = makeClient({ getKmzUploadUrl })

    let putCallCount = 0
    let putContentType = ""
    let putContentLength = ""
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      putCallCount += 1
      const h = init?.headers as Record<string, string>
      putContentType = h["Content-Type"] ?? ""
      putContentLength = h["Content-Length"] ?? ""
      return jsonResponse(200)
    })

    const result = await uploadKmzToS3({
      client,
      licenseKey: KEY,
      bytes: KMZ_BYTES,
      fetchImpl,
    })

    expect(getKmzUploadUrl).toHaveBeenCalledWith(
      KEY,
      sha,
      KMZ_BYTES.byteLength
    )
    expect(putCallCount).toBe(1)
    expect(putContentType).toBe("application/vnd.google-earth.kmz")
    expect(putContentLength).toBe(String(KMZ_BYTES.byteLength))
    expect(result).toEqual({
      blobUrl: `s3://solarlayout-local-projects/projects/usr_x/kmz/${sha}.kmz`,
      kmzSha256: sha,
      size: KMZ_BYTES.byteLength,
    })
  })

  it("propagates an EntitlementsError from the URL-mint step (e.g. 503)", async () => {
    const getKmzUploadUrl = vi
      .fn()
      .mockRejectedValue(new Error("S3 not configured"))
    const client = makeClient({ getKmzUploadUrl })
    const fetchImpl = vi.fn(async () => jsonResponse(200))
    await expect(
      uploadKmzToS3({ client, licenseKey: KEY, bytes: KMZ_BYTES, fetchImpl })
    ).rejects.toThrow("S3 not configured")
    expect(fetchImpl).not.toHaveBeenCalled() // PUT never attempted.
  })

  it("propagates an S3UploadError from the PUT step", async () => {
    const getKmzUploadUrl = vi.fn().mockResolvedValue({
      uploadUrl: "https://x/y",
      blobUrl: "s3://x/y",
      expiresAt: "2026-04-30T12:00:00.000Z",
    })
    const client = makeClient({ getKmzUploadUrl })
    const fetchImpl = vi.fn(async () => jsonResponse(403))
    try {
      await uploadKmzToS3({
        client,
        licenseKey: KEY,
        bytes: KMZ_BYTES,
        fetchImpl,
      })
      throw new Error("expected throw")
    } catch (err) {
      const e = err as S3UploadError
      expect(e.kind).toBe("EXPIRED_URL")
    }
  })
})

// ---------------------------------------------------------------------------
// uploadRunResultToS3
// ---------------------------------------------------------------------------

describe("uploadRunResultToS3", () => {
  const KEY = "sl_live_test"

  it("PUTs a layout JSON with application/json Content-Type at the right byte length", async () => {
    const layoutJson = new TextEncoder().encode(JSON.stringify({ tables: [] }))

    const getRunResultUploadUrl = vi.fn().mockResolvedValue({
      uploadUrl: "https://x/y",
      blobUrl:
        "s3://solarlayout-local-projects/projects/usr_x/prj_y/runs/run_z/layout.json",
      expiresAt: "2026-04-30T12:00:00.000Z",
    })
    const client = makeClient({ getRunResultUploadUrl })

    let putContentType = ""
    let putBody: BodyInit | undefined
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const h = init?.headers as Record<string, string>
      putContentType = h["Content-Type"] ?? ""
      putBody = init?.body as BodyInit
      return jsonResponse(200)
    })

    const result = await uploadRunResultToS3({
      client,
      licenseKey: KEY,
      type: "layout",
      projectId: "prj_y",
      runId: "run_z",
      bytes: layoutJson,
      fetchImpl,
    })
    expect(getRunResultUploadUrl).toHaveBeenCalledWith(KEY, {
      type: "layout",
      projectId: "prj_y",
      runId: "run_z",
      size: layoutJson.byteLength,
    })
    expect(putContentType).toBe("application/json")
    expect(putBody).toBe(layoutJson)
    expect(result.blobUrl).toContain("layout.json")
    expect(result.size).toBe(layoutJson.byteLength)
  })

  it("uses the per-type Content-Type for DXF / PDF / KMZ exports", async () => {
    const cases: Array<{
      type: "dxf" | "pdf" | "kmz"
      contentType: string
    }> = [
      { type: "dxf", contentType: "application/dxf" },
      { type: "pdf", contentType: "application/pdf" },
      { type: "kmz", contentType: "application/vnd.google-earth.kmz" },
    ]
    for (const c of cases) {
      const getRunResultUploadUrl = vi.fn().mockResolvedValue({
        uploadUrl: "https://x/y",
        blobUrl: `s3://b/k.${c.type}`,
        expiresAt: "2026-04-30T12:00:00.000Z",
      })
      const client = makeClient({ getRunResultUploadUrl })
      let putContentType = ""
      const fetchImpl = vi.fn(
        async (_url: RequestInfo | URL, init?: RequestInit) => {
          const h = init?.headers as Record<string, string>
          putContentType = h["Content-Type"] ?? ""
          return jsonResponse(200)
        }
      )
      await uploadRunResultToS3({
        client,
        licenseKey: KEY,
        type: c.type,
        projectId: "prj_y",
        runId: "run_z",
        bytes: new Uint8Array([1, 2, 3]),
        fetchImpl,
      })
      expect(putContentType).toBe(c.contentType)
    }
  })

  it("accepts a Blob and reports its size for the upload-URL request", async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], {
      type: "application/dxf",
    })
    const getRunResultUploadUrl = vi.fn().mockResolvedValue({
      uploadUrl: "https://x/y",
      blobUrl: "s3://b/k.dxf",
      expiresAt: "2026-04-30T12:00:00.000Z",
    })
    const client = makeClient({ getRunResultUploadUrl })
    const fetchImpl = vi.fn(async () => jsonResponse(200))
    await uploadRunResultToS3({
      client,
      licenseKey: KEY,
      type: "dxf",
      projectId: "prj_y",
      runId: "run_z",
      bytes: blob,
      fetchImpl,
    })
    const callArgs = getRunResultUploadUrl.mock.calls[0]![1] as {
      size: number
    }
    expect(callArgs.size).toBe(4)
  })

  it("propagates a 404 NOT_FOUND from the URL-mint step (bad runId)", async () => {
    const getRunResultUploadUrl = vi
      .fn()
      .mockRejectedValue(new Error("Run not found"))
    const client = makeClient({ getRunResultUploadUrl })
    const fetchImpl = vi.fn(async () => jsonResponse(200))
    await expect(
      uploadRunResultToS3({
        client,
        licenseKey: KEY,
        type: "dxf",
        projectId: "prj_x",
        runId: "run_missing",
        bytes: new Uint8Array(0),
        fetchImpl,
      })
    ).rejects.toThrow("Run not found")
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// downloadKmzFromS3 — P2 (open-existing-project flow)
// ---------------------------------------------------------------------------

describe("downloadKmzFromS3", () => {
  const PRESIGNED =
    "https://solarlayout-local-projects.s3.ap-south-1.amazonaws.com/projects/u/kmz/abc.kmz?X-Amz-Signature=stub"

  it("GETs the presigned URL and returns the bytes as a Uint8Array", async () => {
    const payload = new Uint8Array([0x50, 0x4b, 0x03, 0x04]) // PK header
    let seenUrl = ""
    let seenMethod = ""
    const fetchImpl = vi.fn(async (url, init) => {
      seenUrl = String(url)
      seenMethod = init?.method ?? "GET"
      return new Response(payload.slice().buffer, { status: 200 })
    }) as unknown as typeof fetch

    const bytes = await downloadKmzFromS3({ url: PRESIGNED, fetchImpl })

    expect(seenUrl).toBe(PRESIGNED)
    expect(seenMethod).toBe("GET")
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(Array.from(bytes)).toEqual([0x50, 0x4b, 0x03, 0x04])
  })

  it("does NOT send Authorization (presigned URL carries the signature)", async () => {
    let seenAuth: string | null = ""
    const fetchImpl = vi.fn(async (_url, init) => {
      seenAuth = new Headers(init?.headers).get("authorization")
      return new Response(new Uint8Array(0).buffer, { status: 200 })
    }) as unknown as typeof fetch
    await downloadKmzFromS3({ url: PRESIGNED, fetchImpl })
    expect(seenAuth).toBeNull()
  })

  it("maps 403 to S3DownloadError with kind=EXPIRED_URL (re-request from B12)", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("Forbidden", { status: 403 })
    ) as unknown as typeof fetch
    let caught: unknown
    try {
      await downloadKmzFromS3({ url: PRESIGNED, fetchImpl })
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(S3DownloadError)
    const e = caught as S3DownloadError
    expect(e.kind).toBe("EXPIRED_URL")
    expect(e.status).toBe(403)
  })

  it("maps 404 to S3DownloadError with kind=NOT_FOUND", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("Not Found", { status: 404 })
    ) as unknown as typeof fetch
    let caught: unknown
    try {
      await downloadKmzFromS3({ url: PRESIGNED, fetchImpl })
    } catch (err) {
      caught = err
    }
    const e = caught as S3DownloadError
    expect(e.kind).toBe("NOT_FOUND")
    expect(e.status).toBe(404)
  })

  it("maps 5xx to TRANSIENT", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("", { status: 503 })
    ) as unknown as typeof fetch
    let caught: unknown
    try {
      await downloadKmzFromS3({ url: PRESIGNED, fetchImpl })
    } catch (err) {
      caught = err
    }
    const e = caught as S3DownloadError
    expect(e.kind).toBe("TRANSIENT")
    expect(e.status).toBe(503)
  })

  it("maps a thrown fetch (network failure) to NETWORK", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch")
    }) as unknown as typeof fetch
    let caught: unknown
    try {
      await downloadKmzFromS3({ url: PRESIGNED, fetchImpl })
    } catch (err) {
      caught = err
    }
    const e = caught as S3DownloadError
    expect(e.kind).toBe("NETWORK")
    expect(e.status).toBe(0)
  })
})
