/*
 * Self-check for Phase 1 pricing and the included list.
 *
 *   npx tsx scripts/check-pricing.ts
 *
 * What must hold: a build is the van's dealer price plus the conversion, the
 * long van adds its conversion extra and nothing else, each van size gets its
 * own included items, and a link shared before any of this still resolves.
 */
import assert from "node:assert/strict";
import { includedFor, vanLabel, type Catalog, type Option, type VanLength } from "../lib/catalog.ts";
import { decodeBuild, emptyBuild, encodeBuild, priceBuild, setFloorPlan, setVanLength } from "../lib/pricing.ts";

const van = (id: string, make: VanLength["make"], size: VanLength["size"], wheelbase: number): VanLength => ({
  id, make, size, wheelbase, vanPrice: 75_000, priceDelta: size === "long" ? 8_000 : 0,
  name: id, tagline: "", image: "", overallInches: 230,
});
const item = (id: string, sizes?: Option["sizes"]): Option => ({ id, categoryId: "electrical", name: id, type: "included", price: 0, sizes });

const C: Catalog = {
  categories: [{ id: "electrical", name: "Electrical", blurb: "" }],
  vanLengths: [van("sprinter-144", "sprinter", "short", 144), van("sprinter-170", "sprinter", "long", 170), van("transit-148", "transit", "long", 148)],
  floorPlans: [{ id: "el-capitan", name: "El Capitan", tagline: "", basePrice: 162_000, image: "", gallery: [], specs: [] }],
  options: [item("inc-solar-200", ["short"]), item("inc-solar-400", ["long"]), item("inc-inverter")],
  colorGroups: [],
  packages: [],
};

const short = setVanLength(C, setFloorPlan(emptyBuild(C), "el-capitan"), "sprinter-144");
const long = setVanLength(C, short, "sprinter-170");
const transit = setVanLength(C, short, "transit-148");

assert.equal(priceBuild(C, short).total, 237_000, "short van: $75,000 van + $162,000 conversion");
assert.equal(priceBuild(C, long).total, 245_000, "long van: $75,000 van + $170,000 conversion");
assert.equal(priceBuild(C, transit).total, 245_000, "a long Transit prices like a long Sprinter");
assert.equal(priceBuild(C, long).vanPrice, 75_000, "the van is reported as its own line");

const ids = (b: typeof short) => includedFor(C, "el-capitan", b.vanLengthId).map((o) => o.id).sort();
assert.deepEqual(ids(short), ["inc-inverter", "inc-solar-200"], "the short van gets 200W solar");
assert.deepEqual(ids(long), ["inc-inverter", "inc-solar-400"], "the long van gets 400W solar");

assert.equal(vanLabel(C.vanLengths[2]), 'Ford Transit 148"', "the label names the make and wheelbase");

// A link from before lengths existed has four fields; it means the first van.
const legacy = decodeBuild(C, ["el-capitan", "", "", ""].join("~"));
assert.equal(legacy.vanLengthId, "sprinter-144");
assert.equal(priceBuild(C, legacy).total, 237_000);

// A current link round-trips the van.
assert.equal(decodeBuild(C, encodeBuild(transit)).vanLengthId, "transit-148");

console.log("phase 1 pricing: ok");
console.log(`  short van  $${priceBuild(C, short).total.toLocaleString()}`);
console.log(`  long van   $${priceBuild(C, long).total.toLocaleString()}`);
