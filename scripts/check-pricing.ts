/*
 * Self-check for van-length pricing and `?b=` backward compatibility.
 *
 *   npx tsx scripts/check-pricing.ts
 *
 * Two things worth protecting. The length adds its delta and nothing else, and
 * a link shared before lengths existed still prices exactly as it did.
 */
import assert from "node:assert/strict";
import { HARDCODED_CATALOG as C, getOption, getPackages, optionsFor, selectableOptionsFor } from "../lib/catalog.ts";
import { applyPackage, decodeBuild, encodeBuild, emptyBuild, priceBuild, setVanLength } from "../lib/pricing.ts";

const PLAN = "el-capitan";
const summit = getPackages(C, PLAN).find((p) => /summit/i.test(p.name));
assert.ok(summit, "expected a Summit trim package on El Capitan");

const base = applyPackage(C, emptyBuild(C), PLAN, summit.id);

// The README's long-standing figure, which must not move on the shortest van.
const on144 = { ...base, vanLengthId: "sprinter-144" };
assert.equal(priceBuild(C, on144).total, 260770, "El Capitan + Summit on a 144");

const on170 = setVanLength(C, on144, "sprinter-170");
assert.equal(priceBuild(C, on170).total, 260770 + 12000, "170 adds 12k");

const onExt = setVanLength(C, on144, "sprinter-170-ext");
assert.equal(priceBuild(C, onExt).total, 260770 + 20000, "170 EXT adds 20k");

assert.equal(priceBuild(C, on170).lengthDelta, 12000, "the delta is reported separately");

// A link shared before lengths existed has four fields, not five.
const legacy = [PLAN, summit.id, base.selected.join("."), ""].join("~");
const revived = decodeBuild(C, legacy);
assert.equal(revived.vanLengthId, "sprinter-144", "an old link means the shortest van");
assert.equal(priceBuild(C, revived).total, 260770, "an old link must not change price");

// And a current link round-trips the length.
const roundTrip = decodeBuild(C, encodeBuild(onExt));
assert.equal(roundTrip.vanLengthId, "sprinter-170-ext");
assert.equal(priceBuild(C, roundTrip).total, 260770 + 20000);

// A hand-edited link naming a length that does not exist falls back, never null.
const bogus = decodeBuild(C, [PLAN, "", "", "", "sprinter-900"].join("~"));
assert.equal(bogus.vanLengthId, "sprinter-144", "an unknown length falls back to the shortest");

// --- unselectable options -------------------------------------------------
// The contract: hidden from the question, still real in the build.
const hidden = C.options.filter((o) => o.selectable === false);
assert.ok(hidden.length > 0, "expected at least one unselectable option to test");

for (const o of hidden) {
  const asked = selectableOptionsFor(C, o.categoryId, PLAN).some((x) => x.id === o.id);
  const exists = optionsFor(C, o.categoryId, PLAN).some((x) => x.id === o.id);
  assert.equal(asked, false, `${o.id} must not be offered as a choice`);
  assert.equal(exists, true, `${o.id} must still exist for pricing and the Build Sheet`);
}

// An unselectable upgrade a package carries still costs what it costs.
const carried = summit.defaults.map((id) => getOption(C, id)).filter(Boolean);
const hiddenCarried = carried.filter((o) => o!.selectable === false && o!.price > 0);
if (hiddenCarried.length) {
  const withOut = { ...on144, selected: on144.selected.filter((id) => getOption(C, id)?.selectable !== false) };
  const delta = priceBuild(C, on144).total - priceBuild(C, withOut).total;
  const expected = hiddenCarried.reduce((sum, o) => sum + o!.price, 0);
  assert.equal(delta, expected, "unselectable components must still price");
  console.log(`unselectable but priced: ${hiddenCarried.length} components, $${expected.toLocaleString()}`);
}

console.log(`hidden from the wizard: ${hidden.map((o) => o.id).join(", ")}`);
console.log("van length pricing: ok");
console.log(`  144      $${priceBuild(C, on144).total.toLocaleString()}`);
console.log(`  170      $${priceBuild(C, on170).total.toLocaleString()}`);
console.log(`  170 EXT  $${priceBuild(C, onExt).total.toLocaleString()}`);
