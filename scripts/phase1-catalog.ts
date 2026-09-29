/**
 * Phase 1 of the streamlined builder (owner, 2026-09-28).
 *
 *   npx tsx scripts/phase1-catalog.ts
 *
 * Four floor plans (Rainier deleted, Mammoth renamed McKinley), three vans in
 * two wheelbases each, and one included list taken from the El Capitan 170 +
 * 144 pricing sheet. No trim packages and no upgrades yet: every plan ships
 * the same items, and the long van gets its own few (400W solar, hydronic hot
 * water, five overhead cabinets).
 *
 * Pricing: the van is $75,000 on every row, a typical dealer price, because
 * buyers buy it from the dealer. The conversion is the sheet's price, $162,000
 * on a short van and $170,000 on a long one.
 *
 * Brands and models come from the sheet or from Papago's own site. Anything
 * neither names is left blank for the shop to fill in; no model number here
 * is a guess. Re-runnable: it matches on slug.
 *
 * Back up first: npm run backup. This deletes every trim package and every
 * product that is not on this list.
 */
import { createRequire } from "module";

createRequire(import.meta.url)("@next/env").loadEnvConfig(process.cwd());
const { getPayload } = await import("payload");
const { default: config } = await import("../payload.config.ts");
const payload = await getPayload({ config });

const VAN_PRICE = 75_000;
/* Per make, where the owner has set one (2026-09-29: Transit $57,000,
   ProMaster $56,000). The Sprinter stays on the $75,000 average. */
const VAN_PRICES: Record<string, number> = { transit: 57_000, promaster: 56_000 };
const SHORT_CONVERSION = 162_000;
const LONG_EXTRA = 170_000 - SHORT_CONVERSION;

const VANS = [
  { slug: "sprinter-144", make: "sprinter", size: "short", wheelbase: 144, overallInches: 233.5, name: "Easy To Park", tagline: "Fits most driveways, for solo travelers and couples" },
  { slug: "sprinter-170", make: "sprinter", size: "long", wheelbase: 170, overallInches: 274, name: "Room To Spread Out", tagline: "More floor, more solar and more overhead storage" },
  { slug: "transit-148", make: "transit", size: "long", wheelbase: 148, overallInches: 235.5, name: "Room To Spread Out", tagline: "More floor, more solar and more overhead storage" },
  { slug: "promaster-136", make: "promaster", size: "short", wheelbase: 136, overallInches: 213, name: "Easy To Park", tagline: "Tight turning and easy parking" },
  { slug: "promaster-159", make: "promaster", size: "long", wheelbase: 159, overallInches: 236, name: "Room To Spread Out", tagline: "More floor, more solar and more overhead storage" },
] as const;

type Item = {
  slug: string;
  cat: "electrical" | "water" | "climate" | "interior" | "exterior";
  name: string;
  mfr?: string;
  model?: string;
  sizes?: ("short" | "long")[];
  /** Filename of an image already in the Media library. Looked at before reuse. */
  img?: string;
  what: string;
  why: string;
};

