import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Eyebrow, LineItems, PackageActions, PackagesShell, PriceSummary } from "@/components/Packages";
import { VAN_NOTE } from "@/lib/catalog";
import { loadCatalog } from "@/lib/cms";
import { billOfMaterials, customizeLink, getPackage } from "@/lib/packages";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/packages/[slug]/build-sheet">): Promise<Metadata> {
  const pkg = getPackage(await loadCatalog(), (await params).slug);
  return { title: pkg ? `${pkg.name} Build Sheet | Papago Vans` : "Build Sheet | Papago Vans" };
}

/** Build as Is: the package's bill of materials, every line priced. */
export default async function PackageBuildSheet({ params }: PageProps<"/packages/[slug]/build-sheet">) {
  const catalog = await loadCatalog();
  const pkg = getPackage(catalog, (await params).slug);
  if (!pkg) notFound();
  const bom = billOfMaterials(catalog, pkg);
  if (!bom) notFound();
  return (
    <PackagesShell>
      <Link href={`/packages/${pkg.slug}`} className="text-sm text-steel hover:text-navy">← The {pkg.name}</Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
        <div>
          <Eyebrow>Build Sheet</Eyebrow>
          <h1 className="brand-heading text-4xl sm:text-5xl leading-none mt-1">The {pkg.name}, as Is</h1>
        </div>
        <PackageActions pkg={pkg} customize={customizeLink(catalog, pkg)} showSheet={false} />
      </div>
      <div className="mt-6 max-w-2xl">
        <PriceSummary bom={bom} />
        <p className="mt-2 text-xs text-steel">{VAN_NOTE} Estimated prices, round one.</p>
      </div>
      <LineItems bom={bom} priced name={pkg.name} />
      <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
        <p className="text-sm text-steel">Questions about this build? Call us at <a href="tel:+14807617175" className="font-semibold text-navy">(480) 761-7175</a>.</p>
        <PackageActions pkg={pkg} customize={customizeLink(catalog, pkg)} showSheet={false} />
      </div>
    </PackagesShell>
  );
}
