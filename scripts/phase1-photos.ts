/**
 * Phase 1 product photos and confirmed models (2026-09-29).
 *
 *   npx tsx scripts/phase1-photos.ts assets/products assets/products
 *
 * Branded items: studio shots from each maker's own site. Shop-built items:
 * crops from Papago's own finished builds. Every image was looked at before
 * it went in. Models are only the ones the maker's site pins down; the rest
 * stay blank for the shop to fill in.
 */
import { createRequire } from "module";
import fs from "fs";
createRequire(import.meta.url)("@next/env").loadEnvConfig(process.cwd());
const { getPayload } = await import("payload");
const { default: config } = await import("../payload.config.ts");
const payload = await getPayload({ config });
const [BR, SH] = [process.argv[2] ?? "assets/products", process.argv[3] ?? "assets/products"];

const PHOTOS: Record<string, string> = {
  "inc-battery": `${BR}/inc-battery-x2.webp`,
  "inc-inverter": `${BR}/inc-inverter.webp`,
  "inc-booster": `${BR}/inc-booster.webp`,
  "inc-toilet": `${BR}/inc-toilet.webp`,
  "inc-hydronic-water": `${BR}/inc-hydronic-water.webp`,
  "inc-hydronic-heat": `${BR}/inc-hydronic-heat.webp`,
  "inc-cooktop": `${BR}/inc-cooktop.webp`,
  "inc-fridge": `${BR}/inc-fridge.webp`,
  "inc-table": `${BR}/inc-table.webp`,
  "inc-roof-rack": `${BR}/inc-roof-rack.webp`,
  "inc-bike-carrier": `${BR}/inc-bike-carrier.webp`,
  "inc-rear-box": `${BR}/inc-rear-box.webp`,
  ...Object.fromEntries(
    ["inc-outlets", "inc-cutting-board", "inc-popup-counter", "inc-door-table", "inc-microwave", "inc-ceiling-lights",
     "inc-cabinet-double", "inc-cabinet-drawers", "inc-cabinet-storage", "inc-closet", "inc-bed", "inc-window-driver",
     "inc-window-slider", "inc-fender-flares", "inc-fender-kit", "inc-water-heater"].map((s) => [s, `${SH}/${s}.webp`]),
  ),
};
const MODELS: Record<string, string> = {
  "inc-battery": "V2-T Elite 12V 460Ah (x2)",
  "inc-fridge": "Freeline Slim 140",
  "inc-bike-carrier": "B2 (B2-VS-2535)",
  "inc-roof-rack": "Safari Roof Rack",
};

for (const [slug, file] of Object.entries(PHOTOS)) {
  const p = (await payload.find({ collection: "products", where: { slug: { equals: slug } }, limit: 1, depth: 0 })).docs[0] as any;
  if (!p) throw new Error(`no product ${slug}`);
  const data = fs.readFileSync(file);
  const name = `${slug.replace(/^inc-/, "")}.webp`;
  const existing = (await payload.find({ collection: "media", where: { filename: { equals: name } }, limit: 1 })).docs[0] as any;
  const mediaId = existing
    ? existing.id
    : (await payload.create({ collection: "media", data: { alt: p.name } as any, file: { data, name, mimetype: "image/webp", size: data.length } })).id;
  await payload.update({ collection: "products", id: p.id, data: { image: mediaId, ...(MODELS[slug] ? { modelNumber: MODELS[slug] } : {}) } });
  console.log("photo", slug);
}
process.exit(0);