const ITEMS: Item[] = [
  // ELECTRICAL
  { slug: "inc-solar-400", cat: "electrical", name: "400W Solar System", sizes: ["long"], img: "elec-solar-400.webp",
    what: "Roof-mounted solar panels rated at 400 watts, wired to charge the house batteries.",
    why: "Every sunny hour tops the batteries back up, so you can stay parked off-grid for days instead of hunting for a plug." },
  { slug: "inc-solar-200", cat: "electrical", name: "200W Solar System", sizes: ["short"], img: "elec-solar-400.webp",
    what: "Roof-mounted solar panels rated at 200 watts, sized to the roof on the shorter van.",
    why: "Every sunny hour tops the batteries back up, so you can stay parked off-grid for days instead of hunting for a plug." },
  { slug: "inc-dcdc", cat: "electrical", name: "50A DC-DC Battery Charger", mfr: "Victron Energy", model: "Orion XS 50A", img: "elec-dcdc-50.webp",
    what: "Charges the house batteries from the van's alternator while you drive, at up to 50 amps.",
    why: "A few hours on the road refills the batteries even on a cloudy day, without draining the van's own starting battery." },
  { slug: "inc-battery", cat: "electrical", name: "920Ah Lithium Iron Phosphate Battery", mfr: "Epoch Batteries", model: "V2-T Elite", // the old photo was a Victron battery; needs an Epoch one
    what: "920 amp-hours of lithium iron phosphate battery storage, the house power for everything in the van.",
    why: "Enough stored power to run the fridge, lights, fans, cooktop and laptops for days, in a stable battery chemistry that lasts thousands of charges." },
  { slug: "inc-inverter", cat: "electrical", name: "3000W Inverter/Charger", mfr: "Victron Energy", model: "MultiPlus-II 3000", // the old photo was the older MultiPlus; needs a MultiPlus-II
    what: "Turns battery power into 110-volt household power, up to 3,000 watts, and charges the batteries when you plug in. UL rated, pure sine wave.",
    why: "It runs the microwave, the induction cooktop and anything else with a normal plug, with clean power that is safe for laptops and cameras." },
  { slug: "inc-booster", cat: "electrical", name: "Cell Signal Booster", mfr: "weBoost", model: "Drive X",
    what: "An outside antenna and an amplifier that pull in a weak cell signal and repeat it inside the van.",
    why: "One bar outside becomes a usable signal inside, for calls, maps and working from the road." },
  { slug: "inc-outlets", cat: "electrical", name: "110V Outlets with USB-A and USB-C",
    what: "Four 110-volt outlets with USB-A and USB-C ports, plus dedicated outlets for the induction cooktop and the microwave.",
    why: "Charge phones and laptops where you actually use them, with no extension cords across the counter." },
  { slug: "inc-gfci", cat: "electrical", name: "GFCI Outlets",
    what: "A 110-volt outlet with ground fault protection, and a second one in the equipment compartment.",
    why: "It cuts the power in a fraction of a second if water and electricity meet, which matters in a van with a sink and a shower." },
  { slug: "inc-shore", cat: "electrical", name: "30A Shore Power Inlet", img: "elec-shore.webp",
    what: "An outside plug for campground or driveway power, rated at 30 amps.",
    why: "Plug in at a campsite or at home and the whole van runs on grid power while the batteries charge." },

  // WATER SYSTEM
  { slug: "inc-fresh-water", cat: "water", name: "33-Gallon Fresh Water Tank", img: "plumb-fresh-33.webp",
    what: "A 33-gallon fresh water tank that sits over the wheel well, insulated with Havelock wool.",
    why: "Enough water for several days of cooking, dishes and showers, kept inside the insulated van where it is protected from the cold." },
  { slug: "inc-water-sensor", cat: "water", name: "Water Level Sensor",
    what: "A sensor that reads how full the fresh water tank is.",
    why: "You see how much water is left before you run dry, not after." },
  { slug: "inc-grey-water", cat: "water", name: "11-Gallon Grey Water Tank",
    what: "An 11-gallon tank that holds the water from the sink and shower until you can empty it.",
    why: "It keeps used water off the ground, which campgrounds and most public land require." },
  { slug: "inc-toilet", cat: "water", name: "Dry Flush Toilet", mfr: "Laveo by Dry Flush",
    what: "A waterless toilet that seals each use in a leak-proof bag inside a replaceable cartridge. White, with a black cover.",
    why: "No black tank to dump and no smell, and it uses no water, so the fresh tank lasts longer." },
  { slug: "inc-shower", cat: "water", name: "Tiled Indoor Shower", img: "plumb-shower-indoor.webp",
    what: "A fully tiled shower inside the van, with hot and cold water.",
    why: "A dusty trail day ends clean, inside and out of the weather." },
  { slug: "inc-hydronic-water", cat: "water", name: "Hydronic Hot Water", mfr: "Rixen's Enterprises", sizes: ["long"],
    what: "Heats the van's water with the same hydronic system that warms the cabin.",
    why: "Hot water for the shower and the sink without a separate water heater taking up space." },
  { slug: "inc-water-heater", cat: "water", name: "4-Gallon Electric Water Heater", sizes: ["short"],
    what: "A 4-gallon electric tank water heater.",
    why: "Hot water for dishes and a quick shower, heated by the battery system or shore power." },
  { slug: "inc-outdoor-shower", cat: "water", name: "Rear-Door Outdoor Shower", img: "plumb-shower-outdoor.webp",
    what: "A shower head with hot and cold water at the rear doors.",
    why: "Rinse off sand, mud or the dog before anyone climbs inside." },

  // HEATING & COOLING
  { slug: "inc-insulation", cat: "climate", name: "Premium Insulation Package", mfr: "Havelock Wool", img: "climate-insulation.webp",
    what: "Natural sheep's wool insulation throughout the van, with no foam on the water lines.",
    why: "Wool keeps the van warmer in winter and cooler in summer, handles condensation well and cuts road noise." },
  { slug: "inc-roof-fan", cat: "climate", name: "Roof Vent Fan with Remote", mfr: "MAXXAIR", model: "MaxxFan Deluxe", img: "climate-fan.webp",
    what: "A roof fan that pulls stale air out or fresh air in, with a hood so it can run in the rain.",
    why: "It clears cooking smells and moisture, and on many nights it is all the cooling you need." },
  { slug: "inc-ac", cat: "climate", name: "12V Roof Air Conditioner with Remote", mfr: "Nomadic Cooling", model: "X2", img: "climate-ac.webp",
    what: "A roof-mounted air conditioner that runs on the 12-volt battery system.",
    why: "Cool air on a hot afternoon without a generator or a campground hookup." },
  { slug: "inc-hydronic-heat", cat: "climate", name: "Hydronic Heating", mfr: "Rixen's Enterprises",
    what: "A hydronic heater that warms the cabin with heated fluid, burning the van's own fuel.",
    why: "Dry, even heat on cold mornings, off-grid, with no propane tank on board." },

  // INTERIOR: kitchen
  { slug: "inc-cooktop", cat: "interior", name: "Double Induction Cooktop", mfr: "Empava",
    what: "A two-burner induction cooktop set into the counter.",
    why: "Fast, precise cooking on battery power, with no open flame and no propane." },
  { slug: "inc-sink", cat: "interior", name: "Undermount Sink and Faucet", img: "plumb-sink.webp",
    what: "An undermount sink with a hot and cold faucet.",
    why: "Real dishes in hot water, and a flat counter that wipes clean." },
  { slug: "inc-cutting-board", cat: "interior", name: "Sink Insert Cutting Board",
    what: "A cutting board that drops into the sink.",
    why: "Covers the sink and turns it into more counter while you prep." },
  { slug: "inc-popup-counter", cat: "interior", name: "Pop-Up End Counter",
    what: "A counter extension on a black folding bracket at the end of the galley.",
    why: "Extra prep space when you need it, folded away when you need the aisle." },
  { slug: "inc-door-table", cat: "interior", name: "Fold-Down Table at the Sliding Door",
    what: "A table that folds down outside the sliding door.",
    why: "An outdoor counter for coffee, cooking or a laptop, right where the view is." },
  { slug: "inc-microwave", cat: "interior", name: "700W Microwave",
    what: "A 700-watt microwave in black, with its own outlet in the overhead cabinet.",
    why: "Reheat dinner or a coffee in a minute, powered by the inverter." },
  { slug: "inc-fridge", cat: "interior", name: "Refrigerator with Freezer", mfr: "Isotherm", model: "Freeline 140",
    what: "A 12-volt refrigerator with a freezer section.",
    why: "Keeps food cold for the whole trip on little battery power, so there is no ice to buy every day." },
  // INTERIOR: finishes
  { slug: "inc-ceiling", cat: "interior", name: "Wood Slat Panel Ceiling", mfr: "The Wood Veneer Hub", img: "aes-ceiling.webp",
    what: "A wood veneer slat panel ceiling.",
    why: "It feels like a cabin, and the slats help soak up road noise." },
  { slug: "inc-ceiling-lights", cat: "interior", name: "Recessed LED Ceiling Lights",
    what: "Two lens-covered LED strips running the length of the ceiling, recessed into the slats.",
    why: "Even light from end to end with no fixtures to bump your head on." },
  { slug: "inc-flooring", cat: "interior", name: "Wood-Look Vinyl Flooring", img: "aes-vinyl.webp",
    what: "Vinyl flooring with a wood grain look.",
    why: "It takes sand, snow and wet boots, cleans with a wipe and still looks warm." },
  { slug: "inc-cabinetry", cat: "interior", name: "Baltic Birch Cabinetry", mfr: "Papago Vans, built in Mesa", img: "aes-cabinetry-standard.webp",
    what: "Cabinets CNC cut from Baltic birch plywood, then laminated and edge banded in our shop.",
    why: "Baltic birch is strong and light and holds a screw, which keeps cabinets tight on washboard roads." },
  // INTERIOR: storage
  { slug: "inc-overhead-5", cat: "interior", name: "Overhead Cabinets (5)", sizes: ["long"], img: "storage-overhead.webp",
    what: "Five overhead cabinets, with LED strip lighting in recessed slots underneath.",
    why: "Clothes, food and gear up high and off the floor, with light on the counter below." },
  { slug: "inc-overhead-3", cat: "interior", name: "Overhead Cabinets (3)", sizes: ["short"], img: "storage-overhead.webp",
    what: "Three overhead cabinets, with LED strip lighting in recessed slots underneath.",
    why: "Clothes, food and gear up high and off the floor, with light on the counter below." },
  { slug: "inc-cabinet-double", cat: "interior", name: "Under-Counter Double-Door Cabinet",
    what: "A double-door cabinet under the counter, 20 by 36 inches.",
    why: "Room for pots, pans and pantry food right where you cook." },
  { slug: "inc-cabinet-drawers", cat: "interior", name: "Under-Counter Drawer Cabinet",
    what: "A drawer cabinet under the counter, 20 by 15 inches.",
    why: "Utensils and small things stay sorted instead of rattling around." },
  { slug: "inc-cabinet-storage", cat: "interior", name: "Under-Counter Storage Cabinet",
    what: "A storage cabinet under the counter, 20 by 15 inches.",
    why: "More closed storage in the galley for the things you reach for every day." },
  { slug: "inc-closet", cat: "interior", name: "Floor-to-Ceiling Closet",
    what: "A 12-inch-wide closet with shelves and a hanging rod.",
    why: "Jackets and good clothes hang up instead of living in a duffel." },
  { slug: "inc-bench", cat: "interior", name: "Bench Seat with Storage", img: "sleep-bench.webp",
    what: "A bench seat with storage inside.",
    why: "Seating for meals, and a place to stow gear under the cushion." },
  // INTERIOR: living
  { slug: "inc-bed", cat: "interior", name: "Queen Memory Foam Mattress",
    what: "A queen-size memory foam mattress, 6 inches thick.",
    why: "A real bed you do not make up every night, and a real night's sleep." },
  { slug: "inc-swivel-seats", cat: "interior", name: "Swivel Driver and Passenger Seats", img: "sleep-swivel.webp",
    what: "Front seats that swivel around to face the living area.",
    why: "Two more seats at the table when you are parked, at no cost in floor space." },
  { slug: "inc-table", cat: "interior", name: "Swivel Table", mfr: "Lagun",
    what: "An adjustable table on a Lagun mount that swivels and moves, with black hardware.",
    why: "It swings to the front seats or the bench, or out of the way." },
  { slug: "inc-window-driver", cat: "interior", name: "Driver-Side T-Vent Window",
    what: "A full-size window on the driver side with a T-vent that opens.",
    why: "Daylight, a view and a cross breeze with the roof fan." },
  { slug: "inc-window-slider", cat: "interior", name: "Sliding Door T-Vent Window",
    what: "A T-vent window in the passenger sliding door.",
    why: "Fresh air and a view on the door side, even with the door shut." },
  { slug: "inc-window-rear", cat: "interior", name: "Solid Glass Rear Door Windows", img: "misc-windows.webp",
    what: "Solid glass windows in both rear cargo doors.",
    why: "Light and a view out the back, including from the bed." },
  { slug: "inc-extinguisher", cat: "interior", name: "Fire Extinguisher",
    what: "A mounted fire extinguisher.",
    why: "Basic safety gear, mounted where you can reach it." },
  { slug: "inc-co-smoke", cat: "interior", name: "Carbon Monoxide and Smoke Detector",
    what: "A combined carbon monoxide and smoke alarm.",
    why: "It wakes you if there is smoke, or if a heater or engine problem puts carbon monoxide in the cabin." },

  // EXTERIOR
  { slug: "inc-roof-rack", cat: "exterior", name: "Safari Roof Rack with Deck and Ladder", mfr: "FVCO",
    what: "A roof rack with a roof-top deck and a side ladder.",
    why: "Carry boards, boxes or chairs up top, and climb up for the view or to clean the solar panels." },
  { slug: "inc-light-bar", cat: "exterior", name: "Roof Rack Light Bar", mfr: "KC HiLiTES",
    what: "An LED light bar mounted to the roof rack.",
    why: "Lights up a campsite or a dark forest road well past the headlights." },
  { slug: "inc-bumper-winch", cat: "exterior", name: "Front Bumper with Winch", mfr: "CA Tuned (bumper), WARN (winch)", model: "12S winch", img: "ext-winch.webp",
    what: "A steel front bumper with a WARN 12S winch, a wireless remote and black D-rings.",
    why: "Pull yourself, or someone else, out of sand or mud, and protect the front of the van on rough trails." },
  { slug: "inc-bumper-lights", cat: "exterior", name: "Bumper-Mounted Lights (pair)", mfr: "KC HiLiTES",
    what: "Two KC lights mounted on the front bumper.",
    why: "Wide light close in, where the roof light bar does not reach." },
  { slug: "inc-fender-flares", cat: "exterior", name: "Paint-Matched Fender Flares",
    what: "Fender flares painted to match the van.",
    why: "They cover the wider all-terrain tires and keep rocks and mud off the paint." },
  { slug: "inc-awning", cat: "exterior", name: "Electric Awning with LED Light", img: "ext-awning.webp",
    what: "A power awning with a built-in LED light.",
    why: "Shade and rain cover outside the sliding door at the push of a button, with light for the evening." },
  { slug: "inc-wheels", cat: "exterior", name: "All-Terrain Wheels and Tires (5)", img: "ext-wheels.webp",
    what: "Five all-terrain wheels and tires, spare included.",
    why: "Grip on dirt, gravel and snow, and a matching spare for when a trail bites back." },
  { slug: "inc-fender-kit", cat: "exterior", name: "No-Rub Front Fender Kit",
    what: "A kit that gives the front fenders extra clearance.",
    why: "The bigger tires turn all the way without rubbing." },
  { slug: "inc-tire-carrier", cat: "exterior", name: "Spare Tire Carrier", mfr: "Lost Saguaro",
    what: "A spare tire carrier on the rear of the van.",
    why: "The full-size spare rides where you can reach it, not under the van." },
  { slug: "inc-bike-carrier", cat: "exterior", name: "Bike Carrier", mfr: "Owl Vans", model: "B2",
    what: "A rear carrier with horizontal bike bars. Bike trays are not included.",
    why: "Bikes ride on the outside, not on your bed." },
  { slug: "inc-rear-box", cat: "exterior", name: "Rear Storage Box", mfr: "Owl Vans", model: "Monster Box",
    what: "A storage box mounted on the rear, directly below the bike bars.",
    why: "Outside storage for the muddy, wet or smelly gear you do not want inside." },
  { slug: "inc-power-steps", cat: "exterior", name: "Power Running Boards", mfr: "AMP Research", model: "PowerStep",
    what: "Electric running boards that drop down when a door opens and tuck away when it closes.",
    why: "An easy step into a lifted van, with nothing hanging low to catch on rocks when you drive." },
];

