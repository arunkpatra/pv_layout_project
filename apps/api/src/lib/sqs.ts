import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs"
import { env } from "../env.js"

const client = new SQSClient({
  region: env.AWS_REGION ?? "ap-south-1",
  ...(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
    ? {
        credentials: {
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        },
      }
    : {}),
})

export async function publishLayoutJob(versionId: string): Promise<void> {
  if (!env.SQS_LAYOUT_QUEUE_URL) {
    throw new Error("SQS_LAYOUT_QUEUE_URL is not set")
  }
  await client.send(
    new SendMessageCommand({
      QueueUrl: env.SQS_LAYOUT_QUEUE_URL,
      MessageBody: JSON.stringify({ version_id: versionId }),
    }),
  )
}
