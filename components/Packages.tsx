/**
 * The pre-priced packages, in the builder rather than on the marketing site
 * (owner, 2026-10-30): a list at /packages, one page per package, and its
 * Build Sheet with every line priced. All of it reads the master pricing
 * workbook through lib/packages.ts, so these prices are the builder's prices.
 */
import { Fragment } from "react";
import Image from "next/image";
import Link from "next/link";
import { vanLabel } from "@/lib/catalog";
import type { BillOfMaterials, Package } from "@/lib/packages";
import { formatPrice } from "@/lib/pricing";
import { Header } from "./Configurator";

export function PackagesShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-16">{children}</main>
    </div>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-bold uppercase tracking-widest text-sky">{children}</p>;
}

/**
 * The top of /packages (owner, 2026-10-30): a big gold 2 on navy, the same
 * look as the builder's band, with the two ways in as cards beside it.
 */
export function TwoWays() {
  return (
    <section className="rounded-2xl bg-navy text-white px-6 sm:px-10 py-8 sm:py-10 grid gap-8 lg:grid-cols-[auto_1fr] lg:items-center">
      <div>
        <div className="flex items-center gap-5">
          <span aria-hidden="true" className="brand-heading text-gold! text-[120px] sm:text-[150px] leading-[0.8]">2</span>
          <h1 className="brand-heading text-white! text-4xl sm:text-5xl leading-[0.95]">
            Ways
            <br />
            to Start
          </h1>
        </div>
        <p className="mt-5 max-w-sm text-white/75">
          Build your van piece by piece, or start from one of our four packages and change whatever you like.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/" className="group rounded-xl border-2 border-white/20 bg-white/5 p-6 hover:border-gold hover:bg-white/10 transition-colors">
          <p className="text-[11px] font-bold uppercase tracking-widest text-sky">One</p>
          <p className="brand-heading text-white! text-2xl mt-1">Build From Scratch</p>
          <p className="mt-2 text-sm text-white/75">
            Start with the van and everything every Papago van gets, then pick your bed, shower, living room and upgrades.
          </p>
          <p className="mt-5 text-sm font-semibold text-gold">
            Start building <span className="inline-block transition-transform group-hover:translate-x-1">→</span>
          </p>
        </Link>
        <a href="#packages" className="group rounded-xl border-2 border-gold bg-white/5 p-6 hover:bg-white/10 transition-colors">
          <p className="text-[11px] font-bold uppercase tracking-widest text-gold">Two</p>
          <p className="brand-heading text-white! text-2xl mt-1">Start From a Package</p>
          <p className="mt-2 text-sm text-white/75">
            Four pre-priced builds. Keep one as it is, or use it as your starting point and change anything.
          </p>
          <p className="mt-5 text-sm font-semibold text-gold">
            See the packages <span className="inline-block transition-transform group-hover:translate-y-0.5">↓</span>
          </p>
        </a>
      </div>
    </section>
  );
}

export function PackageCard({ pkg, bom }: { pkg: Package; bom: BillOfMaterials }) {
  return (
    <Link
      href={`/packages/${pkg.slug}`}
      className="group flex flex-col bg-white rounded-lg border-2 border-black/10 hover:border-sky/40 hover:shadow-lg overflow-hidden transition-all"
    >
      {/* A real Papago build in this package, from its page on papagovans.com
          (owner, 2026-10-30). 800px webp in public/packages. */}
      <div className="relative aspect-[3/2] bg-offwhite overflow-hidden">
        <Image
          src={`/packages/${pkg.slug}.webp`}
          alt={`A Papago ${pkg.name} build`}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 300px"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>
      <div className="p-5 flex flex-col flex-1">
        <Eyebrow>{pkg.tagline}</Eyebrow>
        <p className="brand-heading text-2xl text-navy mt-1">{pkg.name}</p>
        <p className="mt-1 text-sm text-steel">
          {vanLabel(bom.van)}
          {bom.vanOptions.length > 0 && `, ${bom.vanOptions.map((v) => v.name.replace(/ \(.*\)$/, "")).join(", ").toLowerCase()}`}
        </p>
        <p className="mt-3 text-sm text-steel">
          {pkg.upgrades.length === 0 ? "The base build, nothing added" : `The base build plus ${pkg.upgrades.length} upgrades`}
        </p>
        <p className="mt-auto pt-4 text-2xl font-extrabold text-navy">{formatPrice(bom.total)}</p>
        <p className="text-xs text-steel">van + conversion</p>
      </div>
    </Link>
  );
}

