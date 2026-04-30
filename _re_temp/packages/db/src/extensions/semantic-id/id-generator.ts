import { randomBytes } from "crypto"

function generateRandomAlphanumeric(length: number): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let result = ""
  const bytes = randomBytes(length)
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i]! % chars.length]
  }
  return result
}

/**
 * Generate a semantic ID with fixed total length of 40 characters.
 * Format: {prefix}_{random_alphanumeric}
 * Total length is always 40 characters regardless of prefix length.
 *
 * @example generateSemanticId("usr") → "usr_aBc3dE9fG2hI5jK8lM1nO4pQ7rS0tUvWxYz"
 */
export function generateSemanticId(prefix: string): string {
  const TOTAL_LENGTH = 40
  const prefixWithUnderscore = `${prefix}_`
  const remainingLength = TOTAL_LENGTH - prefixWithUnderscore.length

  if (remainingLength <= 0) {
    throw new Error(
      `Prefix "${prefix}" is too long. Total ID length must be ${TOTAL_LENGTH} characters.`
    )
  }

  const randomSuffix = generateRandomAlphanumeric(remainingLength)
  const semanticId = `${prefixWithUnderscore}${randomSuffix}`

  if (semanticId.length !== TOTAL_LENGTH) {
    throw new Error(
      `Generated semantic ID length (${semanticId.length}) does not match required (${TOTAL_LENGTH})`
    )
  }

  return semanticId
}
