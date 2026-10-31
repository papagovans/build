import type { Metadata } from "next";
import { headers } from "next/headers";
import { getPayload } from "payload";
import config from "@payload-config";
import { PackagesShell } from "@/components/Packages";
import PricingUpload from "@/components/PricingUpload";
import { listVersions } from "@/lib/pricing-store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pricing | Papago Vans", robots: { index: false, follow: false } };

/**
 * Where staff publish the master pricing workbook to the builder (owner,
 * 2026-10-30): upload, see what changes, publish. Admin accounts only.
 */
export default async function PricingPage() {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await headers() });
  if (!user) {
    return (
      <PackagesShell>
        <h1 className="brand-heading text-4xl leading-none">Pricing</h1>
        <p className="mt-4 text-steel">
          This page is for Papago staff.{" "}
          <a href="/admin/login?redirect=%2Fpricing" className="font-semibold text-navy underline">Log in to the admin</a>, then come back here.
        </p>
      </PackagesShell>
    );
  }
  const versions = await listVersions().catch(() => []);
  return (
    <PackagesShell>
      <h1 className="brand-heading text-4xl leading-none">Pricing</h1>
      <p className="mt-3 text-steel max-w-2xl">
        Upload the master pricing workbook (papago-master-pricing.xlsx). You will see every price that changes before
        anything goes live. Publish, and the builder and the package pages use the new prices right away.
      </p>
      <div className="mt-8">
        <PricingUpload />
      </div>
      <h2 className="brand-heading text-xl text-navy mt-14">Published Versions</h2>
      <p className="mt-1 text-sm text-steel">Newest first. The top one is live.</p>
      {versions.length === 0 ? (
        <p className="mt-3 text-sm text-steel">Nothing published yet: the builder is on the prices it shipped with.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line border-y border-line max-w-3xl">
          {versions.slice(0, 20).map((v, i) => (
            <li key={v.url} className="py-2 flex flex-wrap items-baseline justify-between gap-3 text-sm">
              <span className="text-navy">
                {new Date(v.publishedAt).toLocaleString("en-US", { timeZone: "America/Phoenix", dateStyle: "medium", timeStyle: "short" })}
                {i === 0 && <span className="ml-2 text-xs font-bold uppercase tracking-widest text-sky">Live</span>}
              </span>
              <span className="text-steel">{v.source} · {v.by}</span>
            </li>
          ))}
        </ul>
      )}
    </PackagesShell>
  );
}
