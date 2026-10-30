/**
 * Van prices come from the master pricing workbook (owner, 2026-10-30), not
 * the admin: scripts/import-pricing.py copies its Chassis tab into
 * pricing-data.json. Each is an averaged placeholder for a camper-ready van
 * (swivel seats and upfitter electrical included) so a buyer sees a realistic
 * total; Papago does not sell the van, and it stays out of the margin.
 *
 * The workbook also carries an extended body for each make. Those vans are
 * added here, borrowing the regular-length van's picture and floor plan fit,
 * so the shop's database is untouched.
 *
 * ponytail: the extended vans live in code, not /admin. Move them into the
 * Vans collection once someone needs to edit them there.
 */
import type { Catalog, VanLength } from "./catalog";
import data from "./pricing-data.json";

const PRICES: Record<string, { price: number }> = data.vans;

/* Overall length, inches, from each maker's published spec. */
const EXTENDED: { id: string; from: string; overallInches: number; name: string; tagline: string }[] = [
  { id: "sprinter-170x", from: "sprinter-170", overallInches: 290, name: "Most Room", tagline: "Extra length behind the rear wheels for a bigger garage or a full wet bath" },
  { id: "transit-148x", from: "transit-148", overallInches: 264, name: "Most Room", tagline: "Extra length behind the rear wheels for a bigger garage or a full wet bath" },
  { id: "promaster-159x", from: "promaster-159", overallInches: 251, name: "Most Room", tagline: "Super high roof with 86 inches of headroom, and extra length out back" },
];

export function withChassis(catalog: Catalog): Catalog {
  const added: VanLength[] = EXTENDED.flatMap((x) => {
    const base = catalog.vanLengths.find((v) => v.id === x.from);
    return base ? [{ ...base, id: x.id, extended: true, overallInches: x.overallInches, name: x.name, tagline: x.tagline, priceDelta: base.priceDelta }] : [];
  });
  // Each extended van sits right after its regular-length sibling.
  const vanLengths = catalog.vanLengths.flatMap((v) => [v, ...added.filter((a) => EXTENDED.find((x) => x.id === a.id)?.from === v.id)]);
  return {
    ...catalog,
    vanLengths: vanLengths.map((v) => ({ ...v, vanPrice: PRICES[v.id]?.price ?? v.vanPrice })),
    // A floor plan limited to certain vans fits the extended body of any it allows.
    floorPlans: catalog.floorPlans.map((p) =>
      p.availableLengths?.length
        ? { ...p, availableLengths: [...p.availableLengths, ...EXTENDED.filter((x) => p.availableLengths!.includes(x.from)).map((x) => x.id)] }
        : p,
    ),
  };
}
