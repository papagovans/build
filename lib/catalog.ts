/**
 * PHASE 1 PLACEHOLDER CATALOG
 *
 * This data moves to Sanity once the flow is approved. Shape here mirrors the
 * intended CMS schema exactly so the port is mechanical.
 *
 * Real data confirmed from papagovansdev: the Electricity category options are
 * verbatim from the Build Layout 2 page. Other categories are representative
 * placeholders pending real spec sheets.
 */

export type OptionType = "included" | "upgrade" | "addon";

export interface Option {
  id: string;
  categoryId: string;
  name: string;
  description?: string;
  type: OptionType;
  /** Upgrade = delta over the item it replaces. Add-on = full price. Included = 0. */
  price: number;
  /** Option id this upgrade swaps out of the base build. */
  replaces?: string;
  /** Must also be selected for this option to be valid. */
  requires?: string[];
  /** Cannot be selected alongside these. */
  conflictsWith?: string[];
  /** Floor plans this fits. Undefined = fits all. */
  availableFor?: string[];
}

export interface Category {
  id: string;
  name: string;
  blurb: string;
}

export interface GalleryImage {
  id: string;
  label: string;
  src: string;
}

export interface FloorPlan {
  id: string;
  name: string;
  tagline: string;
  basePrice: number;
  /** Card thumbnail. The 3D cutaway reads better at small sizes than the top-down. */
  image: string;
  gallery: GalleryImage[];
  specs: { label: string; value: string }[];
}

/**
 * Placeholder render set, shared by all five plans until per-plan renders exist.
 * Cutaway leads because it communicates the layout most vividly; the true
 * top-down plan view sits immediately beside it.
 */
const PLACEHOLDER_GALLERY: GalleryImage[] = [
  { id: "cutaway", label: "Cutaway", src: "/floorplans/cutaway.webp" },
  { id: "floorplan", label: "Floor Plan", src: "/floorplans/floorplan.webp" },
  { id: "front", label: "Front", src: "/floorplans/front.webp" },
  { id: "left", label: "Left Side", src: "/floorplans/left.webp" },
  { id: "left-angle", label: "Left Angle", src: "/floorplans/left-angle.webp" },
  { id: "right", label: "Right Side", src: "/floorplans/right.webp" },
  { id: "right-angle", label: "Right Angle", src: "/floorplans/right-angle.webp" },
  { id: "rear-garage", label: "Rear Garage", src: "/floorplans/rear-garage.webp" },
];

export interface BuildPackage {
  id: string;
  name: string;
  tagline: string;
  priceDelta: number;
  /** Option ids pre-selected when this package is chosen. */
  defaults: string[];
}

/** Base price is uniform in Phase 1 per Jerry, 2026-09-18. */
const BASE_PRICE = 180_000;

export const FLOOR_PLANS: FloorPlan[] = [
  {
    id: "el-capitan",
    name: "El Capitan",
    tagline: "Top-tier luxury. Premium finishes, no limits.",
    basePrice: BASE_PRICE,
    image: "/floorplans/cutaway.webp",
    gallery: PLACEHOLDER_GALLERY,
    specs: [
      { label: "Sleeps", value: "2-6" },
      { label: "Battery", value: "920Ah" },
      { label: "Fresh Water", value: "33G" },
    ],
  },
  {
    id: "zion",
    name: "Zion",
    tagline: "Adventure seeker. Built to get off the pavement.",
    basePrice: BASE_PRICE,
    image: "/floorplans/cutaway.webp",
    gallery: PLACEHOLDER_GALLERY,
    specs: [
      { label: "Sleeps", value: "2-4" },
      { label: "Battery", value: "620Ah" },
      { label: "Fresh Water", value: "25G" },
    ],
  },
  {
    id: "olympus",
    name: "Olympus",
    tagline: "The traveling nomad. Stay out longer, live comfortably.",
    basePrice: BASE_PRICE,
    image: "/floorplans/cutaway.webp",
    gallery: PLACEHOLDER_GALLERY,
    specs: [
      { label: "Sleeps", value: "2-6" },
      { label: "Battery", value: "920Ah" },
      { label: "Fresh Water", value: "20G" },
    ],
  },
  {
    id: "mammoth",
    name: "Mammoth",
    tagline: "The happy camper. Room for the whole crew.",
    basePrice: BASE_PRICE,
    image: "/floorplans/cutaway.webp",
    gallery: PLACEHOLDER_GALLERY,
    specs: [
      { label: "Sleeps", value: "2-6" },
      { label: "Battery", value: "460Ah" },
      { label: "Fresh Water", value: "33G" },
    ],
  },
  {
    id: "rainier",
    name: "Rainier",
    tagline: "The weekend warrior. Everything you need, nothing you don't.",
    basePrice: BASE_PRICE,
    image: "/floorplans/cutaway.webp",
    gallery: PLACEHOLDER_GALLERY,
    specs: [
      { label: "Sleeps", value: "2" },
      { label: "Battery", value: "460Ah" },
      { label: "Fresh Water", value: "20G" },
    ],
  },
];

