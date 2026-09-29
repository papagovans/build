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
  FloorPlan,
  Option,
  OptionType,
  VanMake,
  VanSize,
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
  const [categories, floorPlans, products, packages, vanLengths] =
    await Promise.all([
      payload.find({ collection: "categories", limit: 200, sort: "order" }),
      payload.find({ collection: "floor-plans", limit: 200, sort: "order", depth: 2 }),
      payload.find({ collection: "products", limit: 500, depth: 1, sort: "createdAt" }), // entry order: the pricing sheet's order
      payload.find({ collection: "trim-packages", limit: 500, sort: "order", depth: 1 }),
      payload.find({ collection: "van-lengths", limit: 50, sort: "order", depth: 1 }),
    ]);

  return {
    vanLengths: vanLengths.docs.map((v) => ({
      id: v.slug ?? "",
      make: v.make as VanMake,
      size: v.size as VanSize,
      wheelbase: v.wheelbase,
      vanPrice: v.vanPrice,
      name: v.name,
      tagline: v.tagline,
      priceDelta: v.priceDelta,
      overallInches: v.overallInches,
      image: typeof v.image === "object" && v.image ? (v.image.url ?? "") : "",
    })),

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
        /* Empty means every length, which lengthsFor() treats as no filter. */
        availableLengths: (p.availableLengths ?? [])
          .map((v) => (typeof v === "object" && v ? (v.slug ?? "") : ""))
          .filter(Boolean),
        // The card thumbnail is the first gallery view, which the seed orders
        // so the cutaway leads.
        image: gallery[0]?.src ?? "",
        gallery,
        specs: (p.specs ?? []).map((s) => ({ label: s.label, value: s.value })),
        model: mediaUrl(p.model),
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
      /* Payload stores a real boolean. The catalog treats undefined as
       * selectable, so only an explicit false travels. */
      selectable: o.selectable === false ? false : undefined,
      thumb: mediaUrl(o.image),
      manufacturer: o.manufacturer || undefined,
      model: o.modelNumber || undefined,
      whatItIs: o.whatItIs || undefined,
      whyYouNeedIt: o.whyYouNeedIt || undefined,
      sizes: o.sizes?.length ? (o.sizes as VanSize[]) : undefined,
      partOf: relSlug(o.partOf as Rel),
    })),

    packages: packages.docs.map((p) => ({
      id: p.slug ?? "",
      name: p.name,
      tagline: p.tagline,
      priceDelta: p.priceDelta,
      floorPlanIds: relSlugs(p.floorPlans),
      defaults: relSlugs(p.defaults),
    })),

    /* Phase 1 of the streamlined builder has no colour step (owner, 2026-09-28).
       The groups stay in the admin untouched; loading none keeps them off the
       Build Sheet and out of the price until the step comes back. */
    colorGroups: [],
  };
}
