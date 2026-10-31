import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Eyebrow, PackageActions, PackagesShell, PriceSummary } from "@/components/Packages";
import { vanLabel } from "@/lib/catalog";
import PackageLineItems from "@/components/PackageLineItems";
import { loadCatalog } from "@/lib/cms";
import { billOfMaterials, customizeLink, getPackage } from "@/lib/packages";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/packages/[slug]">): Promise<Metadata> {
  const pkg = getPackage(await loadCatalog(), (await params).slug);
  return { title: pkg ? `The ${pkg.name} | Papago Vans` : "Package | Papago Vans" };
}

export default async function PackagePage({ params }: PageProps<"/packages/[slug]">) {
  const catalog = await loadCatalog();
  const pkg = getPackage(catalog, (await params).slug);
  if (!pkg) notFound();
  const bom = billOfMaterials(catalog, pkg);
  if (!bom) notFound();
  return (
    <PackagesShell>
      <Link href="/packages" className="text-sm text-steel hover:text-navy">← All packages</Link>
      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <div className="relative w-full aspect-[903/576] bg-offwhite rounded-lg overflow-hidden">
          {bom.van.image && <Image src={bom.van.image} alt={vanLabel(bom.van)} fill priority sizes="(max-width: 1024px) 100vw, 680px" className="object-contain" />}
        </div>
        <div>
          <Eyebrow>{pkg.tagline}</Eyebrow>
          <h1 className="brand-heading text-4xl sm:text-5xl leading-none mt-1">The {pkg.name}</h1>
          <p className="mt-3 text-steel">
            Built on the {vanLabel(bom.van)}
            {bom.vanOptions.length > 0 && ` with ${bom.vanOptions.map((v) => v.name).join(", ").toLowerCase()}`}.{" "}
            {pkg.upgrades.length === 0 ? "Everything every Papago van gets, nothing added." : `Everything every Papago van gets, plus ${pkg.upgrades.length} upgrades.`}
          </p>
          <div className="mt-6">
            <PriceSummary bom={bom} />
          </div>
          <div className="mt-6">
            <PackageActions pkg={pkg} customize={customizeLink(catalog, pkg)} />
            <p className="mt-3 text-xs text-steel">
              Build as Is shows the Build Sheet with every line priced. Customize opens the builder with this package already in it.
            </p>
          </div>
        </div>
      </div>
      <PackageLineItems bom={bom} name={pkg.name} />
    </PackagesShell>
  );
}