/** The price in three lines, then the total. */
export function PriceSummary({ bom }: { bom: BillOfMaterials }) {
  const rows = [
    { label: `Van: ${vanLabel(bom.van)}${bom.vanOptions.length ? ` with ${bom.vanOptions.map((v) => v.name).join(", ")}` : ""}`, value: bom.vanPrice, note: "Average price; you buy the van from the dealer" },
    { label: "Included options: the same in every Papago van", value: bom.baseTotal },
    ...(bom.layout.length ? [{ label: "Layout choices: bed, shower, living room, kitchen", value: bom.layoutTotal }] : []),
    { label: "Upgrades in this package", value: bom.upgradesTotal },
  ];
  return (
    <dl className="bg-white rounded-lg border border-line divide-y divide-line">
      {rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-4 px-5 py-3">
          <dt className="text-sm text-navy">
            {r.label}
            {r.note && <span className="block text-xs text-steel">{r.note}</span>}
          </dt>
          <dd className="text-sm font-semibold text-navy whitespace-nowrap">{formatPrice(r.value)}</dd>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-4 px-5 py-4 bg-offwhite">
        <dt className="brand-heading text-lg text-navy">Total, van + conversion</dt>
        <dd className="text-2xl font-extrabold text-navy whitespace-nowrap">{formatPrice(bom.total)}</dd>
      </div>
    </dl>
  );
}

/**
 * All four packages side by side (owner, 2026-10-30): the van first, since
 * that is where they differ before a single upgrade, then the included
 * options as one row, then every upgrade any package carries.
 */
export function ComparisonTable({ rows }: { rows: { pkg: Package; bom: BillOfMaterials }[] }) {
  const has = (r: { pkg: Package }, code: string) => (r.pkg.upgrades as string[]).includes(code);
  // Every upgrade any package carries, in the order packages add them.
  const seen = new Map<string, { name: string; category: string }>();
  for (const r of rows) for (const g of r.bom.upgrades) for (const i of g.items) if (!seen.has(i.code)) seen.set(i.code, i);
  const categories = [...new Set([...seen.values()].map((u) => u.category))];
  // Layout rows, in the builder's slot order, standard pieces left out.
  const layoutLabels = [...new Set(rows.flatMap((r) => r.bom.layout.filter((l) => l.label !== "Standard").map((l) => l.label)))];
  /* A van built from a floor plan (the 144) has no pieces; its plan is the
   * included options. ponytail: written out here; give the 144 its own rows on
   * the Beds/Living/Kitchen tabs if it ever builds piece by piece. */
  const FROM_INCLUDED: Record<string, string> = {
    Bed: "Fixed platform bed",
    Shower: "No shower (outdoor shower)",
    "Living Room": "Bench seat with storage",
    "Kitchenette Insert": "Under-counter cabinets",
    "Kitchen Uppers": "Overhead cabinets, no microwave",
  };
  const cell = "px-3 py-2 text-center";
  const label = "pl-8 pr-3 py-2 text-left text-navy"; // rows sit indented under their section header
  const vanRows: { label: string; value: (r: { bom: BillOfMaterials }) => string }[] = [
    { label: "Van", value: (r) => vanLabel(r.bom.van).replace("Mercedes-Benz ", "") },
    { label: "Wheelbase", value: (r) => `${r.bom.van.wheelbase}"${r.bom.van.extended ? " extended" : ""}` },
    { label: "Overall length", value: (r) => `${Math.floor(r.bom.van.overallInches / 12)}' ${Math.round(r.bom.van.overallInches % 12)}"` },
    { label: "Drive", value: (r) => (r.bom.vanOptions.length ? "All-wheel drive" : "Rear-wheel drive") },
    { label: "Van price, average", value: (r) => formatPrice(r.bom.vanPrice) },
  ];
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-white">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="bg-navy text-white">
            <th className="px-3 py-3 text-left font-semibold w-[34%]">Compare</th>
            {rows.map((r) => (
              <th key={r.pkg.slug} className="px-3 py-3 font-semibold">
                <Link href={`/packages/${r.pkg.slug}`} className="brand-heading text-lg hover:underline">{r.pkg.name}</Link>
              </th>
            ))}
          </tr>
          <tr className="bg-offwhite border-b border-line">
            <th className="px-3 py-3 text-left font-semibold text-navy">Total, van + conversion</th>
            {rows.map((r) => (
              <td key={r.pkg.slug} className={`${cell} text-lg font-extrabold text-navy`}>{formatPrice(r.bom.total)}</td>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          <tr><th colSpan={rows.length + 1} className="px-3 pt-4 pb-1 text-left text-xs font-bold uppercase tracking-widest text-steel">Mercedes-Benz Sprinter</th></tr>
          {vanRows.map((v) => (
            <tr key={v.label}>
              <th className={`${label} font-normal`}>{v.label}</th>
              {rows.map((r) => <td key={r.pkg.slug} className={`${cell} text-navy`}>{v.value(r)}</td>)}
            </tr>
          ))}
          <tr><th colSpan={rows.length + 1} className="px-3 pt-4 pb-1 text-left text-xs font-bold uppercase tracking-widest text-steel">Floor Plan</th></tr>
          {layoutLabels.map((lab) => (
            <tr key={lab}>
              <th className={`${label} font-normal`}>{lab === "Add-on" ? "Extras" : lab}</th>
              {rows.map((r) => {
                const picks = r.bom.layout.filter((l) => l.label === lab);
                return (
                  <td key={r.pkg.slug} className={`${cell} text-navy`}>
                    {r.bom.layout.length === 0 ? (
                      FROM_INCLUDED[lab] ?? <span className="text-black/20">–</span>
                    ) : picks.length ? (
                      picks.map((p) => p.name).join(", ")
                    ) : (
                      <span className="text-black/20">–</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr><th colSpan={rows.length + 1} className="px-3 pt-4 pb-1 text-left text-xs font-bold uppercase tracking-widest text-steel">Included options</th></tr>
          <tr>
            <th className={`${label} font-normal`}>The same in every package</th>
            {rows.map((r) => (
              <td key={r.pkg.slug} className={`${cell} text-navy`}>
                {r.bom.base.reduce((n, g) => n + g.items.length, 0)} items<span className="block text-xs text-steel">{formatPrice(r.bom.baseTotal)}</span>
              </td>
            ))}
          </tr>
          {categories.map((c) => (
            <Fragment key={c}>
              <tr><th colSpan={rows.length + 1} className="px-3 pt-4 pb-1 text-left text-xs font-bold uppercase tracking-widest text-steel">Upgrades: {c}</th></tr>
              {[...seen].filter(([, u]) => u.category === c).map(([code, u]) => (
                <tr key={code}>
                  <th className={`${label} font-normal`}>{u.name}</th>
                  {rows.map((r) => (
                    <td key={r.pkg.slug} className={cell}>
                      {has(r, code) ? <span aria-label="Included" className="text-navy font-bold">✓</span> : <span aria-label="Not included" className="text-black/20">–</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PackageActions({ pkg, customize, showSheet = true }: { pkg: Package; customize: string; showSheet?: boolean }) {
  return (
    <div className="flex flex-wrap gap-3">
      {!showSheet && (
        /* The builder's own Build Sheet, with this package in it: the PDF, and
           the buyer's details to HubSpot (owner, 2026-10-30). */
        <Link href={`${customize}&sheet=1`} className="px-7 py-3 rounded-full bg-gold text-navy text-sm font-semibold hover:bg-gold-deep transition-colors">
          Get Build Sheet
        </Link>
      )}
      {showSheet && (
        <Link href={`/packages/${pkg.slug}/build-sheet`} className="px-7 py-3 rounded-full bg-gold text-navy text-sm font-semibold hover:bg-gold-deep transition-colors">
          Build as Is
        </Link>
      )}
      <Link href={customize} className="px-7 py-3 rounded-full border-2 border-navy text-navy text-sm font-semibold hover:bg-navy hover:text-white transition-colors">
        Customize
      </Link>
    </div>
  );
}
