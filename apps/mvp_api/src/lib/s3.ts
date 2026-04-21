import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3"
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
): Promise<string | null> {
  const client = getS3()
  if (!client || !env.MVP_S3_DOWNLOADS_BUCKET) return null

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: env.MVP_S3_DOWNLOADS_BUCKET,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${filename}"`,
    }),
    { expiresIn },
  )
}
