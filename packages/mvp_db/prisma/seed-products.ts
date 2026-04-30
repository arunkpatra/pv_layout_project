import { adminPrisma } from "../src/index.js"
import { products } from "../src/seed-data/products.js"

const STRIPE_PRICE_IDS = {
  "pv-layout-basic":
    process.env.STRIPE_PRICE_BASIC ?? "price_placeholder_basic",
  "pv-layout-pro":
    process.env.STRIPE_PRICE_PRO ?? "price_placeholder_pro",
  "pv-layout-pro-plus":
    process.env.STRIPE_PRICE_PRO_PLUS ?? "price_placeholder_pro_plus",
  "pv-layout-free": "price_free_tier",   // sentinel — never used in Stripe
}

async function seed() {
  console.log("Seeding products...")

  for (const product of products) {
    const stripePriceId =
      STRIPE_PRICE_IDS[product.slug as keyof typeof STRIPE_PRICE_IDS]

    const upserted = await adminPrisma.product.upsert({
      where: { slug: product.slug },
      update: {
        name: product.name,
        description: product.description,
        priceAmount: product.priceAmount,
        calculations: product.calculations,
        projectQuota: product.projectQuota,
        stripePriceId: stripePriceId,
        displayOrder: product.displayOrder,
        isFree: product.isFree,
        active: true,
      },
      create: {
        slug: product.slug,
        name: product.name,
        description: product.description,
        priceAmount: product.priceAmount,
        calculations: product.calculations,
        projectQuota: product.projectQuota,
        stripePriceId: stripePriceId,
        displayOrder: product.displayOrder,
        isFree: product.isFree,
        active: true,
      },
    })

    await adminPrisma.productFeature.deleteMany({
      where: { productId: upserted.id },
    })

    for (const feature of product.features) {
      await adminPrisma.productFeature.create({
        data: {
          productId: upserted.id,
          featureKey: feature.featureKey,
          label: feature.label,
        },
      })
    }

    console.log(`  ✓ ${product.name} (${stripePriceId})`)
  }

  console.log("Done.")
}

seed()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => adminPrisma.$disconnect())
