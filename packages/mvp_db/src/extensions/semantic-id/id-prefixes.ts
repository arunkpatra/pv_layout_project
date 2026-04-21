/**
 * MVP semantic ID prefix registry.
 * Maps Prisma model names to their entity prefix.
 *
 * Format: {prefix}_{base62_random} = 40 chars total
 * The prefix must be short enough to leave at least 8 chars for the suffix.
 */
export const ID_PREFIXES: Record<string, string> = {
  DownloadRegistration: "drg",
  ContactSubmission: "csb",
}
