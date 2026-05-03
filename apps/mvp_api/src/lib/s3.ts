import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { env } from "../env.js"

let s3: S3Client | null = null

function getS3(): S3Client | null {
  if (
    !env.AWS_ACCESS_KEY_ID ||
    !env.AWS_SECRET_ACCESS_KEY ||
    !env.AWS_REGION
  ) {
    return null
  }
  if (!s3) {
    s3 = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      },
    })
  }
  return s3
}

export async function getPresignedDownloadUrl(
  key: string,
  filename: string,
  expiresIn = 3600,
  bucket?: string,
): Promise<string | null> {
  const client = getS3()
  const targetBucket = bucket ?? env.MVP_S3_DOWNLOADS_BUCKET
  if (!client || !targetBucket) return null

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: targetBucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${filename}"`,
    }),
    { expiresIn },
  )
}

/**
 * Pre-signed PUT for the V2 projects bucket — used by B6/B7 endpoints
 * (KMZ upload, run-result upload). Returns null when S3 is not configured
 * (graceful degradation, mirrors getPresignedDownloadUrl). The desktop
 * client must send the same Content-Type header on its PUT or S3 will
 * reject the signature.
 *
 * Default expiresIn is 900s (15 min) — uploads should land quickly; longer
 * lifetimes only widen the window for replay-style misuse.
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 900,
  contentLength?: number,
): Promise<string | null> {
  const client = getS3()
  if (!client || !env.MVP_S3_PROJECTS_BUCKET) return null

  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: env.MVP_S3_PROJECTS_BUCKET,
      Key: key,
      ContentType: contentType,
      ...(contentLength !== undefined ? { ContentLength: contentLength } : {}),
    }),
    { expiresIn },
  )
}

/**
 * Split an `s3://<bucket>/<key>` URL into its components.
 *
 * Used by parse-kmz route (and future Lambda routes) to translate
 * a stored Project.kmzBlobUrl into a Lambda payload `{bucket, key}`.
 *
 * Throws on malformed input — Project.kmzBlobUrl was set by mvp_api
 * itself at upload time, so a malformed value indicates DB corruption.
 */
export function parseS3Url(url: string): { bucket: string; key: string } {
  const match = url.match(/^s3:\/\/([^/]+)\/(.+)$/)
  if (!match) {
    throw new Error(`malformed s3 url: ${url}`)
  }
  return { bucket: match[1]!, key: match[2]! }
}