/**
 * Nine categories. Eight are verbatim from the dev site; Exterior / Off-Road is
 * added because the live site files winches, bumpers, and light bars under
 * Electricity, which is a data-hygiene problem worth fixing at migration.
 */
export const CATEGORIES: Category[] = [
  { id: "electricity", name: "Electricity", blurb: "Power, solar, and charging" },
  { id: "plumbing", name: "Plumbing", blurb: "Water, sinks, and showers" },
  { id: "climate", name: "Heating / Cooling", blurb: "Comfortable in any season" },
  { id: "kitchen", name: "Kitchen", blurb: "Cook real meals on the road" },
  { id: "aesthetic", name: "Aesthetic", blurb: "Finishes and materials" },
  { id: "storage", name: "Storage", blurb: "A place for all your gear" },
  { id: "sleeping", name: "Seating / Sleeping", blurb: "Where you rest and ride" },
  { id: "exterior", name: "Exterior / Off-Road", blurb: "Built for the rough stuff" },
  { id: "misc", name: "Miscellaneous", blurb: "The finishing touches" },
];

export const OPTIONS: Option[] = [
  // ---------------------------------------------------------------- Electricity
  {
    id: "elec-solar-400",
    categoryId: "electricity",
    name: "400W Solar System",
    description: "30A Victron MPPT Smart Solar Charger with Bluetooth",
    type: "included",
    price: 0,
  },
  {
    id: "elec-dcdc-50",
    categoryId: "electricity",
    name: "50A Victron Orion XS DC-DC Charger",
    description: "Smart battery charger with Bluetooth",
    type: "included",
    price: 0,
  },
  {
    id: "elec-battery-920",
    categoryId: "electricity",
    name: "920Ah Epoch V2-T Elite Lithium System",
    description: "Heated LiFePO4 with Bluetooth monitoring",
    type: "included",
    price: 0,
  },
  {
    id: "elec-inverter",
    categoryId: "electricity",
    name: "Victron MultiPlus-II 3000W Inverter Charger",
    description: "Pure sine wave, with GX Touch 70 flush monitor",
    type: "included",
    price: 0,
  },
  {
    id: "elec-shore",
    categoryId: "electricity",
    name: "30A Shore Power Smart Hookup",
    description: "110v outlets with USB A and C throughout",
    type: "included",
    price: 0,
  },
  {
    id: "elec-solar-600",
    categoryId: "electricity",
    name: "Upgrade to 600W Solar",
    description: "With 50A MPPT Smart Solar Charger",
    type: "upgrade",
    price: 2_450,
    replaces: "elec-solar-400",
  },
  {
    id: "elec-dcdc-100",
    categoryId: "electricity",
    name: "Upgrade to 100A DC-DC Charging",
    description: "Recharge twice as fast while driving",
    type: "upgrade",
    price: 1_280,
    replaces: "elec-dcdc-50",
  },
  {
    id: "elec-battery-1380",
    categoryId: "electricity",
    name: "Upgrade to 1,380Ah Battery Capacity",
    description: "Half again the capacity for extended off-grid stays",
    type: "upgrade",
    price: 6_900,
    replaces: "elec-battery-920",
    availableFor: ["el-capitan", "olympus", "zion"],
  },

  // ------------------------------------------------------------------ Plumbing
  {
    id: "plumb-fresh-20",
    categoryId: "plumbing",
    name: "20 Gallon Fresh Water System",
    description: "Insulated tank with electric pump",
    type: "included",
    price: 0,
  },
  {
    id: "plumb-sink",
    categoryId: "plumbing",
    name: "Undermount Stainless Sink",
    description: "Hot and cold water faucet",
    type: "included",
    price: 0,
  },
  {
    id: "plumb-fresh-33",
    categoryId: "plumbing",
    name: "Upgrade to 33 Gallon Fresh Water",
    description: "Stay out longer between fills",
    type: "upgrade",
    price: 1_150,
    replaces: "plumb-fresh-20",
  },
  {
    id: "plumb-shower-indoor",
    categoryId: "plumbing",
    name: "Indoor Shower",
    description: "Tiled wet bath with teak floor insert",
    type: "addon",
    price: 7_800,
    conflictsWith: ["plumb-shower-outdoor"],
    availableFor: ["el-capitan", "olympus", "mammoth"],
  },
  {
    id: "plumb-shower-outdoor",
    categoryId: "plumbing",
    name: "Exterior Shower",
    description: "Rear-mounted hot and cold rinse station",
    type: "addon",
    price: 1_400,
    conflictsWith: ["plumb-shower-indoor"],
  },
  {
    id: "plumb-water-heater",
    categoryId: "plumbing",
    name: "On-Demand Water Heater",
    description: "Endless hot water, propane-free",
    type: "addon",
    price: 2_650,
  },

  // ------------------------------------------------------------------- Climate
  {
    id: "climate-heater",
    categoryId: "climate",
    name: "Diesel Air Heater",
    description: "Thermostat-controlled cabin heat",
    type: "included",
    price: 0,
  },
  {
    id: "climate-fan",
    categoryId: "climate",
    name: "MaxxAir Roof Fan",
    description: "Reversible with rain cover",
    type: "included",
    price: 0,
  },
  {
    id: "climate-ac",
    categoryId: "climate",
    name: "12V Air Conditioning",
    description: "Runs off the battery bank, no generator",
    type: "addon",
    price: 5_900,
  },
  {
    id: "climate-insulation",
    categoryId: "climate",
    name: "Premium Insulation Package",
    description: "Thinsulate and closed-cell throughout",
    type: "addon",
    price: 2_200,
  },
  {
    id: "climate-second-fan",
    categoryId: "climate",
    name: "Second Roof Fan",
    description: "Cross-ventilation for hot climates",
    type: "addon",
    price: 1_100,
    availableFor: ["el-capitan", "olympus", "mammoth"],
  },

  // ------------------------------------------------------------------- Kitchen
  {
    id: "kitchen-counter",
    categoryId: "kitchen",
    name: "Acacia Butcher Block Counter",
    description: "Sealed hardwood work surface",
    type: "included",
    price: 0,
  },
  {
    id: "kitchen-fridge-small",
    categoryId: "kitchen",
    name: "Under-Counter Refrigerator",
    description: "3.2 cu ft compressor fridge",
    type: "included",
    price: 0,
  },
  {
    id: "kitchen-cooktop-single",
    categoryId: "kitchen",
    name: "Portable Single Induction Burner",
    description: "Stows away when not in use",
    type: "included",
    price: 0,
  },
  {
    id: "kitchen-fridge-tall",
    categoryId: "kitchen",
    name: "Upgrade to Full-Height Refrigerator",
    description: "5.7 cu ft with separate freezer",
    type: "upgrade",
    price: 3_400,
    replaces: "kitchen-fridge-small",
    availableFor: ["el-capitan", "olympus", "mammoth"],
  },
  {
    id: "kitchen-cooktop-double",
    categoryId: "kitchen",
    name: "Upgrade to Built-In Double Induction",
    description: "Flush-mounted two-burner cooktop",
    type: "upgrade",
    price: 1_850,
    replaces: "kitchen-cooktop-single",
  },
  {
    id: "kitchen-microwave",
    categoryId: "kitchen",
    name: "Convection Microwave",
    description: "Recessed into the upper cabinetry",
    type: "addon",
    price: 1_250,
  },

  // ----------------------------------------------------------------- Aesthetic
  {
    id: "aes-vinyl",
    categoryId: "aesthetic",
    name: "Luxury Vinyl Plank Flooring",
    description: "Waterproof, matched to cabinetry",
    type: "included",
    price: 0,
  },
  {
    id: "aes-cabinetry-standard",
    categoryId: "aesthetic",
    name: "Standard Cabinetry Finish",
    description: "Powder-coated aluminum frames",
    type: "included",
    price: 0,
  },
  {
    id: "aes-cabinetry-premium",
    categoryId: "aesthetic",
    name: "Upgrade to Premium Hardwood Cabinetry",
    description: "Solid face frames with soft-close everything",
    type: "upgrade",
    price: 4_600,
    replaces: "aes-cabinetry-standard",
  },
  {
    id: "aes-backsplash",
    categoryId: "aesthetic",
    name: "Tiled Backsplash",
    description: "Hand-set tile behind the galley",
    type: "addon",
    price: 1_300,
  },
  {
    id: "aes-ceiling",
    categoryId: "aesthetic",
    name: "Slatted Wood Ceiling",
    description: "Warm cedar slat detail with integrated lighting",
    type: "addon",
    price: 2_400,
  },

  // ------------------------------------------------------------------- Storage
  {
    id: "storage-garage",
    categoryId: "storage",
    name: "Rear Garage Storage",
    description: "Gear bay under the bed platform",
    type: "included",
    price: 0,
  },
  {
    id: "storage-overhead",
    categoryId: "storage",
    name: "Overhead Cabinets",
    description: "Latching doors rated for washboard roads",
    type: "included",
    price: 0,
  },
  {
    id: "storage-drawers",
    categoryId: "storage",
    name: "Heavy-Duty Slide-Out Drawers",
    description: "Full-extension, 500lb rated",
    type: "addon",
    price: 1_900,
  },
  {
    id: "storage-gear-wall",
    categoryId: "storage",
    name: "Modular Gear Wall",
    description: "Track system for bikes, skis, and boards",
    type: "addon",
    price: 1_450,
  },

  // ------------------------------------------------------------------ Sleeping
  {
    id: "sleep-fixed-bed",
    categoryId: "sleeping",
    name: "Fixed Rear Bed",
    description: "Permanent platform with memory foam mattress",
    type: "included",
    price: 0,
  },
  {
    id: "sleep-swivel",
    categoryId: "sleeping",
    name: "Swivel Cab Seats",
    description: "Both front seats rotate into the living space",
    type: "included",
    price: 0,
  },
  {
    id: "sleep-bench",
    categoryId: "sleeping",
    name: "Convertible Dinette Bench",
    description: "Seats four, converts to a second bed",
    type: "addon",
    price: 3_200,
    availableFor: ["el-capitan", "olympus", "mammoth"],
  },
  {
    id: "sleep-pop-top",
    categoryId: "sleeping",
    name: "Pop-Top Sleeping Loft",
    description: "Adds two berths and standing headroom",
    type: "addon",
    price: 14_500,
    availableFor: ["el-capitan", "zion"],
  },

  // ------------------------------------------------------------------ Exterior
  {
    id: "ext-awning",
    categoryId: "exterior",
    name: "Nomadic A2 Electric Awning",
    description: "With integrated LED lighting",
    type: "addon",
    price: 3_100,
  },
  {
    id: "ext-bumper",
    categoryId: "exterior",
    name: "FVCO Front Bumper with Bull Bar",
    description: "Recovery D-rings included",
    type: "addon",
    price: 2_950,
  },
  {
    id: "ext-winch",
    categoryId: "exterior",
    name: "Warn 12s Winch with Wireless Remote",
    description: "Requires the FVCO front bumper",
    type: "addon",
    price: 2_400,
    requires: ["ext-bumper"],
  },
  {
    id: "ext-platform",
    categoryId: "exterior",
    name: "FVCO Rear Door Platform",
    description: "Mounting base for tire carrier and storage",
    type: "addon",
    price: 1_750,
  },
  {
    id: "ext-storage-box",
    categoryId: "exterior",
    name: "FVCO Rear Storage Box",
    description: "Requires the rear door platform",
    type: "addon",
    price: 1_200,
    requires: ["ext-platform"],
  },
  {
    id: "ext-wheels",
    categoryId: "exterior",
    name: "All-Terrain Wheels and Tires Package",
    description: "Load-rated for a fully built van",
    type: "addon",
    price: 4_300,
  },
  {
    id: "ext-lights",
    categoryId: "exterior",
    name: "Morimoto BigBanger 7 Pod Light Bar",
    description: "Front-mounted auxiliary lighting",
    type: "addon",
    price: 1_650,
  },

  // ---------------------------------------------------------------------- Misc
  {
    id: "misc-windows",
    categoryId: "misc",
    name: "Solid Glass Rear Cargo Door Windows",
    description: "Factory-look glass in the rear doors",
    type: "addon",
    price: 1_850,
  },
  {
    id: "misc-blackout",
    categoryId: "misc",
    name: "Magnetic Blackout Window Covers",
    description: "Van Essential insulated package",
    type: "addon",
    price: 890,
  },
  {
    id: "misc-screen",
    categoryId: "misc",
    name: "Slider Door Bug Screen",
    description: "Magnetic closure, full height",
    type: "addon",
    price: 450,
  },
  {
    id: "misc-starlink",
    categoryId: "misc",
    name: "Starlink Roof Mount and Wiring",
    description: "Dish not included",
    type: "addon",
    price: 1_100,
  },
];