/*
 * Systems (owner, 2026-09-29): one card per system on What's Included, its
 * parts listed in the drawer. A system is a product itself; its parts point
 * at it with Part of. Staff can regroup in the admin.
 */
const SYSTEMS: { slug: string; cat: Item["cat"]; name: string; img: string; what: string; why: string; parts: string[] }[] = [
  { slug: "sys-solar-power", cat: "electrical", name: "Solar & Power System", img: "elec-solar-400.webp",
    what: "Solar panels, a lithium battery bank, an inverter and the charging to tie it together, wired into 110-volt outlets through the van.",
    why: "It runs the fridge, lights, fans, cooktop and laptops for days with no hookup, and tops itself up from the sun, the engine or a campground plug.",
    parts: ["inc-solar-400", "inc-solar-200", "inc-dcdc", "inc-battery", "inc-inverter", "inc-outlets", "inc-gfci", "inc-shore"] },
  { slug: "sys-water", cat: "water", name: "Fresh & Grey Water System", img: "plumb-fresh-33.webp",
    what: "A fresh water tank with a level sensor, and a grey tank that holds what drains from the sink and shower.",
    why: "Days of water for cooking, dishes and showers, and nothing dumped on the ground where it is not allowed.",
    parts: ["inc-fresh-water", "inc-water-sensor", "inc-grey-water"] },
  { slug: "sys-bathroom", cat: "water", name: "Bathroom", img: "plumb-shower-indoor.webp",
    what: "A tiled indoor shower with hot and cold water, and a waterless dry flush toilet.",
    why: "A real shower and toilet inside the van, so there is no hunting for a campground bathroom.",
    parts: ["inc-toilet", "inc-shower"] },
  { slug: "sys-galley", cat: "interior", name: "Galley Kitchen", img: "popup-counter.webp",
    what: "An induction cooktop, sink and faucet, refrigerator with freezer and microwave, with a cutting board insert, pop-up counter and a fold-down table at the door.",
    why: "Cook a real meal on battery power, with counter space where you need it and food that stays cold for the whole trip.",
    parts: ["inc-cooktop", "inc-sink", "inc-cutting-board", "inc-popup-counter", "inc-door-table", "inc-microwave", "inc-fridge"] },
  { slug: "sys-finishes", cat: "interior", name: "Ceiling, Lighting & Floor", img: "aes-ceiling.webp",
    what: "A wood slat ceiling with LED strips recessed in it, over wood-look vinyl flooring.",
    why: "It feels like a cabin, lights evenly end to end, and the floor takes sand and wet boots.",
    parts: ["inc-ceiling", "inc-ceiling-lights", "inc-flooring"] },
  { slug: "sys-storage", cat: "interior", name: "Cabinets & Storage", img: "storage-overhead.webp",
    what: "Baltic birch cabinetry built in our shop: overhead cabinets, under-counter cabinets and drawers, a floor-to-ceiling closet and a bench with storage.",
    why: "A place for everything, shut tight on washboard roads, so the van stays livable instead of piled up.",
    parts: ["inc-cabinetry", "inc-overhead-5", "inc-overhead-3", "inc-cabinet-double", "inc-cabinet-drawers", "inc-cabinet-storage", "inc-closet", "inc-bench"] },
  { slug: "sys-windows", cat: "interior", name: "Windows", img: "misc-windows.webp",
    what: "A driver-side T-vent window, a T-vent window in the sliding door and solid glass in both rear doors.",
    why: "Daylight, views and a cross breeze with the roof fan.",
    parts: ["inc-window-driver", "inc-window-slider", "inc-window-rear"] },
  { slug: "sys-safety", cat: "interior", name: "Safety Gear", img: "",
    what: "A mounted fire extinguisher and a combined carbon monoxide and smoke alarm.",
    why: "The basics every RV should carry, mounted where you can reach them.",
    parts: ["inc-extinguisher", "inc-co-smoke"] },
  { slug: "sys-front", cat: "exterior", name: "Front Bumper, Winch & Lights", img: "ext-winch.webp",
    what: "A steel front bumper with a WARN winch and wireless remote, and a pair of KC lights mounted on it.",
    why: "Pull yourself out of sand or mud, protect the front of the van, and light the trail close in.",
    parts: ["inc-bumper-winch", "inc-bumper-lights"] },
  { slug: "sys-roof", cat: "exterior", name: "Roof Rack & Light Bar", img: "roof-rack.webp",
    what: "A safari roof rack with a roof-top deck and side ladder, and a KC light bar mounted on it.",
    why: "Carry gear up top, climb up for the view, and light a campsite well past the headlights.",
    parts: ["inc-roof-rack", "inc-light-bar"] },
  { slug: "sys-wheels", cat: "exterior", name: "Wheels, Tires & Fenders", img: "ext-wheels.webp",
    what: "Five all-terrain wheels and tires, paint-matched fender flares and a no-rub front fender kit.",
    why: "Grip on dirt, gravel and snow, with the clearance to turn the bigger tires all the way.",
    parts: ["inc-wheels", "inc-fender-flares", "inc-fender-kit"] },
  { slug: "sys-rear", cat: "exterior", name: "Rear Carriers", img: "bike-carrier.webp",
    what: "A spare tire carrier, a bike carrier and a storage box on the rear of the van.",
    why: "The spare, the bikes and the muddy gear ride outside, not on your bed.",
    parts: ["inc-tire-carrier", "inc-bike-carrier", "inc-rear-box"] },
];

