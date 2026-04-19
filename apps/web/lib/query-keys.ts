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
} as const