/**
 * Three package tiers. In Phase 1 these apply to every floor plan; the CMS will
 * allow per-plan overrides, which is why getPackages() takes a plan id.
 */
const PACKAGE_TIERS: Omit<BuildPackage, "id">[] = [
  {
    name: "Essential",
    tagline: "The core build, ready for the road.",
    priceDelta: 0,
    defaults: [],
  },
  {
    name: "Adventure",
    tagline: "More power, more water, more range.",
    priceDelta: 12_500,
    defaults: [
      "elec-solar-600",
      "plumb-fresh-33",
      "plumb-water-heater",
      "climate-insulation",
      "kitchen-cooktop-double",
      "storage-drawers",
      "misc-blackout",
    ],
  },
  {
    name: "Summit",
    tagline: "Everything we know how to build.",
    priceDelta: 28_000,
    defaults: [
      "elec-solar-600",
      "elec-dcdc-100",
      "elec-battery-1380",
      "plumb-fresh-33",
      "plumb-water-heater",
      "plumb-shower-indoor",
      "climate-ac",
      "climate-insulation",
      "kitchen-fridge-tall",
      "kitchen-cooktop-double",
      "aes-cabinetry-premium",
      "aes-ceiling",
      "storage-drawers",
      "ext-awning",
      "ext-wheels",
      "misc-blackout",
    ],
  },
];

/** Packages for a plan, filtered so defaults never include an option that plan can't fit. */
export function getPackages(floorPlanId: string): BuildPackage[] {
  return PACKAGE_TIERS.map((tier) => ({
    ...tier,
    id: `${floorPlanId}--${tier.name.toLowerCase()}`,
    defaults: tier.defaults.filter((optionId) => {
      const option = OPTIONS.find((o) => o.id === optionId);
      return option ? isAvailable(option, floorPlanId) : false;
    }),
  }));
}

export function isAvailable(option: Option, floorPlanId: string): boolean {
  return !option.availableFor || option.availableFor.includes(floorPlanId);
}

export function getOption(id: string): Option | undefined {
  return OPTIONS.find((o) => o.id === id);
}

export function optionsFor(categoryId: string, floorPlanId: string): Option[] {
  return OPTIONS.filter(
    (o) => o.categoryId === categoryId && isAvailable(o, floorPlanId),
  );
}

export function getFloorPlan(id: string): FloorPlan | undefined {
  return FLOOR_PLANS.find((p) => p.id === id);
}