const bySlug = async (collection: string, slug: string) =>
  (await payload.find({ collection: collection as any, where: { slug: { equals: slug } }, limit: 1, depth: 0 })).docs[0] as any;

// 1. Trim packages and old products go; nothing in Phase 1 uses them.
for (const p of (await payload.find({ collection: "trim-packages", pagination: false, depth: 0 })).docs)
  await payload.delete({ collection: "trim-packages", id: p.id });
const keep = new Set([...ITEMS.map((i) => i.slug), ...SYSTEMS.map((x) => x.slug)]);
for (const p of (await payload.find({ collection: "products", pagination: false, depth: 0 })).docs as any[])
  if (!keep.has(p.slug)) await payload.delete({ collection: "products", id: p.id });

// 2. Floor plans: four, same conversion price.
const rainier = await bySlug("floor-plans", "rainier");
if (rainier) await payload.delete({ collection: "floor-plans", id: rainier.id });
for (const p of (await payload.find({ collection: "floor-plans", pagination: false, depth: 0 })).docs as any[]) {
  await payload.update({
    collection: "floor-plans",
    id: p.id,
    data: {
      basePrice: SHORT_CONVERSION,
      ...(p.slug === "mammoth" ? { name: "McKinley" } : {}),
      availableLengths: [],
      // Layout facts only (owner, 2026-09-28): how many it sleeps, the shower,
      // the bed. No battery or tank sizes; those live in What's Included.
      // Sleeps is each layout's own. Shower and bed come from the shared list.
      specs: [
        ...(p.specs ?? []).filter((sp: any) => /sleep/i.test(sp.label)),
        { label: "Shower", value: "Indoor + outdoor" },
        { label: "Bed", value: "Queen" },
      ],
    },
  });
}

