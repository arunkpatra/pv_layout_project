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
  console.info(`[sqs] sending to ${env.SQS_LAYOUT_QUEUE_URL} version_id=${versionId}`)
  console.info(`[sqs] credentials: key=${env.AWS_ACCESS_KEY_ID ? env.AWS_ACCESS_KEY_ID.slice(0, 8) + "..." : "MISSING"} region=${env.AWS_REGION ?? "default"}`)
  const result = await client.send(
    new SendMessageCommand({
      QueueUrl: env.SQS_LAYOUT_QUEUE_URL,
      MessageBody: JSON.stringify({ version_id: versionId }),
    }),
  )
  console.info(`[sqs] sent OK messageId=${result.MessageId}`)
}
