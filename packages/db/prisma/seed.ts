import { prisma } from "../src/index"

async function seed() {
  console.log("Seeding database...")
  // TODO: add seed data as the schema grows
  console.log("Seed complete.")
}

seed()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
