/**
 * S3 upload helpers — F6 row.
 *
 *   putToS3(opts)              — generic presigned-URL PUT.
 *   uploadKmzToS3(client, ...) — orchestrator: hash → mint via B6 → PUT.
 *   uploadRunResultToS3(...)   — orchestrator: mint via B7 → PUT.
 *
 * Why a TS helper rather than a Rust Tauri command (the F5/F6 row notes
 * mention `reqwest`): we use `@tauri-apps/plugin-http` from TS, which
 * delegates to the Rust HTTP stack natively (no CORS, no preflight,
 * full streaming). Same transport pattern as F2 (`getEntitlementsV2`)
 * and F3 (`reportUsageV2`). 50 MB max payload (B6 cap) is fine through
 * the WebView; if we ever need chunked-streaming, refactor to a
 * Rust-native `put_to_s3` Tauri command later. The architecture call is
 * documented in the F5 row notes of `docs/PLAN.md`.
 *
 * Backend's S3 PUT failure modes (per the 2026-04-30 handoff) are mapped
 * here so the UI surfaces a meaningful action:
 *
 *   403 SignatureDoesNotMatch / Request expired  →  EXPIRED_URL
 *       (any 403 from the presigned PUT; URL is invalid; re-request)
 *   400 EntityTooSmall / EntityTooLarge / etc.   →  CONTENT_MISMATCH
 *   400 InvalidDigest / IncompleteBody           →  CONTENT_MISMATCH
 *   5xx                                          →  TRANSIENT
 *   anything else                                →  UNEXPECTED
 *
 * S3 returns text/XML error bodies — the helper does NOT parse them; it
 * relies on the HTTP status code only, per the backend's recommendation.
 */
import { fetch as tauriFetch } from "@tauri-apps/plugin-http"
import {
  KMZ_CONTENT_TYPE,
  RUN_RESULT_CONTENT_TYPES,
  type EntitlementsClient,
  type RunResultType,
  type PresignedUploadUrlResult,
} from "@solarlayout/entitlements-client"

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type S3UploadErrorKind =
  | "EXPIRED_URL"
  | "CONTENT_MISMATCH"
  | "TRANSIENT"
  | "NETWORK"
  | "UNEXPECTED"

export class S3UploadError extends Error {
  readonly kind: S3UploadErrorKind
  /** HTTP status from S3, or 0 for a network-layer failure. */
  readonly status: number
  constructor(kind: S3UploadErrorKind, status: number, message: string) {
    super(message)
    this.name = "S3UploadError"
    this.kind = kind
    this.status = status
  }
}

function classify(status: number): S3UploadErrorKind {
  if (status === 403) return "EXPIRED_URL"
  if (status === 400 || status === 412) return "CONTENT_MISMATCH"
  if (status >= 500 && status < 600) return "TRANSIENT"
  return "UNEXPECTED"
}

/**
 * Download-side error kinds. Disjoint from upload kinds because the
 * meaningful failure modes differ — a download has no "content mismatch"
 * (that's a pre-PUT signature concern), but does have a meaningful
 * NOT_FOUND (the blob never made it to S3, vs the URL being expired).
 */
export type S3DownloadErrorKind =
  | "EXPIRED_URL"
  | "NOT_FOUND"
  | "TRANSIENT"
  | "NETWORK"
  | "UNEXPECTED"

export class S3DownloadError extends Error {
  readonly kind: S3DownloadErrorKind
  readonly status: number
  constructor(kind: S3DownloadErrorKind, status: number, message: string) {
    super(message)
    this.name = "S3DownloadError"
    this.kind = kind
    this.status = status
  }
}

function classifyDownload(status: number): S3DownloadErrorKind {
  if (status === 403) return "EXPIRED_URL"
  if (status === 404) return "NOT_FOUND"
  if (status >= 500 && status < 600) return "TRANSIENT"
  return "UNEXPECTED"
}

// ---------------------------------------------------------------------------
// Generic PUT
// ---------------------------------------------------------------------------

export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

const inTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

const defaultFetch = (): FetchLike =>
  inTauri() ? (tauriFetch as FetchLike) : (globalThis.fetch as FetchLike)

export interface PutToS3Options {
  url: string
  bytes: ArrayBuffer | Uint8Array | Blob
  contentType: string
  /**
   * Length in bytes. B6 + B7 sign Content-Length into the URL — must
   * match exactly. B16 doesn't sign it (per the 2026-04-30 handoff) but
   * including it is harmless. Always pass it when known.
   */
  contentLength: number
  /** Test seam — defaults to tauri-plugin-http or globalThis.fetch. */
  fetchImpl?: FetchLike
}

