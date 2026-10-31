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
