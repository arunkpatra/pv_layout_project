import { generateSemanticId } from "./id-generator.js"
import { ID_PREFIXES } from "./id-prefixes.js"

/**
 * Prisma extension that automatically generates semantic IDs on create/upsert.
 * Intercepts create, createMany, and upsert operations.
 * If no ID is provided (or @default("") yields empty string), generates
 * a semantic ID using the model's prefix from ID_PREFIXES.
 */
export const semanticIdExtension = {
  name: "mvp-semantic-ids",
  query: {
    $allModels: {
      async create({
        args,
        model,
        query,
      }: {
        args: any
        model: string
        query: any
      }) {
        if (!args.data?.id) {
          const prefix =
            ID_PREFIXES[model] ??
            (console.warn(
              `[SEMANTIC-ID] No prefix registered for model "${model}" — using "unk"`
            ),
            "unk")
          args.data.id = generateSemanticId(prefix)
        }
        return query(args)
      },

      async createMany({
        args,
        model,
        query,
      }: {
        args: any
        model: string
        query: any
      }) {
        if (args.data && Array.isArray(args.data)) {
          const prefix =
            ID_PREFIXES[model] ??
            (console.warn(
              `[SEMANTIC-ID] No prefix registered for model "${model}" — using "unk"`
            ),
            "unk")
          args.data = args.data.map((item: any) => {
            if (!item.id) {
              item.id = generateSemanticId(prefix)
            }
            return item
          })
        }
        return query(args)
      },

      async upsert({
        args,
        model,
        query,
      }: {
        args: any
        model: string
        query: any
      }) {
        if (args.create && !args.create.id) {
          const prefix =
            ID_PREFIXES[model] ??
            (console.warn(
              `[SEMANTIC-ID] No prefix registered for model "${model}" — using "unk"`
            ),
            "unk")
          args.create.id = generateSemanticId(prefix)
        }
        return query(args)
      },
    },
  },
} as const
