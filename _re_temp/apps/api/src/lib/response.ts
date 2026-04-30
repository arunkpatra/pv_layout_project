import type { ApiResponse } from "@renewable-energy/shared"

export type { ApiResponse }

export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data }
}

export function err(
  code: string,
  message: string,
  details?: unknown,
): ApiResponse<never> {
  return { success: false, error: { code, message, details } }
}
