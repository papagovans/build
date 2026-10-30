/**
 * The pre-priced packages, in the builder rather than on the marketing site
 * (owner, 2026-10-30): a list at /packages, one page per package, and its
 * Build Sheet with every line priced. All of it reads the master pricing
 * workbook through lib/packages.ts, so these prices are the builder's prices.
 */
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
      <div className="relative aspect-[903/576] bg-offwhite">
        {bom.van.image && <Image src={bom.van.image} alt={vanLabel(bom.van)} fill sizes="(max-width: 768px) 100vw, 300px" className="object-contain" />}
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
    { label: "Base build: everything every Papago van gets", value: bom.baseTotal },
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
 * Every line, grouped. With `priced`, each line carries its price: the Build
 * Sheet. Without, it is the what's-included list on the package page.
 */
export function LineItems({ bom, priced }: { bom: BillOfMaterials; priced?: boolean }) {
  const section = (title: string, total: number, groups: { category: string; items: { code: string; name: string; manufacturer?: string; retail?: number; price?: number; qty?: number }[] }[]) =>
    groups.length > 0 && (
      <section className="mt-10">
        <div className="flex items-baseline justify-between gap-4 border-b-2 border-navy pb-2">
          <h2 className="brand-heading text-xl text-navy">{title}</h2>
          {priced && <p className="text-sm font-semibold text-navy">{formatPrice(total)}</p>}
        </div>
        <div className="mt-4 grid gap-x-10 gap-y-6 md:grid-cols-2">
          {groups.map((g) => (
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
                    {priced && <span className="text-navy whitespace-nowrap">{formatPrice(i.retail ?? i.price ?? 0)}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    );
  return (
    <>
      {section("The Base Build", bom.baseTotal, bom.base)}
      {section("Upgrades in This Package", bom.upgradesTotal, bom.upgrades)}
    </>
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
