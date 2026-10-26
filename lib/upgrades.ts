/**
 * The Upgrades step (owner, 2026-10-26): every Exterior item is an upgrade,
 * not part of the included build.
 *
 * Applied to the catalog as it loads, so the shop's database is untouched:
 * each Exterior part becomes an add-on with its own price, the Exterior
 * section is renamed Upgrades, and the four Exterior system cards that only
 * grouped those parts (sys-front, sys-roof, sys-wheels, sys-rear) are dropped.
 * Everything downstream is the ordinary engine: priceBuild() adds them, the
 * rules engine pulls in what a part needs (bumper lights need the bumper)
 * and drops it with its base, and the ?b= link and Build Sheet carry them.
 *
 * ponytail: prices are round placeholders, not quotes. When the shop sets
 * real ones, make the change in /admin (type Add-on, price, Requires, and
 * clear Part of on each Exterior product, rename the category) and delete
 * this file and its one call in lib/cms.ts.
 */
import type { Catalog } from "./catalog";

export const UPGRADES_CATEGORY_ID = "exterior";

/* Placeholder price per product slug. Anything unlisted shows at $0. */
const PRICES: Record<string, number> = {
  "inc-roof-rack": 4_500,
  "inc-light-bar": 1_500,
  "inc-bumper-winch": 6_500,
  "inc-bumper-lights": 900,
  "inc-fender-flares": 1_800,
  "inc-awning": 2_400,
  "inc-wheels": 4_800,
  "inc-fender-kit": 1_200,
  "inc-tire-carrier": 1_900,
  "inc-bike-carrier": 1_400,
  "inc-rear-box": 1_600,
  "inc-power-steps": 2_600,
};

/* What a part mounts on. */
const REQUIRES: Record<string, string[]> = {
  "inc-light-bar": ["inc-roof-rack"],
  "inc-bumper-lights": ["inc-bumper-winch"],
};

export function withUpgrades(catalog: Catalog): Catalog {
  const exterior = catalog.options.filter((o) => o.categoryId === UPGRADES_CATEGORY_ID);
  const systems = new Set(exterior.filter((s) => exterior.some((p) => p.partOf === s.id)).map((s) => s.id));
  return {
    ...catalog,
    categories: catalog.categories.map((c) =>
      c.id === UPGRADES_CATEGORY_ID ? { ...c, name: "Upgrades", blurb: "Optional extras on top of the build." } : c,
    ),
    options: catalog.options
      .filter((o) => !systems.has(o.id))
      .map((o) =>
        o.categoryId === UPGRADES_CATEGORY_ID
          ? { ...o, type: "addon" as const, price: PRICES[o.id] ?? 0, partOf: undefined, requires: REQUIRES[o.id] }
          : o,
      ),
  };
}
