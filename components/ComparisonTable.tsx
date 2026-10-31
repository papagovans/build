"use client";

/**
 * All four packages side by side (owner, 2026-10-30), in four big sections:
 * Chassis, Floor Plan, Base Options, Upgrades. Every product in it opens the
 * builder's drawer (photo, maker, what it is, why you need it); the Base
 * Options row opens one listing all of them.
 */
import { Fragment, useState } from "react";
import Link from "next/link";
import { vanLabel, type Option } from "@/lib/catalog";
import type { BillOfMaterials, Package } from "@/lib/packages";
import { formatPrice } from "@/lib/pricing";
import { Lightbox } from "./Configurator";

type Info = { code: string; name: string; manufacturer?: string; model?: string; photo?: string; whatItIs?: string; whyYouNeedIt?: string; note?: string; price?: number };
const asOption = (i: Info, type: Option["type"]): Option => ({
  id: i.code,
  categoryId: "",
  name: i.name,
  type,
  price: i.price ?? 0,
  thumb: i.photo,
  manufacturer: i.manufacturer || undefined,
  model: i.model || undefined,
  whatItIs: i.whatItIs ?? i.note,
  whyYouNeedIt: i.whyYouNeedIt,
});

export default function ComparisonTable({ rows }: { rows: { pkg: Package; bom: BillOfMaterials }[] }) {
  const [open, setOpen] = useState<{ option: Option; parts?: Option[] } | null>(null);
  const has = (r: { pkg: Package }, code: string) => r.pkg.upgrades.includes(code);
  // Every upgrade any package carries, in the order packages add them.
  const seen = new Map<string, BillOfMaterials["upgrades"][number]["items"][number]>();
  for (const r of rows) for (const g of r.bom.upgrades) for (const i of g.items) if (!seen.has(i.code)) seen.set(i.code, i);
  const categories = [...new Set([...seen.values()].map((u) => u.category))];
  // Floor plan rows, in the builder's slot order, standard pieces left out.
  const layoutLabels = [...new Set(rows.flatMap((r) => r.bom.layout.filter((l) => l.label !== "Standard").map((l) => l.label)))];
  const cols = rows.length + 1;
  const cell = "px-3 py-2 text-center";
  const label = "pl-8 pr-3 py-2 text-left text-navy";
  const linkCls = "text-navy underline decoration-navy/25 underline-offset-2 hover:decoration-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold";

  const Section = ({ title, sub }: { title: string; sub?: string }) => (
    <tr className="bg-offwhite">
      <th colSpan={cols} className="px-3 pt-6 pb-2 text-left border-t-2 border-navy">
        <span className="brand-heading text-2xl text-navy">{title}</span>
        {sub && <span className="ml-3 text-sm font-normal text-steel">{sub}</span>}
      </th>
    </tr>
  );
  const Sub = ({ title }: { title: string }) => (
    <tr>
      <th colSpan={cols} className="pl-8 pr-3 pt-4 pb-1 text-left text-xs font-bold uppercase tracking-widest text-steel">{title}</th>
    </tr>
  );
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
                <Link href={`/packages/${r.pkg.slug}`} className="brand-heading text-white! text-lg hover:underline">{r.pkg.name}</Link>
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
          <Section title="Chassis" sub="Mercedes-Benz Sprinter" />
          {vanRows.map((v) => (
            <tr key={v.label}>
              <th className={`${label} font-normal`}>{v.label}</th>
              {rows.map((r) => <td key={r.pkg.slug} className={`${cell} text-navy`}>{v.value(r)}</td>)}
            </tr>
          ))}

          <Section title="Floor Plan" sub="Tap a choice for the details" />
          {layoutLabels.map((lab) => (
            <tr key={lab}>
              <th className={`${label} font-normal`}>{lab === "Add-on" ? "Extras" : lab}</th>
              {rows.map((r) => {
                const picks = r.bom.layout.filter((l) => l.label === lab);
                return (
                  <td key={r.pkg.slug} className={cell}>
                    {picks.length ? (
                      picks.map((p, i) => (
                        <Fragment key={p.code}>
                          {i > 0 && ", "}
                          <button type="button" className={linkCls} onClick={() => setOpen({ option: asOption(p, p.price ? "addon" : "included") })}>
                            {p.name}
                          </button>
                        </Fragment>
                      ))
                    ) : (
                      <span className="text-black/20">–</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}

          <Section title="Base Options" sub="The same in every package" />
          <tr>
            <th className={`${label} font-normal`}>
              <button
                type="button"
                className={linkCls}
                onClick={() => {
                  const b = rows[rows.length - 1].bom;
                  const parts = b.base.flatMap((g) => g.items).map((i) => asOption({ ...i, price: 0 }, "included"));
                  setOpen({
                    option: { id: "base", categoryId: "", name: "Base Options Included In All Vans", type: "included", price: 0, whatItIs: `Every Papago van comes with these ${parts.length} items, whichever package you choose or none.` },
                    parts,
                  });
                }}
              >
                See everything included
              </button>
            </th>
            {rows.map((r) => (
              <td key={r.pkg.slug} className={`${cell} text-navy`}>
                {r.bom.base.reduce((n, g) => n + g.items.length, 0)} items<span className="block text-xs text-steel">{formatPrice(r.bom.baseTotal)}</span>
              </td>
            ))}
          </tr>

          <Section title="Upgrades" sub="Tap one for the details" />
          {categories.map((c) => (
            <Fragment key={c}>
              <Sub title={c} />
              {[...seen].filter(([, u]) => u.category === c).map(([code, u]) => (
                <tr key={code}>
                  <th className={`${label} font-normal`}>
                    <button type="button" className={linkCls} onClick={() => setOpen({ option: asOption(u, "upgrade") })}>
                      {u.name}
                    </button>
                  </th>
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
      {open && <Lightbox option={open.option} parts={open.parts} onClose={() => setOpen(null)} />}
    </div>
  );
}