// 3. Vans.
// Retired: no extended bodies, and no Transit 130, which Ford builds only as
// a low roof (owner, 2026-09-29: high roof or nothing).
for (const gone of ["sprinter-170-ext", "transit-130"]) {
  const v = await bySlug("van-lengths", gone);
  if (v) await payload.delete({ collection: "van-lengths", id: v.id });
}
for (const [order, v] of VANS.entries()) {
  const data = { ...v, order, vanPrice: VAN_PRICES[v.make] ?? VAN_PRICE, priceDelta: v.size === "long" ? LONG_EXTRA : 0 };
  const found = await bySlug("van-lengths", v.slug);
  if (found) await payload.update({ collection: "van-lengths", id: found.id, data });
  else await payload.create({ collection: "van-lengths", data });
}

// 4. The included list.
const catId: Record<string, number> = {};
for (const c of (await payload.find({ collection: "categories", pagination: false, depth: 0 })).docs as any[]) catId[c.slug] = c.id;
const mediaId: Record<string, number> = {};
for (const m of (await payload.find({ collection: "media", pagination: false, depth: 0 })).docs as any[]) mediaId[m.filename] = m.id;

for (const item of ITEMS) {
  if (item.img && !mediaId[item.img]) throw new Error(`No media named ${item.img}`);
  const data = {
    name: item.name,
    slug: item.slug,
    category: catId[item.cat],
    type: "included" as const,
    price: 0,
    selectable: true,
    ...(item.mfr ? { manufacturer: item.mfr } : {}),
    ...(item.model ? { modelNumber: item.model } : {}),
    whatItIs: item.what,
    whyYouNeedIt: item.why,
    sizes: item.sizes ?? [],
    // Only set a photo the list names. Photos added later in the admin (or by
    // scripts/phase1-photos.ts) are left alone on a re-run.
    ...(item.img ? { image: mediaId[item.img] } : {}),
  };
  const found = await bySlug("products", item.slug);
  if (found) await payload.update({ collection: "products", id: found.id, data });
  else await payload.create({ collection: "products", data });
}

// 5. Systems, and the parts that belong to each.
for (const sys of SYSTEMS) {
  const data = {
    name: sys.name, slug: sys.slug, category: catId[sys.cat], type: "included" as const, price: 0, selectable: true,
    whatItIs: sys.what, whyYouNeedIt: sys.why, sizes: [],
    ...(sys.img && mediaId[sys.img] ? { image: mediaId[sys.img] } : {}),
  };
  const found = await bySlug("products", sys.slug);
  const id = found ? (await payload.update({ collection: "products", id: found.id, data })).id : (await payload.create({ collection: "products", data })).id;
  for (const part of sys.parts) {
    const p = await bySlug("products", part);
    if (!p) throw new Error(`system ${sys.slug}: no part ${part}`);
    await payload.update({ collection: "products", id: p.id, data: { partOf: id } });
  }
}

console.log(`${SYSTEMS.length} systems`);
console.log(`${VANS.length} vans, ${ITEMS.length} included items, conversion $${SHORT_CONVERSION} short / $${SHORT_CONVERSION + LONG_EXTRA} long, van $${VAN_PRICE}`);
process.exit(0);
