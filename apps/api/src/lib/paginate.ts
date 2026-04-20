export interface PaginationQuery {
  page?: number
  pageSize?: number
}

export function paginationArgs(query: PaginationQuery): {
  skip: number
  take: number
} {
  const page = Math.max(1, query.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20))
  return { skip: (page - 1) * pageSize, take: pageSize }
}

export function paginationMeta(opts: {
  total: number
  page: number
  pageSize: number
}): { total: number; page: number; pageSize: number; totalPages: number } {
  return {
    total: opts.total,
    page: opts.page,
    pageSize: opts.pageSize,
    totalPages: opts.total === 0 ? 0 : Math.ceil(opts.total / opts.pageSize),
  }
}
