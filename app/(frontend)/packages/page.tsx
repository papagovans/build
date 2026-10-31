import type { Metadata } from "next";
import { ComparisonTable, PackageCard, PackagesShell, TwoWays } from "@/components/Packages";
import { loadCatalog } from "@/lib/cms";
import { billOfMaterials, packagesOf } from "@/lib/packages";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Van Packages | Papago Vans" };

export default async function PackagesPage() {
  const catalog = await loadCatalog();
  const rows = packagesOf(catalog).flatMap((pkg) => {
    const bom = billOfMaterials(catalog, pkg);
    return bom ? [{ pkg, bom }] : [];
  });
  return (
    <PackagesShell>
      <h1 className="brand-heading text-4xl sm:text-5xl leading-none">Two Ways to Start</h1>
      <p className="mt-3 text-steel max-w-2xl">
        Build your van piece by piece from scratch, or start from one of our four packages and change whatever you like.
      </p>
      <div className="mt-8">
        <TwoWays />
      </div>
      <h2 id="packages" className="brand-heading text-2xl text-navy mt-14 scroll-mt-6">The Packages</h2>
      <p className="mt-1 text-sm text-steel">All four are built on the Mercedes-Benz Sprinter. Every package has the same included options; each step up adds a bigger or all-wheel-drive van and more upgrades.</p>
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map(({ pkg, bom }) => <PackageCard key={pkg.slug} pkg={pkg} bom={bom} />)}
      </div>

      <h2 id="compare" className="brand-heading text-2xl text-navy mt-14 scroll-mt-6">Compare the Packages</h2>
      <p className="mt-1 mb-6 text-sm text-steel">Side by side, from the van up.</p>
      <ComparisonTable rows={rows} />
    </PackagesShell>
  );
}
