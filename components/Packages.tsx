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

/** The two ways to start, side by side. Shown on /packages. */
export function TwoWays() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Link href="/" className="group bg-white rounded-lg border-2 border-black/10 hover:border-sky/40 p-6 transition-colors">
        <p className="brand-heading text-xl text-navy">Build From Scratch</p>
        <p className="mt-2 text-sm text-steel">
          Start with the van and everything every Papago van gets, then add only the upgrades you want.
        </p>
        <p className="mt-4 text-sm font-semibold text-navy group-hover:underline">Start building →</p>
      </Link>
      <a href="#packages" className="group bg-white rounded-lg border-2 border-gold p-6">
        <p className="brand-heading text-xl text-navy">Start From a Package</p>
        <p className="mt-2 text-sm text-steel">
          Four proven builds with the price worked out. Take one as it is, or use it as your starting point and change anything.
        </p>
        <p className="mt-4 text-sm font-semibold text-navy group-hover:underline">See the packages ↓</p>
      </a>
    </div>
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
 * Every line, in two parts (owner, 2026-10-30): the Included Options on top,
 * the same in every package, then the Upgrades, grouped by the package each
 * first appears in so the step up from one package to the next is plain. With
 * `priced`, every line carries its price and the included list starts open:
 * the Build Sheet. Without, it is the package page.
 */
export function LineItems({ bom, priced, name }: { bom: BillOfMaterials; priced?: boolean; name: string }) {
  const count = bom.base.reduce((n, g) => n + g.items.length, 0);
  const upgradeCount = bom.upgrades.reduce((n, g) => n + g.items.length, 0);
  const heading = (title: string, sub: string, total?: number) => (
    <div className="flex items-end justify-between gap-4 border-b-2 border-navy pb-2">
      <div>
        <h2 className="brand-heading text-2xl text-navy">{title}</h2>
        <p className="text-sm text-steel">{sub}</p>
      </div>
      {priced && total !== undefined && <p className="text-lg font-bold text-navy whitespace-nowrap">{formatPrice(total)}</p>}
    </div>
  );
  return (
    <>
      <section className="mt-12">
        {heading("Included Options", `The same ${count} items in every Papago van, whichever package or none`, bom.baseTotal)}
        <details open={priced} className="group mt-3">
          <summary className="cursor-pointer list-none text-sm font-semibold text-navy hover:underline">
            <span className="group-open:hidden">Show all {count} included options ↓</span>
            <span className="hidden group-open:inline">Hide the list ↑</span>
          </summary>
          <div className="mt-4 grid gap-x-10 gap-y-6 md:grid-cols-2">
            {bom.base.map((g) => (
              <div key={g.category}>
                <h3 className="text-xs font-bold uppercase tracking-widest text-steel mb-1">{g.category}</h3>
                <ul className="divide-y divide-line">
                  {g.items.map((i) => (
                    <li key={i.code} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                      <span className="text-navy">
                        {i.qty && i.qty > 1 ? `${i.qty}x ` : ""}
                        {i.name}
                        {i.manufacturer && <span className="text-steel">, {i.manufacturer}</span>}
                      </span>
                      {priced && <span className="text-navy whitespace-nowrap">{formatPrice(i.retail)}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      </section>
      {bom.layout.length > 0 && (
        <section className="mt-12">
          {heading("Layout", `The ${name}'s Sprinter 170 layout, each choice at what it adds over the standard pick`, bom.layoutTotal)}
          <ul className="mt-3 divide-y divide-line md:columns-2 md:gap-10 md:divide-y-0">
            {bom.layout.map((l) => (
              <li key={l.code} className="flex items-baseline justify-between gap-3 py-1.5 text-sm break-inside-avoid md:border-b md:border-line">
                <span className="text-navy">
                  {l.name}
                  <span className="block text-xs text-steel">{l.label}</span>
                </span>
                {priced ? (
                  <span className="text-navy whitespace-nowrap">{l.price ? formatPrice(l.price) : "Standard"}</span>
                ) : (
                  <span className="text-xs text-steel whitespace-nowrap">{l.price ? `+${formatPrice(l.price)}` : "Standard"}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-12">
        {heading("Upgrades", upgradeCount ? `What the ${name} adds on top of the included options` : `None: the ${name} is the included options, nothing added`, bom.upgradesTotal)}
        {bom.upgrades.map((g) => (
          <div key={g.from} className="mt-5">
            <h3 className={`text-xs font-bold uppercase tracking-widest mb-1 ${g.isNew ? "text-sky" : "text-steel"}`}>
              {g.isNew ? `New in the ${g.from}` : `From the ${g.from}`} ({g.items.length})
            </h3>
            <ul className="divide-y divide-line md:columns-2 md:gap-10 md:divide-y-0">
              {g.items.map((i) => (
                <li key={i.code} className="flex items-baseline justify-between gap-3 py-1.5 text-sm break-inside-avoid md:border-b md:border-line">
                  <span className="text-navy">
                    {i.name}
                    {i.manufacturer && <span className="text-steel">, {i.manufacturer}</span>}
                    <span className="block text-xs text-steel">{i.category}</span>
                  </span>
                  {priced && <span className="text-navy whitespace-nowrap">{formatPrice(i.price)}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

    </>
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
  const cell = "px-3 py-2 text-center";
  const label = "px-3 py-2 text-left text-navy";
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
          <tr><th colSpan={rows.length + 1} className="px-3 pt-4 pb-1 text-left text-xs font-bold uppercase tracking-widest text-steel">Layout</th></tr>
          {layoutLabels.map((lab) => (
            <tr key={lab}>
              <th className={`${label} font-normal`}>{lab === "Add-on" ? "Extras" : lab}</th>
              {rows.map((r) => {
                const picks = r.bom.layout.filter((l) => l.label === lab);
                return (
                  <td key={r.pkg.slug} className={`${cell} text-navy`}>
                    {r.bom.layout.length === 0 ? (lab === layoutLabels[0] ? <span className="text-steel">Floor plan</span> : "") : picks.length ? picks.map((p) => p.name).join(", ") : <span className="text-black/20">–</span>}
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
