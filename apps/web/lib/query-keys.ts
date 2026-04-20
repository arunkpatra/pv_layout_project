// Key factory functions return `as const` tuples.
//
// The `all()` key for each domain acts as a prefix: calling
//   queryClient.invalidateQueries({ queryKey: queryKeys.identity.all() })
// cascades via TanStack prefix matching to all identity queries.
//
// RULE: No string literals for query keys anywhere outside this file.

export const queryKeys = {
  identity: {
    all: () => ["identity"] as const,
    me: () => ["identity", "me"] as const,
  },
  projects: {
    all: () => ["projects"] as const,
    lists: (params?: { page?: number; pageSize?: number }) =>
      ["projects", "list", params] as const,
    detail: (projectId: string) => ["projects", projectId] as const,
    versions: {
      all: (projectId: string) => ["projects", projectId, "versions"] as const,
      lists: (projectId: string, params?: { page?: number; pageSize?: number }) =>
        ["projects", projectId, "versions", "list", params] as const,
      detail: (projectId: string, versionId: string) =>
        ["projects", projectId, "versions", versionId] as const,
    },
  },
} as const
