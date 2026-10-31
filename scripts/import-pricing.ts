/**
 * Writes the workbook's retail prices to lib/pricing-data.json, the copy the
 * builder ships with and falls back to when nothing has been published.
 *
 *   npm run import-pricing -- "<Dropbox>/Papago Vans/van build pricing/papago-master-pricing.xlsx"
 *
 * Day to day, prices go live from the Pricing page (/pricing) instead, with no
 * deploy. Same reader either way: lib/workbook.ts.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseWorkbook, WorkbookError } from "../lib/workbook.ts";

const file = process.argv[2];
if (!file) {
  console.error('usage: npm run import-pricing -- "<path>/papago-master-pricing.xlsx"');
  process.exit(1);
}
const buf = readFileSync(file);
try {
  const data = await parseWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), basename(file));
  const out = join(import.meta.dirname, "..", "lib", "pricing-data.json");
  writeFileSync(out, JSON.stringify(data, null, 2) + "\n");
  console.log(`base options retail: short $${data.base.short.toLocaleString()}, long $${data.base.long.toLocaleString()} (${data.baseItems.length} items)`);
  console.log(`${data.upgrades.length} upgrades, ${data.vanOptions.length} van options, ${Object.keys(data.layout).length} layout pieces`);
  for (const p of data.packages) console.log(`${p.name.padEnd(11)} ${p.van.padEnd(15)} ${p.upgrades.length} upgrades, layout ${p.layout}`);
  console.log(`wrote ${out}`);
} catch (e) {
  if (e instanceof WorkbookError) {
    console.error("The workbook has problems:\n- " + e.problems.join("\n- "));
    process.exit(1);
  }
  throw e;
}
