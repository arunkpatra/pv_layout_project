import { adminPrisma } from "../src/index.js"

const STRIPE_PRICE_IDS = {
  "pv-layout-basic":
    process.env.STRIPE_PRICE_BASIC ?? "price_placeholder_basic",
  "pv-layout-pro":
    process.env.STRIPE_PRICE_PRO ?? "price_placeholder_pro",
  "pv-layout-pro-plus":
    process.env.STRIPE_PRICE_PRO_PLUS ?? "price_placeholder_pro_plus",
  "pv-layout-free": "price_free_tier",   // sentinel — never used in Stripe
}

const products = [
  {
    slug: "pv-layout-free",
    name: "PV Layout Free",
    description: "5 free layout calculations on signup — all Pro Plus features included",
    priceAmount: 0,
    calculations: 5,
    displayOrder: 0,
    isFree: true,
    features: [
      { featureKey: "plant_layout", label: "Plant Layout (MMS, Inverter, LA)" },
      { featureKey: "obstruction_exclusion", label: "Obstruction Exclusion" },
      { featureKey: "cable_routing", label: "AC & DC Cable Routing" },
      { featureKey: "cable_measurements", label: "Cable Quantity Measurements" },
      { featureKey: "energy_yield", label: "Energy Yield Analysis" },
      { featureKey: "generation_estimates", label: "Plant Generation Estimates" },
    ],
  },
  {
    slug: "pv-layout-basic",
    name: "PV Layout Basic",
    description: "5 layout calculations per purchase",
    priceAmount: 199,
    calculations: 5,
    displayOrder: 1,
    isFree: false,
    features: [
      { featureKey: "plant_layout", label: "Plant Layout (MMS, Inverter, LA)" },
      { featureKey: "obstruction_exclusion", label: "Obstruction Exclusion" },
    ],
  },
  {
    slug: "pv-layout-pro",
    name: "PV Layout Pro",
    description: "10 layout calculations per purchase",
    priceAmount: 499,
    calculations: 10,
    displayOrder: 2,
    isFree: false,
    features: [
      { featureKey: "plant_layout", label: "Plant Layout (MMS, Inverter, LA)" },
      { featureKey: "obstruction_exclusion", label: "Obstruction Exclusion" },
      { featureKey: "cable_routing", label: "AC & DC Cable Routing" },
      { featureKey: "cable_measurements", label: "Cable Quantity Measurements" },
    ],
  },
  {
    slug: "pv-layout-pro-plus",
    name: "PV Layout Pro Plus",
    description: "50 layout and yield calculations per purchase",
    priceAmount: 1499,
    calculations: 50,
    displayOrder: 3,
    isFree: false,
    features: [
      { featureKey: "plant_layout", label: "Plant Layout (MMS, Inverter, LA)" },
      { featureKey: "obstruction_exclusion", label: "Obstruction Exclusion" },
      { featureKey: "cable_routing", label: "AC & DC Cable Routing" },
      { featureKey: "cable_measurements", label: "Cable Quantity Measurements" },
      { featureKey: "energy_yield", label: "Energy Yield Analysis" },
      { featureKey: "generation_estimates", label: "Plant Generation Estimates" },
    ],
  },
]

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
