"use client";

/**
 * A package's lines, in three parts (owner, 2026-10-30): the Included
 * Options, the same in every package; the layout choices; then the Upgrades,
 * grouped by the package each first appears in so the step up from one
 * package to the next is plain. Every name opens the same drawer the builder
 * uses, with the photo, maker, what it is and why you need it. With `priced`,
 * every line carries its price and the included list starts open: the Build
 * Sheet. Without, it is the package page.
 */
import { useState } from "react";
import type { Option } from "@/lib/catalog";
import type { BillOfMaterials } from "@/lib/packages";
import { formatPrice } from "@/lib/pricing";
import { Lightbox } from "./Configurator";

type Item = {
  code: string;
  name: string;
  manufacturer?: string;
  model?: string;
  photo?: string;
  whatItIs?: string;
  whyYouNeedIt?: string;
  price?: number;
  note?: string;
};

function asOption(i: Item, type: Option["type"]): Option {
  return {
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
  };
}

export default function PackageLineItems({ bom, priced, name }: { bom: BillOfMaterials; priced?: boolean; name: string }) {
  const [open, setOpen] = useState<Option | null>(null);
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
  const link = (i: Item, type: Option["type"]) => (
    <button
      type="button"
      onClick={() => setOpen(asOption(i, type))}
      className="text-left text-navy underline decoration-navy/25 underline-offset-2 hover:decoration-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
    >
      {i.name}
    </button>
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
                      <span>
                        {i.qty && i.qty > 1 ? `${i.qty}x ` : ""}
                        {link({ ...i, price: 0 }, "included")}
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
          {heading("Layout", `The ${name}'s floor plan, each choice at what it adds over the standard pick`, bom.layoutTotal)}
          <ul className="mt-3 divide-y divide-line md:columns-2 md:gap-10 md:divide-y-0">
            {bom.layout.map((l) => (
              <li key={l.code} className="flex items-baseline justify-between gap-3 py-1.5 text-sm break-inside-avoid md:border-b md:border-line">
                <span>
                  {link(l, l.price ? "addon" : "included")}
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
                  <span>
                    {link(i, "upgrade")}
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

      {open && <Lightbox option={open} onClose={() => setOpen(null)} />}
    </>
  );
}
