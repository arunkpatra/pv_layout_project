import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { env } from "../env.js"

let s3: S3Client | null = null

function getS3(): S3Client | null {
  if (!env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY || !env.AWS_REGION) {
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

export async function uploadToS3(
  buffer: Buffer,
  key: string,
  contentType = "application/octet-stream",
): Promise<void> {
  const client = getS3()
  if (!client || !env.S3_ARTIFACTS_BUCKET) return

  await client.send(
    new PutObjectCommand({
      Bucket: env.S3_ARTIFACTS_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  )
}

export async function getPresignedUrl(
  key: string,
  expiresIn = 3600,
): Promise<string | null> {
  const client = getS3()
  if (!client || !env.S3_ARTIFACTS_BUCKET) return null

  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: env.S3_ARTIFACTS_BUCKET, Key: key }),
    { expiresIn },
  )
}

export async function getPresignedDownloadUrl(
  key: string,
  filename: string,
  expiresIn = 3600,
): Promise<string | null> {
  const client = getS3()
  if (!client || !env.S3_ARTIFACTS_BUCKET) return null

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: env.S3_ARTIFACTS_BUCKET,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${filename}"`,
    }),
    { expiresIn },
  )
}
