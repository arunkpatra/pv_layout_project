import { z } from "zod"

export const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "UPI", "CHEQUE", "OTHER"] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const TRANSACTION_SOURCES = ["STRIPE", "MANUAL", "FREE_AUTO"] as const
export type TransactionSource = (typeof TRANSACTION_SOURCES)[number]

export const createManualTransactionBody = z.object({
  userId: z.string().min(1),
  productSlug: z.string().min(1),
  paymentMethod: z.enum(PAYMENT_METHODS),
  externalReference: z.string().max(255).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  purchasedAt: z.string().datetime().optional(),
})
export type CreateManualTransactionBody = z.infer<typeof createManualTransactionBody>

export const transactionFiltersQuery = z.object({
  source: z.enum([...TRANSACTION_SOURCES, "ALL"]).optional().default("ALL"),
  email: z.string().optional(),
  productSlug: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})
export type TransactionFiltersQuery = z.infer<typeof transactionFiltersQuery>

export interface TransactionListItem {
  id: string
  userId: string
  userEmail: string
  userName: string | null
  productId: string
  productSlug: string
  productName: string
  source: TransactionSource
  status: string
  amount: number
  currency: string
  purchasedAt: string
  createdAt: string
  paymentMethod: PaymentMethod | null
  externalReference: string | null
  notes: string | null
  createdByUserId: string | null
  createdByEmail: string | null
  checkoutSessionId: string | null
}
