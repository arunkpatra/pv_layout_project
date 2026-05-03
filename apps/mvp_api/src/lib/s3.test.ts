import { describe, expect, test, mock, beforeAll } from "bun:test"

/**
 * B5 — getPresignedUploadUrl helper for V2 KMZ + run-result blobs.
 *
 * One happy-path test that locks the (Bucket, Key, ContentType) plumbing.
 * Degraded-mode behaviour (returns null when AWS creds or bucket env var
 * are missing) is structurally identical to getPresignedDownloadUrl and
 * gets exercised in B5's Phase B round-trip against real S3, plus
 * indirectly via consumer mocks in B6 / B7.
 */

const mockGetSignedUrl = mock(
  async (_client: unknown, _command: unknown, _opts: unknown) =>
    "https://s3.example.com/signed-put-url",
)

let lastPutObjectInput: { Bucket?: string; Key?: string; ContentType?: string } =
  {}

mock.module("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mockGetSignedUrl,
}))

mock.module("@aws-sdk/client-s3", () => ({
  S3Client: class FakeS3Client {
    constructor(_config: unknown) {}
  },
  GetObjectCommand: class FakeGetObjectCommand {
    constructor(public input: unknown) {}
  },
  PutObjectCommand: class FakePutObjectCommand {
    public input: { Bucket?: string; Key?: string; ContentType?: string }
    constructor(input: { Bucket?: string; Key?: string; ContentType?: string }) {
      this.input = input
      lastPutObjectInput = input
    }
  },
}))

mock.module("../env.js", () => ({
  env: {
    AWS_ACCESS_KEY_ID: "test-key",
    AWS_SECRET_ACCESS_KEY: "test-secret",
    AWS_REGION: "ap-south-1",
    MVP_S3_PROJECTS_BUCKET: "solarlayout-test-projects",
    MVP_S3_DOWNLOADS_BUCKET: "solarlayout-test-downloads",
  },
}))

describe("getPresignedUploadUrl", () => {
  let getPresignedUploadUrl: (
    key: string,
    contentType: string,
    expiresIn?: number,
  ) => Promise<string | null>

  beforeAll(async () => {
    ;({ getPresignedUploadUrl } = await import("./s3.js"))
  })

  test("signs a PUT against MVP_S3_PROJECTS_BUCKET with the supplied key + Content-Type", async () => {
    mockGetSignedUrl.mockClear()
    lastPutObjectInput = {}

    const url = await getPresignedUploadUrl(
      "projects/usr_x/prj_y/kmz/abc.kmz",
      "application/vnd.google-earth.kmz",
      900,
    )

    expect(url).toBe("https://s3.example.com/signed-put-url")
    expect(lastPutObjectInput.Bucket).toBe("solarlayout-test-projects")
    expect(lastPutObjectInput.Key).toBe("projects/usr_x/prj_y/kmz/abc.kmz")
    expect(lastPutObjectInput.ContentType).toBe(
      "application/vnd.google-earth.kmz",
    )
    expect(mockGetSignedUrl).toHaveBeenCalledTimes(1)
  })

  test("uses the default 900s expiry when none is supplied", async () => {
    mockGetSignedUrl.mockClear()
    await getPresignedUploadUrl("k", "text/plain")
    const callArgs = mockGetSignedUrl.mock.calls[0]
    const opts = callArgs?.[2] as { expiresIn?: number } | undefined
    expect(opts?.expiresIn).toBe(900)
  })
})

describe("parseS3Url", () => {
  let parseS3Url: (url: string) => { bucket: string; key: string }

  beforeAll(async () => {
    ;({ parseS3Url } = await import("./s3.js"))
  })

  test("splits a canonical s3:// URL", () => {
    expect(parseS3Url("s3://my-bucket/path/to/file.kmz")).toEqual({
      bucket: "my-bucket",
      key: "path/to/file.kmz",
    })
  })

  test("preserves slashes in the key", () => {
    expect(parseS3Url("s3://b/projects/usr_x/prj_y/kmz/abc.kmz")).toEqual({
      bucket: "b",
      key: "projects/usr_x/prj_y/kmz/abc.kmz",
    })
  })

  test("throws on malformed url", () => {
    expect(() => parseS3Url("not-an-s3-url")).toThrow(/malformed/)
    expect(() => parseS3Url("https://example.com/x")).toThrow(/malformed/)
    expect(() => parseS3Url("s3://only-bucket")).toThrow(/malformed/)
  })
})