export async function putToS3(opts: PutToS3Options): Promise<void> {
  const fetchImpl = opts.fetchImpl ?? defaultFetch()
  let response: Response
  try {
    response = await fetchImpl(opts.url, {
      method: "PUT",
      headers: {
        "Content-Type": opts.contentType,
        "Content-Length": String(opts.contentLength),
      },
      body:
        opts.bytes instanceof Blob
          ? opts.bytes
          : (opts.bytes as BodyInit),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new S3UploadError("NETWORK", 0, msg)
  }
  if (!response.ok) {
    throw new S3UploadError(
      classify(response.status),
      response.status,
      `S3 PUT failed: HTTP ${response.status}`
    )
  }
}

// ---------------------------------------------------------------------------
// Orchestrators
// ---------------------------------------------------------------------------

/** Lowercase hex sha256 over arbitrary bytes. Uses Web Crypto. */
export async function sha256Hex(
  bytes: ArrayBuffer | Uint8Array
): Promise<string> {
  // crypto.subtle.digest wants a BufferSource. Pass the underlying
  // ArrayBuffer to avoid the SharedArrayBuffer narrowing TS recently
  // tightened on Uint8Array<ArrayBufferLike>.
  const buffer: ArrayBuffer =
    bytes instanceof Uint8Array
      ? (bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        ) as ArrayBuffer)
      : bytes
  const digest = await crypto.subtle.digest("SHA-256", buffer)
  const hex: string[] = []
  for (const b of new Uint8Array(digest)) {
    hex.push(b.toString(16).padStart(2, "0"))
  }
  return hex.join("")
}

export interface UploadKmzResult {
  /** s3://... reference for the uploaded KMZ. Pass to B11 as kmzBlobUrl. */
  blobUrl: string
  /** sha256 hex digest. Pass to B11 as kmzSha256. */
  kmzSha256: string
  /** Original size in bytes — convenience for any UI display. */
  size: number
}

/**
 * Upload a KMZ blob end-to-end:
 *   1. sha256(bytes) + size
 *   2. POST /v2/blobs/kmz-upload-url (B6) → presigned PUT URL
 *   3. PUT bytes to S3 with the required Content-Type + Content-Length
 *
 * Caller hands us the bytes (already-loaded buffer or Blob with known
 * size). Tauri's file picker yields a path; the orchestrator at the call
 * site (P1) reads bytes via the fs plugin and passes them in.
 */
export async function uploadKmzToS3(args: {
  client: EntitlementsClient
  licenseKey: string
  bytes: Uint8Array
  fetchImpl?: FetchLike
}): Promise<UploadKmzResult> {
  const sha = await sha256Hex(args.bytes)
  const size = args.bytes.byteLength
  const presigned = await args.client.getKmzUploadUrl(
    args.licenseKey,
    sha,
    size
  )
  await putToS3({
    url: presigned.uploadUrl,
    bytes: args.bytes,
    contentType: KMZ_CONTENT_TYPE,
    contentLength: size,
    fetchImpl: args.fetchImpl,
  })
  return { blobUrl: presigned.blobUrl, kmzSha256: sha, size }
}

export interface UploadRunResultArgs {
  client: EntitlementsClient
  licenseKey: string
  type: RunResultType
  projectId: string
  runId: string
  bytes: Uint8Array | Blob
  fetchImpl?: FetchLike
}

export interface UploadRunResultResult {
  blobUrl: string
  size: number
}

// ---------------------------------------------------------------------------
// Download — P2 (open-existing-project flow)
// ---------------------------------------------------------------------------

export interface DownloadFromS3GetOptions {
  /**
   * Presigned GET URL — minted by B12 (`ProjectDetail.kmzDownloadUrl`)
   * for the project KMZ, or B17 (`RunDetail.layoutResultBlobUrl` /
   * `energyResultBlobUrl`) for run result JSON. Carries its own AWS
   * signature in the query string.
   */
  url: string
  /** Test seam — defaults to tauri-plugin-http or globalThis.fetch. */
  fetchImpl?: FetchLike
}

/**
 * GET a presigned S3 URL and return the raw bytes. Generic enough to
 * cover both KMZ blobs (P2 open-existing-project) and run result JSON
 * (P7 open-run); the caller decides what to do with the bytes (sidecar
 * /parse-kmz vs JSON.parse).
 *
 * Never send `Authorization` (S3 will reject the signature if any
 * non-signed header is included). 1h TTL by backend convention; on a
 * 403 the caller should re-mint via the corresponding V2 endpoint
 * (B12 / B17) and retry.
 */
export async function downloadBytesFromS3GetUrl(
  opts: DownloadFromS3GetOptions
): Promise<Uint8Array> {
  const fetchImpl = opts.fetchImpl ?? defaultFetch()
  let response: Response
  try {
    response = await fetchImpl(opts.url, { method: "GET" })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new S3DownloadError("NETWORK", 0, msg)
  }
  if (!response.ok) {
    throw new S3DownloadError(
      classifyDownload(response.status),
      response.status,
      `S3 GET failed: HTTP ${response.status}`
    )
  }
  const buf = await response.arrayBuffer()
  return new Uint8Array(buf)
}

/** Backward-compat alias for the P2 open-project KMZ download path.
 *  New callers should use `downloadBytesFromS3GetUrl` directly. */
export const downloadKmzFromS3 = downloadBytesFromS3GetUrl

/**
 * Upload a per-run result blob end-to-end (DXF / PDF / KMZ exports;
 * also the discriminator covers `layout` / `energy` if a caller mints
 * fresh URLs via B7 instead of using B16's embedded URL).
 *
 *   1. POST /v2/blobs/run-result-upload-url (B7) → presigned PUT URL
 *   2. PUT bytes to S3 with the per-type Content-Type
 */
export async function uploadRunResultToS3(
  args: UploadRunResultArgs
): Promise<UploadRunResultResult> {
  const size =
    args.bytes instanceof Uint8Array
      ? args.bytes.byteLength
      : args.bytes.size
  const presigned: PresignedUploadUrlResult =
    await args.client.getRunResultUploadUrl(args.licenseKey, {
      type: args.type,
      projectId: args.projectId,
      runId: args.runId,
      size,
    })
  await putToS3({
    url: presigned.uploadUrl,
    bytes: args.bytes,
    contentType: RUN_RESULT_CONTENT_TYPES[args.type],
    contentLength: size,
    fetchImpl: args.fetchImpl,
  })
  return { blobUrl: presigned.blobUrl, size }
}
