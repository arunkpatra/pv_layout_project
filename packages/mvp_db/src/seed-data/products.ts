export interface SeedProductFeature {
  featureKey: string
  label: string
}

export interface SeedProduct {
  slug: string
  name: string
  description: string
  priceAmount: number
  calculations: number
  projectQuota: number
  displayOrder: number
  isFree: boolean
  features: SeedProductFeature[]
}

export const products: SeedProduct[] = [
  {
    slug: "pv-layout-free",
    name: "Free",
    description:
      "5 free layout calculations on signup — all Pro Plus features included",
    priceAmount: 0,
    calculations: 5,
    projectQuota: 3,
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
    name: "Basic",
    description: "5 layout calculations per purchase",
    priceAmount: 199,
    calculations: 5,
    projectQuota: 5,
    displayOrder: 1,
    isFree: false,
    features: [
      { featureKey: "plant_layout", label: "Plant Layout (MMS, Inverter, LA)" },
      { featureKey: "obstruction_exclusion", label: "Obstruction Exclusion" },
    ],
  },
  {
    slug: "pv-layout-pro",
    name: "Pro",
    description: "10 layout calculations per purchase",
    priceAmount: 499,
    calculations: 10,
    projectQuota: 10,
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
    name: "Pro Plus",
    description: "50 layout and yield calculations per purchase",
    priceAmount: 1499,
    calculations: 50,
    projectQuota: 15,
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
