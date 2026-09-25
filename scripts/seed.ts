/**
 * Seed Payload from the hardcoded catalog.
 *
 *   npx tsx scripts/seed.ts
 *
 * Idempotent: every row is matched on its `slug`, which holds the id the
 * hardcoded catalog already used. Re-running updates in place rather than
 * duplicating the catalog, so it is safe to run after editing lib/catalog.ts.
 *
 * Images are uploaded once and reused. A media doc is matched on filename, so
 * a second run does not re-upload 57 files.
 */
import path from "path";

import { createRequire } from "module";

// @next/env is CommonJS and has no named ESM export, so go through require.
// This must run before payload.config is evaluated, since the config reads
// the Neon connection string at module scope. Hence the dynamic imports.
const { loadEnvConfig } = createRequire(import.meta.url)("@next/env");
loadEnvConfig(process.cwd());

const { getPayload } = await import("payload");
const { default: config } = await import("../payload.config.ts");
const { CATEGORIES, COLOR_GROUPS, FLOOR_PLANS, OPTIONS, HARDCODED_CATALOG, getPackages } =
  await import("../lib/catalog.ts");

const publicDir = path.resolve(process.cwd(), "public");

async function main() {
  const payload = await getPayload({ config });

  /** Upload a file from /public once, returning its media id. */
  const mediaCache = new Map<string, number | string>();
  async function upload(relSrc: string | undefined, alt: string) {
    if (!relSrc) return undefined;
    const filename = path.basename(relSrc);
    if (mediaCache.has(filename)) return mediaCache.get(filename);

    const existing = await payload.find({
      collection: "media",
      where: { filename: { equals: filename } },
      limit: 1,
    });
    if (existing.docs.length) {
      mediaCache.set(filename, existing.docs[0].id);
      return existing.docs[0].id;
    }

    const created = await payload.create({
      collection: "media",
      data: { alt },
      filePath: path.join(publicDir, relSrc.replace(/^\//, "")),
    });
    mediaCache.set(filename, created.id);
    return created.id;
  }

  /** Create or update by slug. */
  async function upsert(
    collection:
      | "categories"
      | "van-lengths"
      | "floor-plans"
      | "products"
      | "trim-packages"
      | "color-groups",
    slug: string,
    data: Record<string, unknown>,
  ) {
    const found = await payload.find({
      collection,
      where: { slug: { equals: slug } },
      limit: 1,
    });
    if (found.docs.length) {
      return payload.update({
        collection,
        id: found.docs[0].id,
        data: { ...data, slug },
      });
    }
    return payload.create({ collection, data: { ...data, slug } });
  }

  // --- Categories -----------------------------------------------------------
  const categoryIds = new Map<string, number | string>();
  for (const [i, c] of CATEGORIES.entries()) {
    const doc = await upsert("categories", c.id, {
      name: c.name,
      blurb: c.blurb,
      order: i,
    });
    categoryIds.set(c.id, doc.id);
  }
  console.log(`categories: ${categoryIds.size}`);

  // --- Van lengths ----------------------------------------------------------
  // Seeded before floor plans, because a plan can point at the lengths it fits.
  const lengthIds = new Map<string, number | string>();
  for (const [i, v] of HARDCODED_CATALOG.vanLengths.entries()) {
    const image = await upload(v.image, v.name);
    const doc = await upsert("van-lengths", v.id, {
      name: v.name,
      tagline: v.tagline,
      priceDelta: v.priceDelta,
      overallInches: v.overallInches,
      order: i,
      ...(image ? { image } : {}),
    });
    lengthIds.set(v.id, doc.id);
  }
  console.log(`van lengths: ${lengthIds.size}`);

  // --- Floor plans ----------------------------------------------------------
  const planIds = new Map<string, number | string>();
  for (const [i, p] of FLOOR_PLANS.entries()) {
    const gallery = [];
    for (const g of p.gallery) {
      const image = await upload(g.src, `${p.name} ${g.label}`);
      if (image) gallery.push({ label: g.label, image });
    }
    const doc = await upsert("floor-plans", p.id, {
      name: p.name,
      tagline: p.tagline,
      basePrice: p.basePrice,
      order: i,
      gallery,
      specs: p.specs,
      /* Empty means every length. The shop narrows it in the admin once it
       * confirms which plans are actually built on a 144. */
      availableLengths: (p.availableLengths ?? [])
        .map((id) => lengthIds.get(id))
        .filter(Boolean),
    });
    planIds.set(p.id, doc.id);
  }
  console.log(`floor plans: ${planIds.size}`);

  // --- Products -------------------------------------------------------------
  // Two passes. Relationships between products can point forward, so every row
  // has to exist before any of them can be linked.
  const productIds = new Map<string, number | string>();
  for (const o of OPTIONS) {
    const image = await upload(o.thumb, o.name);
    const doc = await upsert("products", o.id, {
      name: o.name,
      description: o.description,
      category: categoryIds.get(o.categoryId),
      type: o.type,
      price: o.price,
      image,
    });
    productIds.set(o.id, doc.id);
  }
  for (const o of OPTIONS) {
    const rels = {
      replaces: o.replaces ? productIds.get(o.replaces) : null,
      requires: (o.requires ?? []).map((id) => productIds.get(id)).filter(Boolean),
      conflictsWith: (o.conflictsWith ?? [])
        .map((id) => productIds.get(id))
        .filter(Boolean),
      availableFor: (o.availableFor ?? []).map((id) => planIds.get(id)).filter(Boolean),
    };
    await payload.update({
      collection: "products",
      id: productIds.get(o.id)!,
      data: rels,
    });
  }
  console.log(`products: ${productIds.size}`);

  // --- Trim packages --------------------------------------------------------
  // The hardcoded catalog applies the same three tiers to every plan and
  // filters defaults per plan. Seed them per plan so the shop can diverge them
  // later without a schema change.
  let packageCount = 0;
  for (const plan of FLOOR_PLANS) {
    for (const [i, pkg] of getPackages(HARDCODED_CATALOG, plan.id).entries()) {
      await upsert("trim-packages", pkg.id, {
        name: pkg.name,
        tagline: pkg.tagline,
        priceDelta: pkg.priceDelta,
        order: i,
        floorPlans: [planIds.get(plan.id)],
        defaults: pkg.defaults.map((id) => productIds.get(id)).filter(Boolean),
      });
      packageCount += 1;
    }
  }
  console.log(`trim packages: ${packageCount}`);

  // --- Colour groups --------------------------------------------------------
  for (const [i, g] of COLOR_GROUPS.entries()) {
    await upsert("color-groups", g.id, {
      name: g.name,
      blurb: g.blurb,
      order: i,
      category: categoryIds.get(g.categoryId),
      choices: g.choices.map((c) => ({
        name: c.name,
        slug: c.id,
        hex: c.hex,
        hex2: c.hex2,
        price: c.price,
      })),
    });
  }
  console.log(`colour groups: ${COLOR_GROUPS.length}`);

  console.log("seed complete");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
