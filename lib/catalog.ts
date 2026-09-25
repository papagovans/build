/**
 * CATALOG TYPES, HELPERS, AND THE SEED'S SOURCE DATA.
 *
 * The live catalog comes out of Payload now; see `lib/cms.ts`. The arrays
 * below are exported as HARDCODED_CATALOG and are read by one thing only,
 * `scripts/seed.ts`. Editing them changes nothing the app renders until you
 * reseed.
 *
 * Everything here keys on slugs, which are the same ids Payload stores, so a
 * `?b=` link resolves against either catalog.
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
  /**
   * Whether a buyer chooses this themselves. Undefined means yes.
   *
   * False hides the option from its category step while leaving it fully in
   * the build: it still prices, still appears on the Build Sheet, and still
   * shows in the trim package's what-is-included list. It is how a component
   * nobody has an opinion about, a 50A versus a 100A DC-DC charger, stops
   * being a question and becomes part of the package that owns it.
   *
   * It is not a soft delete. An unselectable option a package pre-selects is
   * as real as any other; the buyer simply is not asked about it.
   */
  selectable?: boolean;
  /** Product thumbnail under /public/products. Placeholder imagery for mockup only. */
  thumb?: string;
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

/**
 * A Sprinter wheelbase. Step one of the wizard.
 *
 * `basePrice` lives on the floor plan and is the price on the shortest van;
 * a length carries only the delta from there. Keeping them separate means a
 * plan can be repriced without touching the chassis, and the other way round.
 */
export interface VanLength {
  id: string;
  /** What a buyer gets, not the spec. The spec is the tagline. */
  name: string;
  tagline: string;
  priceDelta: number;
  image: string;
  /**
   * Overall vehicle length in inches, Mercedes published spec.
   *
   * This drives the to-scale bar under the van. A 3/4 render foreshortens the
   * length axis, so a real 24% difference only shows as about 8% on screen;
   * the bar states the difference honestly instead of relying on the eye.
   */
  overallInches: number;
}

