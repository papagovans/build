/**
 * The Upgrades step, from the master pricing workbook (owner, 2026-10-30).
 *
 * scripts/import-pricing.py copies the workbook's Upgrades tab and its AWD
 * options into pricing-data.json, each at what the buyer pays on top: an
 * upgrade that replaces a base item (lithium for AGM) is priced at the
 * difference. They go in as `upgrade` options carrying `replaces`, so the
 * ordinary engine prices them and keeps two upgrades of the same base item
 * exclusive. Ids are the workbook codes, which is what ?b= links and the
 * packages carry.
 *
 * The admin's own Exterior products are dropped from the build here; the
 * workbook replaced them. The shop's database is untouched.
 */
import type { Catalog, Option, VanMake, VanSize } from "./catalog";
import data from "./pricing-data.json";

export const UPGRADES_CATEGORY_ID = "exterior";

/* What a part mounts on. Picking it pulls the base in; dropping the base drops it. */
const REQUIRES: Record<string, string[]> = {
  EX22: ["EX21"], // bumper lights need the bumper
  RF23: ["RF21"], // light bars need a roof rack
  RF24: ["RF22"],
};

const MAKES: Record<string, VanMake> = { Sprinter: "sprinter", Transit: "transit", ProMaster: "promaster" };
const SIZES: Record<string, VanSize> = { Short: "short", Long: "long" };

function toOption(u: { code: string; category: string; name: string; manufacturer?: string; model?: string; replaces?: string | null; fits: string; price: number }): Option {
  return {
    id: u.code,
    categoryId: UPGRADES_CATEGORY_ID,
    group: u.category,
    name: u.name,
    type: "upgrade",
    price: u.price,
    replaces: u.replaces ?? undefined,
    requires: REQUIRES[u.code],
    manufacturer: u.manufacturer || undefined,
    model: u.model || undefined,
    makes: MAKES[u.fits] ? [MAKES[u.fits]] : undefined,
    sizes: SIZES[u.fits] ? [SIZES[u.fits]] : undefined,
  };
}

export const WORKBOOK_UPGRADES: Option[] = [
  ...data.vanOptions.map((v) => toOption({ ...v, category: "Van" })),
  ...data.upgrades.map(toOption),
];

export function withUpgrades(catalog: Catalog): Catalog {
  return {
    ...catalog,
    categories: catalog.categories.map((c) =>
      c.id === UPGRADES_CATEGORY_ID ? { ...c, name: "Upgrades", blurb: "Optional extras on top of the build." } : c,
    ),
    options: [...catalog.options.filter((o) => o.categoryId !== UPGRADES_CATEGORY_ID), ...WORKBOOK_UPGRADES],
  };
}
