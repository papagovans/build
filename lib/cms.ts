/**
 * Loads the live catalog out of Payload and hands back the same `Catalog`
 * shape the configurator has always used.
 *
 * Server only. It goes through Payload's Local API rather than the REST
 * endpoint, which means no HTTP hop and no public read access on the
 * collections: the catalog is only ever exposed through our own rendering.
 *
 * Slugs are the ids. Payload's numeric primary keys never leave this file, so
 * every `?b=` link built before the CMS existed still resolves.
 */
import "server-only";

import { getPayload } from "payload";
import config from "@payload-config";

import type {
  Catalog,
  ColorGroup,
  FloorPlan,
  Option,
  OptionType,
} from "./catalog";

/** A relationship comes back as an id when shallow, or the doc when populated. */
type Rel = number | string | { slug?: string | null } | null | undefined;

function relSlug(value: Rel): string | undefined {
  return value && typeof value === "object" && value.slug ? value.slug : undefined;
}

function relSlugs(value: Rel[] | null | undefined): string[] {
  return (value ?? []).map(relSlug).filter((s): s is string => Boolean(s));
}

type MediaLike = { url?: string | null } | number | string | null | undefined;

function mediaUrl(value: MediaLike): string | undefined {
  return value && typeof value === "object" && value.url ? value.url : undefined;
}

export async function loadCatalog(): Promise<Catalog> {
  const payload = await getPayload({ config });

  // depth 1 populates the relationships we read slugs from. Floor plans need 2
  // so their gallery rows carry the uploaded image, not just its id.
  const [categories, floorPlans, products, packages, colorGroups] =
    await Promise.all([
      payload.find({ collection: "categories", limit: 200, sort: "order" }),
      payload.find({ collection: "floor-plans", limit: 200, sort: "order", depth: 2 }),
      payload.find({ collection: "products", limit: 500, depth: 1 }),
      payload.find({ collection: "trim-packages", limit: 500, sort: "order", depth: 1 }),
      payload.find({ collection: "color-groups", limit: 200, sort: "order", depth: 1 }),
    ]);

  return {
    categories: categories.docs.map((c) => ({
      id: c.slug ?? "",
      name: c.name,
      blurb: c.blurb,
    })),

    floorPlans: floorPlans.docs.map((p): FloorPlan => {
      const gallery = (p.gallery ?? [])
        .map((g, i) => ({
          id: `${p.slug ?? ""}-${i}`,
          label: g.label,
          src: mediaUrl(g.image) ?? "",
        }))
        .filter((g) => g.src);
      return {
        id: p.slug ?? "",
        name: p.name,
        tagline: p.tagline,
        basePrice: p.basePrice,
        // The card thumbnail is the first gallery view, which the seed orders
        // so the cutaway leads.
        image: gallery[0]?.src ?? "",
        gallery,
        specs: (p.specs ?? []).map((s) => ({ label: s.label, value: s.value })),
      };
    }),

    options: products.docs.map((o): Option => ({
      id: o.slug ?? "",
      categoryId: relSlug(o.category) ?? "",
      name: o.name,
      description: o.description ?? undefined,
      type: o.type as OptionType,
      price: o.price,
      replaces: relSlug(o.replaces),
      requires: relSlugs(o.requires),
      conflictsWith: relSlugs(o.conflictsWith),
      availableFor: relSlugs(o.availableFor),
      thumb: mediaUrl(o.image),
    })),

    packages: packages.docs.map((p) => ({
      id: p.slug ?? "",
      name: p.name,
      tagline: p.tagline,
      priceDelta: p.priceDelta,
      floorPlanIds: relSlugs(p.floorPlans),
      defaults: relSlugs(p.defaults),
    })),

    colorGroups: colorGroups.docs.map((g): ColorGroup => ({
      id: g.slug ?? "",
      categoryId: relSlug(g.category) ?? "",
      name: g.name,
      blurb: g.blurb,
      choices: (g.choices ?? []).map((c) => ({
        id: c.slug,
        name: c.name,
        hex: c.hex,
        hex2: c.hex2 ?? undefined,
        price: c.price,
      })),
    })),
  };
}