export interface FloorPlan {
  id: string;
  name: string;
  tagline: string;
  basePrice: number;
  /**
   * Lengths this plan is built on. Undefined means all of them, which is the
   * safe default: a plan that quietly offers a length it cannot be built on is
   * a worse failure than one that offers too many, and the shop corrects it in
   * the admin.
   */
  availableLengths?: string[];
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

/**
 * Colors behave differently from the three option types: exactly one choice per
 * group is always active, so they are a separate concept rather than a fourth
 * option type.
 *
 * All choices are $0 for now per Jerry (2026-09-18). The `price` field is kept
 * so premium finishes can carry an upcharge later without a schema change; it
 * already flows through pricing, the Build Sheet, and the shared URL.
 */
export interface ColorChoice {
  id: string;
  name: string;
  /** Swatch fill. `hex2` renders a two-tone swatch for grained materials. */
  hex: string;
  hex2?: string;
  price: number;
}

export interface ColorGroup {
  id: string;
  categoryId: string;
  name: string;
  blurb: string;
  choices: ColorChoice[];
}

export const COLOR_GROUPS: ColorGroup[] = [
  {
    id: "flooring",
    categoryId: "finishes",
    name: "Flooring",
    blurb: "Waterproof luxury vinyl plank",
    choices: [
      { id: "floor-natural-oak", name: "Natural Oak", hex: "#c8a072", hex2: "#b08a5c", price: 0 },
      { id: "floor-weathered-grey", name: "Weathered Grey", hex: "#9b9791", hex2: "#847f79", price: 0 },
      { id: "floor-walnut", name: "Walnut", hex: "#6b4630", hex2: "#563524", price: 0 },
      { id: "floor-charcoal", name: "Charcoal Ash", hex: "#4a4a4c", hex2: "#3a3a3c", price: 0 },
    ],
  },
  {
    id: "walls",
    categoryId: "finishes",
    name: "Wall Panels",
    blurb: "Upholstered and paneled surfaces",
    choices: [
      { id: "wall-birch", name: "Birch Ply", hex: "#e2cba4", hex2: "#cdb389", price: 0 },
      { id: "wall-warm-white", name: "Warm White", hex: "#f2efe8", price: 0 },
      { id: "wall-sage", name: "Desert Sage", hex: "#9aa88f", price: 0 },
      { id: "wall-charcoal-felt", name: "Charcoal Felt", hex: "#45484d", price: 0 },
    ],
  },
  {
    id: "cabinets",
    categoryId: "finishes",
    name: "Cabinet Faces",
    blurb: "Powder-coated or hardwood fronts",
    choices: [
      { id: "cab-papago-navy", name: "Papago Navy", hex: "#303c47", price: 0 },
      { id: "cab-slate", name: "Slate Grey", hex: "#7d848b", price: 0 },
      { id: "cab-warm-white", name: "Warm White", hex: "#eeebe3", price: 0 },
      { id: "cab-walnut", name: "Walnut Veneer", hex: "#5f3f2b", hex2: "#7a5238", price: 0 },
    ],
  },
  {
    id: "counter",
    categoryId: "finishes",
    name: "Countertop",
    blurb: "Galley and dinette surfaces",
    choices: [
      { id: "counter-acacia", name: "Acacia Butcher Block", hex: "#b5834a", hex2: "#9a6c3a", price: 0 },
      { id: "counter-walnut", name: "Walnut Block", hex: "#6b4630", hex2: "#523425", price: 0 },
      { id: "counter-white-quartz", name: "White Quartz", hex: "#eceae5", price: 0 },
      { id: "counter-black", name: "Matte Black", hex: "#2f3133", price: 0 },
    ],
  },
];

export interface BuildPackage {
  id: string;
  name: string;
  tagline: string;
  priceDelta: number;
  /**
   * Which floor plans offer this trim package. Empty means every plan,
   * including any added later, which is what the admin's unticked state
   * saves.
   */
  floorPlanIds: string[];
  /** Option ids pre-selected when this package is chosen. */
  defaults: string[];
}

/**
 * One loaded catalog. Everything below takes this rather than reading module
 * constants, because the live catalog now comes out of Payload and only the
 * seed still uses the hardcoded copy. Ids are slugs in both, so the two are
 * interchangeable and a `?b=` link built against either one still resolves.
 */
export interface Catalog {
  categories: Category[];
  vanLengths: VanLength[];
  floorPlans: FloorPlan[];
  options: Option[];
  colorGroups: ColorGroup[];
  packages: BuildPackage[];
}

export function getVanLength(catalog: Catalog, id: string): VanLength | undefined {
  return catalog.vanLengths.find((v) => v.id === id);
}

/** The shortest van, which is what an old `?b=` link with no length means. */
export function defaultVanLength(catalog: Catalog): VanLength | undefined {
  return catalog.vanLengths[0];
}

export function lengthsFor(catalog: Catalog, floorPlanId: string): VanLength[] {
  const plan = getFloorPlan(catalog, floorPlanId);
  if (!plan?.availableLengths?.length) return catalog.vanLengths;
  return catalog.vanLengths.filter((v) => plan.availableLengths!.includes(v.id));
}

export function planFitsLength(
  catalog: Catalog,
  floorPlanId: string,
  vanLengthId: string,
): boolean {
  return lengthsFor(catalog, floorPlanId).some((v) => v.id === vanLengthId);
}

export function colorGroupsFor(catalog: Catalog, categoryId: string): ColorGroup[] {
  return catalog.colorGroups.filter((g) => g.categoryId === categoryId);
}

export function getColorChoice(
  catalog: Catalog,
  groupId: string,
  choiceId: string,
) {
  return catalog.colorGroups
    .find((g) => g.id === groupId)
    ?.choices.find((c) => c.id === choiceId);
}

/** First choice in each group is the no-cost default. */
export function defaultColors(catalog: Catalog): Record<string, string> {
  return Object.fromEntries(
    catalog.colorGroups
      .filter((g) => g.choices.length > 0)
      .map((g) => [g.id, g.choices[0].id]),
  );
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
export /*
 * Six categories, down from nine.
 *
 * The old nine were shaped like places in the van (Kitchen, Storage, Seating,
 * Miscellaneous) which meant a buyer had to guess which drawer a thing lived
 * in: a blackout blind was Miscellaneous, a roof fan was Heating/Cooling, a
 * light bar was Exterior. These six are shaped like systems instead, which is
 * how the shop quotes and how an owner thinks once they are living in it.
 *
 * Finishes stays because the four colour groups hang off it. Chassis is not
 * here: van length is step one of the wizard, before any of this.
 */
const CATEGORIES: Category[] = [
  {
    id: "electrical",
    name: "Electrical",
    blurb: "Solar, batteries, inverter and shore power. What keeps everything else running.",
  },
  {
    id: "water",
    name: "Water System",
    blurb: "Fresh and grey tanks, the pump, hot water and where you shower.",
  },
  {
    id: "climate",
    name: "Heating & Cooling",
    blurb: "Diesel heat, air conditioning, ventilation and insulation.",
  },
  {
    id: "interior",
    name: "Interior",
    blurb: "The galley, the bed, storage, windows and everything you touch daily.",
  },
  {
    id: "exterior",
    name: "Exterior",
    blurb: "Racks, awning, wheels, recovery gear and lighting.",
  },
  {
    id: "finishes",
    name: "Finishes",
    blurb: "Cabinetry, flooring, walls and countertops. How the van reads inside.",
  },
];

export const OPTIONS: Option[] = [
  // ---------------------------------------------------------------- Electricity
  {
    id: "elec-solar-400",
    categoryId: "electrical",
    thumb: "/products/elec-solar-400.webp",
    name: "400W Solar System",
    description: "30A Victron MPPT Smart Solar Charger with Bluetooth",
    type: "included",
    price: 0,
  },
  {
    id: "elec-dcdc-50",
    selectable: false,
    categoryId: "electrical",
    thumb: "/products/elec-dcdc-50.webp",
    name: "50A Victron Orion XS DC-DC Charger",
    description: "Smart battery charger with Bluetooth",
    type: "included",
    price: 0,
  },
  {
    id: "elec-battery-920",
    selectable: false,
    categoryId: "electrical",
    thumb: "/products/elec-battery-920.webp",
    name: "920Ah Epoch V2-T Elite Lithium System",
    description: "Heated LiFePO4 with Bluetooth monitoring",
    type: "included",
    price: 0,
  },
  {
    id: "elec-inverter",
    categoryId: "electrical",
    thumb: "/products/elec-inverter.webp",
    name: "Victron MultiPlus-II 3000W Inverter Charger",
    description: "Pure sine wave, with GX Touch 70 flush monitor",
    type: "included",
    price: 0,
  },
  {
    id: "elec-shore",
    categoryId: "electrical",
    thumb: "/products/elec-shore.webp",
    name: "30A Shore Power Smart Hookup",
    description: "110v outlets with USB A and C throughout",
    type: "included",
    price: 0,
  },
  {
    id: "elec-solar-600",
    categoryId: "electrical",
    thumb: "/products/elec-solar-600.webp",
    name: "Upgrade to 600W Solar",
    description: "With 50A MPPT Smart Solar Charger",
    type: "upgrade",
    price: 2_450,
    replaces: "elec-solar-400",
  },
  {
    id: "elec-dcdc-100",
    selectable: false,
    categoryId: "electrical",
    thumb: "/products/elec-dcdc-100.webp",
    name: "Upgrade to 100A DC-DC Charging",
    description: "Recharge twice as fast while driving",
    type: "upgrade",
    price: 1_280,
    replaces: "elec-dcdc-50",
  },
  {
    id: "elec-battery-1380",
    selectable: false,
    categoryId: "electrical",
    thumb: "/products/elec-battery-1380.webp",
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
    categoryId: "water",
    thumb: "/products/plumb-fresh-20.webp",
    name: "20 Gallon Fresh Water System",
    description: "Insulated tank with electric pump",
    type: "included",
    price: 0,
  },
  {
    id: "plumb-sink",
    categoryId: "water",
    thumb: "/products/plumb-sink.webp",
    name: "Undermount Stainless Sink",
    description: "Hot and cold water faucet",
    type: "included",
    price: 0,
  },
  {
    id: "plumb-fresh-33",
    categoryId: "water",
    thumb: "/products/plumb-fresh-33.webp",
    name: "Upgrade to 33 Gallon Fresh Water",
    description: "Stay out longer between fills",
    type: "upgrade",
    price: 1_150,
    replaces: "plumb-fresh-20",
  },
  {
    id: "plumb-shower-indoor",
    categoryId: "water",
    thumb: "/products/plumb-shower-indoor.webp",
    name: "Indoor Shower",
    description: "Tiled wet bath with teak floor insert",
    type: "addon",
    price: 7_800,
    conflictsWith: ["plumb-shower-outdoor"],
    availableFor: ["el-capitan", "olympus", "mammoth"],
  },
  {
    id: "plumb-shower-outdoor",
    categoryId: "water",
    thumb: "/products/plumb-shower-outdoor.webp",
    name: "Exterior Shower",
    description: "Rear-mounted hot and cold rinse station",
    type: "addon",
    price: 1_400,
    conflictsWith: ["plumb-shower-indoor"],
  },
  {
    id: "plumb-water-heater",
    categoryId: "water",
    thumb: "/products/plumb-water-heater.webp",
    name: "On-Demand Water Heater",
    description: "Endless hot water, propane-free",
    type: "addon",
    price: 2_650,
  },

  // ------------------------------------------------------------------- Climate
  {
    id: "climate-heater",
    categoryId: "climate",
    thumb: "/products/climate-heater.webp",
    name: "Diesel Air Heater",
    description: "Thermostat-controlled cabin heat",
    type: "included",
    price: 0,
  },
  {
    id: "climate-fan",
    categoryId: "climate",
    thumb: "/products/climate-fan.webp",
    name: "MaxxAir Roof Fan",
    description: "Reversible with rain cover",
    type: "included",
    price: 0,
  },
  {
    id: "climate-ac",
    categoryId: "climate",
    thumb: "/products/climate-ac.webp",
    name: "12V Air Conditioning",
    description: "Runs off the battery bank, no generator",
    type: "addon",
    price: 5_900,
  },
  {
    id: "climate-insulation",
    categoryId: "climate",
    thumb: "/products/climate-insulation.webp",
    name: "Premium Insulation Package",
    description: "Thinsulate and closed-cell throughout",
    type: "addon",
    price: 2_200,
  },
  {
    id: "climate-second-fan",
    categoryId: "climate",
    thumb: "/products/climate-second-fan.webp",
    name: "Second Roof Fan",
    description: "Cross-ventilation for hot climates",
    type: "addon",
    price: 1_100,
    availableFor: ["el-capitan", "olympus", "mammoth"],
  },

  // ------------------------------------------------------------------- Kitchen
  {
    id: "kitchen-counter",
    categoryId: "interior",
    thumb: "/products/kitchen-counter.webp",
    name: "Acacia Butcher Block Counter",
    description: "Sealed hardwood work surface",
    type: "included",
    price: 0,
  },
  {
    id: "kitchen-fridge-small",
    categoryId: "interior",
    thumb: "/products/kitchen-fridge-small.webp",
    name: "Under-Counter Refrigerator",
    description: "3.2 cu ft compressor fridge",
    type: "included",
    price: 0,
  },
  {
    id: "kitchen-cooktop-single",
    categoryId: "interior",
    thumb: "/products/kitchen-cooktop-single.webp",
    name: "Portable Single Induction Burner",
    description: "Stows away when not in use",
    type: "included",
    price: 0,
  },
  {
    id: "kitchen-fridge-tall",
    categoryId: "interior",
    thumb: "/products/kitchen-fridge-tall.webp",
    name: "Upgrade to Full-Height Refrigerator",
    description: "5.7 cu ft with separate freezer",
    type: "upgrade",
    price: 3_400,
    replaces: "kitchen-fridge-small",
    availableFor: ["el-capitan", "olympus", "mammoth"],
  },
  {
    id: "kitchen-cooktop-double",
    categoryId: "interior",
    thumb: "/products/kitchen-cooktop-double.webp",
    name: "Upgrade to Built-In Double Induction",
    description: "Flush-mounted two-burner cooktop",
    type: "upgrade",
    price: 1_850,
    replaces: "kitchen-cooktop-single",
  },
  {
    id: "kitchen-microwave",
    categoryId: "interior",
    thumb: "/products/kitchen-microwave.webp",
    name: "Convection Microwave",
    description: "Recessed into the upper cabinetry",
    type: "addon",
    price: 1_250,
  },

  // ------------------------------------------------------------------ Finishes
  {
    id: "aes-vinyl",
    categoryId: "finishes",
    thumb: "/products/aes-vinyl.webp",
    name: "Luxury Vinyl Plank Flooring",
    description: "Waterproof, matched to cabinetry",
    type: "included",
    price: 0,
  },
  {
    id: "aes-cabinetry-standard",
    categoryId: "finishes",
    thumb: "/products/aes-cabinetry-standard.webp",
    name: "Standard Cabinetry Finish",
    description: "Powder-coated aluminum frames",
    type: "included",
    price: 0,
  },
  {
    id: "aes-cabinetry-premium",
    categoryId: "finishes",
    thumb: "/products/aes-cabinetry-premium.webp",
    name: "Upgrade to Premium Hardwood Cabinetry",
    description: "Solid face frames with soft-close everything",
    type: "upgrade",
    price: 4_600,
    replaces: "aes-cabinetry-standard",
  },
  {
    id: "aes-backsplash",
    categoryId: "finishes",
    thumb: "/products/aes-backsplash.webp",
    name: "Tiled Backsplash",
    description: "Hand-set tile behind the galley",
    type: "addon",
    price: 1_300,
  },
  {
    id: "aes-ceiling",
    categoryId: "finishes",
    thumb: "/products/aes-ceiling.webp",
    name: "Slatted Wood Ceiling",
    description: "Warm cedar slat detail with integrated lighting",
    type: "addon",
    price: 2_400,
  },

  // ------------------------------------------------------------------- Storage
  {
    id: "storage-garage",
    categoryId: "interior",
    thumb: "/products/storage-garage.webp",
    name: "Rear Garage Storage",
    description: "Gear bay under the bed platform",
    type: "included",
    price: 0,
  },
  {
    id: "storage-overhead",
    categoryId: "interior",
    thumb: "/products/storage-overhead.webp",
    name: "Overhead Cabinets",
    description: "Latching doors rated for washboard roads",
    type: "included",
    price: 0,
  },
  {
    id: "storage-drawers",
    categoryId: "interior",
    thumb: "/products/storage-drawers.webp",
    name: "Heavy-Duty Slide-Out Drawers",
    description: "Full-extension, 500lb rated",
    type: "addon",
    price: 1_900,
  },
  {
    id: "storage-gear-wall",
    categoryId: "interior",
    thumb: "/products/storage-gear-wall.webp",
    name: "Modular Gear Wall",
    description: "Track system for bikes, skis, and boards",
    type: "addon",
    price: 1_450,
  },

  // ------------------------------------------------------------------ Sleeping
  {
    id: "sleep-fixed-bed",
    categoryId: "interior",
    thumb: "/products/sleep-fixed-bed.webp",
    name: "Fixed Rear Bed",
    description: "Permanent platform with memory foam mattress",
    type: "included",
    price: 0,
  },
  {
    id: "sleep-swivel",
    categoryId: "interior",
    thumb: "/products/sleep-swivel.webp",
    name: "Swivel Cab Seats",
    description: "Both front seats rotate into the living space",
    type: "included",
    price: 0,
  },
  {
    id: "sleep-bench",
    categoryId: "interior",
    thumb: "/products/sleep-bench.webp",
    name: "Convertible Dinette Bench",
    description: "Seats four, converts to a second bed",
    type: "addon",
    price: 3_200,
    availableFor: ["el-capitan", "olympus", "mammoth"],
  },
  {
    id: "sleep-pop-top",
    categoryId: "interior",
    thumb: "/products/sleep-pop-top.webp",
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
    thumb: "/products/ext-awning.webp",
    name: "Nomadic A2 Electric Awning",
    description: "With integrated LED lighting",
    type: "addon",
    price: 3_100,
  },
  {
    id: "ext-bumper",
    categoryId: "exterior",
    thumb: "/products/ext-bumper.webp",
    name: "FVCO Front Bumper with Bull Bar",
    description: "Recovery D-rings included",
    type: "addon",
    price: 2_950,
  },
  {
    id: "ext-winch",
    categoryId: "exterior",
    thumb: "/products/ext-winch.webp",
    name: "Warn 12s Winch with Wireless Remote",
    description: "Requires the FVCO front bumper",
    type: "addon",
    price: 2_400,
    requires: ["ext-bumper"],
  },
  {
    id: "ext-platform",
    categoryId: "exterior",
    thumb: "/products/ext-platform.webp",
    name: "FVCO Rear Door Platform",
    description: "Mounting base for tire carrier and storage",
    type: "addon",
    price: 1_750,
  },
  {
    id: "ext-storage-box",
    categoryId: "exterior",
    thumb: "/products/ext-storage-box.webp",
    name: "FVCO Rear Storage Box",
    description: "Requires the rear door platform",
    type: "addon",
    price: 1_200,
    requires: ["ext-platform"],
  },
  {
    id: "ext-wheels",
    categoryId: "exterior",
    thumb: "/products/ext-wheels.webp",
    name: "All-Terrain Wheels and Tires Package",
    description: "Load-rated for a fully built van",
    type: "addon",
    price: 4_300,
  },
  {
    id: "ext-lights",
    categoryId: "exterior",
    thumb: "/products/ext-lights.webp",
    name: "Morimoto BigBanger 7 Pod Light Bar",
    description: "Front-mounted auxiliary lighting",
    type: "addon",
    price: 1_650,
  },

  // ---------------------------------------------------------------------- Misc
  {
    id: "misc-windows",
    categoryId: "interior",
    thumb: "/products/misc-windows.webp",
    name: "Solid Glass Rear Cargo Door Windows",
    description: "Factory-look glass in the rear doors",
    type: "addon",
    price: 1_850,
  },
  {
    id: "misc-blackout",
    categoryId: "interior",
    thumb: "/products/misc-blackout.webp",
    name: "Magnetic Blackout Window Covers",
    description: "Van Essential insulated package",
    type: "addon",
    price: 890,
  },
  {
    id: "misc-screen",
    categoryId: "interior",
    thumb: "/products/misc-screen.webp",
    name: "Slider Door Bug Screen",
    description: "Magnetic closure, full height",
    type: "addon",
    price: 450,
  },
  {
    id: "misc-starlink",
    categoryId: "interior",
    thumb: "/products/misc-starlink.webp",
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
const PACKAGE_TIERS: Omit<BuildPackage, "id" | "floorPlanIds">[] = [
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

export function getPackages(catalog: Catalog, floorPlanId: string): BuildPackage[] {
  return catalog.packages.filter(
    (p) => p.floorPlanIds.length === 0 || p.floorPlanIds.includes(floorPlanId),
  );
}

export function isAvailable(option: Option, floorPlanId: string): boolean {
  return !option.availableFor?.length || option.availableFor.includes(floorPlanId);
}

export function getOption(catalog: Catalog, id: string): Option | undefined {
  return catalog.options.find((o) => o.id === id);
}

export function optionsFor(
  catalog: Catalog,
  categoryId: string,
  floorPlanId: string,
): Option[] {
  return catalog.options.filter(
    (o) => o.categoryId === categoryId && isAvailable(o, floorPlanId),
  );
}

/**
 * The options a buyer is actually asked about.
 *
 * optionsFor() still returns everything, because the Build Sheet, the pricing
 * engine and the rules engine all need the full set. Only the wizard's
 * category steps narrow to this one.
 */
export function selectableOptionsFor(
  catalog: Catalog,
  categoryId: string,
  floorPlanId: string,
): Option[] {
  return optionsFor(catalog, categoryId, floorPlanId).filter(
    (o) => o.selectable !== false,
  );
}

export function getFloorPlan(catalog: Catalog, id: string): FloorPlan | undefined {
  return catalog.floorPlans.find((p) => p.id === id);
}

/**
 * The hardcoded catalog, as a Catalog. Only the seed reads this now. Packages
 * are expanded per floor plan, with each plan's defaults filtered down to
 * options that actually fit it.
 */
/*
 * Owner pricing, 2026-09-24: the 144 is the $180,000 base, the 170 adds
 * $12,000 and the 170 EXT adds $20,000.
 *
 * Names lead with what the length gets you rather than the wheelbase, because
 * nobody arrives at a van site knowing they want 170 inches. The spec is the
 * tagline underneath.
 */
const VAN_LENGTHS: VanLength[] = [
  {
    id: "sprinter-144",
    name: "Fits A Standard Garage",
    tagline: '144" wheelbase, for solo travelers and couples',
    priceDelta: 0,
    image: "/vanlengths/sprinter-144.webp",
    overallInches: 233.5,
  },
  {
    id: "sprinter-170",
    name: "The Sweet Spot",
    tagline: '170" wheelbase, room for a fixed bed and a full bathroom',
    priceDelta: 12000,
    image: "/vanlengths/sprinter-170.webp",
    overallInches: 274,
  },
  {
    id: "sprinter-170-ext",
    name: "Maximum Space",
    tagline: '170" extended, for families and full-time living',
    priceDelta: 20000,
    image: "/vanlengths/sprinter-170-ext.webp",
    overallInches: 290,
  },
];

export const HARDCODED_CATALOG: Catalog = {
  categories: CATEGORIES,
  vanLengths: VAN_LENGTHS,
  floorPlans: FLOOR_PLANS,
  options: OPTIONS,
  colorGroups: COLOR_GROUPS,
  packages: FLOOR_PLANS.flatMap((plan) =>
    PACKAGE_TIERS.map((tier) => ({
      ...tier,
      id: `${plan.id}--${tier.name.toLowerCase()}`,
      floorPlanIds: [plan.id],
      defaults: tier.defaults.filter((optionId) => {
        const option = OPTIONS.find((o) => o.id === optionId);
        return option ? isAvailable(option, plan.id) : false;
      }),
    })),
  ),
};
