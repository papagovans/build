/**
 * The four pre-priced packages (owner, 2026-10-30), from the master pricing
 * workbook, as published (lib/pricing-store.ts). A package is not a separate kind of build:
 * it is an ordinary build state (a van, its AWD, its upgrades, and on a
 * Sprinter 170 its layout code), so "Customize" is just a ?b= link into the
 * builder and the builder prices it the same way it prices anything else.
 */
import { getOption, getVanLength, planFitsLength, type Catalog, type VanLength } from "./catalog";
import { isModular, layoutCode, layoutLines, parseLayout, piecePrice } from "./modules";
import { emptyBuild, encodeBuild, type BuildState } from "./pricing";
import type { PricingData } from "./workbook";

export type Package = PricingData["packages"][number];
export type BaseItem = PricingData["baseItems"][number];

/** The packages in the published prices, cheapest first. */
export const packagesOf = (catalog: Catalog) => catalog.pricing.packages;
export const getPackage = (catalog: Catalog, slug: string) => packagesOf(catalog).find((p) => p.slug === slug);

export function packageBuild(catalog: Catalog, pkg: Package): BuildState {
  // The conversion price lives on the floor plan and every plan costs the same,
  // so any plan that fits the van will do; a Sprinter 170 never shows it.
  const plan = catalog.floorPlans.find((p) => planFitsLength(catalog, p.id, pkg.van));
  return {
    ...emptyBuild(catalog),
    vanLengthId: pkg.van,
    floorPlanId: plan?.id ?? null,
    selected: [...pkg.vanOptions, ...pkg.upgrades],
    layout: isModular(pkg.van) ? layoutCode(parseLayout(pkg.layout)) : null,
  };
}

export const customizeLink = (catalog: Catalog, pkg: Package) => `/?b=${encodeURIComponent(encodeBuild(packageBuild(catalog, pkg)))}`;

export interface BillOfMaterials {
  van: VanLength;
  vanPrice: number;
  vanOptions: { name: string; price: number }[];
  base: { category: string; items: BaseItem[] }[];
  baseTotal: number;
  /** Grouped by the package each upgrade first appears in, lowest first, so a
   * page shows what this package adds over the one below it. */
  upgrades: { from: string; isNew: boolean; items: { code: string; name: string; category: string; manufacturer?: string; model?: string; price: number; photo?: string; whatItIs?: string; whyYouNeedIt?: string }[] }[];
  upgradesTotal: number;
  /** A Sprinter 170's pieces, each at what it adds over the standard pick. */
  layout: { label: string; code: string; name: string; note: string; price: number; photo?: string; whatItIs?: string; whyYouNeedIt?: string }[];
  layoutTotal: number;
  total: number;
}


/** Every line of a package with its price, grouped the way the workbook groups it. */
export function billOfMaterials(catalog: Catalog, pkg: Package): BillOfMaterials | undefined {
  const data = catalog.pricing;
  const PACKAGES = packagesOf(catalog);
  // The lowest package carrying an upgrade. Packages run cheapest first.
  const firstIn = (code: string) => PACKAGES.find((p) => p.upgrades.includes(code))?.name;
  const van = getVanLength(catalog, pkg.van);
  if (!van) return undefined;
  const size = van.size === "long" ? "Long" : "Short";
  const items = data.baseItems.filter((b) => b.fits === "All" || b.fits === size);
  const group = <T extends { category: string }>(list: T[]) =>
    [...new Set(list.map((i) => i.category))].map((category) => ({ category, items: list.filter((i) => i.category === category) }));
  const vanOptions = pkg.vanOptions.map((c) => data.vanOptions.find((v) => v.code === c)!).filter(Boolean);
  const upgrades = pkg.upgrades
    .map((c) => data.upgrades.find((u) => u.code === c)!)
    .filter(Boolean)
    .map((u) => ({
      code: u.code, name: getOption(catalog, u.code)?.name ?? u.name, manufacturer: u.manufacturer, model: u.model,
      price: u.price, category: u.category, photo: u.photo, whatItIs: u.whatItIs, whyYouNeedIt: u.whyYouNeedIt,
    }));
  const baseTotal = data.base[van.size === "long" ? "long" : "short"];
  const upgradesTotal = upgrades.reduce((s, u) => s + u.price, 0);
  const vanPrice = van.vanPrice + vanOptions.reduce((s, v) => s + v.price, 0);
  const layout = pkg.layout
    ? layoutLines(pkg.layout).map(({ label, piece }) => ({
        label, code: piece.code, name: piece.name, note: piece.note, price: piecePrice(data.layout, piece.code),
        ...data.layoutInfo?.[piece.code],
      }))
    : [];
  const layoutTotal = layout.reduce((s, l) => s + l.price, 0);
  return {
    van,
    vanPrice,
    vanOptions,
    base: group(items),
    baseTotal,
    upgrades: PACKAGES.filter((p) => upgrades.some((u) => firstIn(u.code) === p.name)).map((p) => ({
      from: p.name,
      isNew: p.name === pkg.name,
      items: upgrades.filter((u) => firstIn(u.code) === p.name),
    })),
    upgradesTotal,
    layout,
    layoutTotal,
    total: vanPrice + baseTotal + layoutTotal + upgradesTotal,
  };
}
