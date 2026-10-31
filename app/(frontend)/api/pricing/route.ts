/**
 * The Pricing page's endpoint (owner, 2026-10-30). POST the master pricing
 * workbook as `file`: with no `publish` it returns what would change; with
 * `publish=1` it publishes the prices and the builder uses them at once.
 * Admin accounts only (the same login as /admin).
 */
import { getPayload } from "payload";
import config from "@payload-config";
import { loadCatalog } from "@/lib/cms";
import { billOfMaterials, packagesOf } from "@/lib/packages";
import { loadPricing, publishPricing } from "@/lib/pricing-store";
import { parseWorkbook, WorkbookError, type PricingData } from "@/lib/workbook";

export const dynamic = "force-dynamic";

export type Change = { item: string; from: number | null; to: number | null };

function diff<T>(a: T[], b: T[], key: (t: T) => string, name: (t: T) => string, price: (t: T) => number): Change[] {
  const am = new Map(a.map((t) => [key(t), t]));
  const bm = new Map(b.map((t) => [key(t), t]));
  const out: Change[] = [];
  for (const [k, t] of bm) {
    const was = am.get(k);
    if (!was || price(was) !== price(t)) out.push({ item: name(t), from: was ? price(was) : null, to: price(t) });
  }
  for (const [k, t] of am) if (!bm.has(k)) out.push({ item: name(t), from: price(t), to: null });
  return out;
}

/** Everything a buyer would see priced differently, live against uploaded. */
async function compare(next: PricingData) {
  const live = await loadPricing();
  const [before, after] = await Promise.all([loadCatalog(live.data), loadCatalog(next)]);
  const totals = (c: typeof before) =>
    packagesOf(c).map((p) => ({ slug: p.slug, name: `The ${p.name}`, total: billOfMaterials(c, p)?.total ?? 0 }));
  const vanName = (v: (typeof before.vanLengths)[number]) =>
    `${v.make[0].toUpperCase()}${v.make.slice(1)} ${v.wheelbase}"${v.extended ? " extended" : ""}`;
  return {
    live: live.version,
    packages: diff(totals(before), totals(after), (p) => p.slug, (p) => p.name, (p) => p.total),
    vans: diff(before.vanLengths, after.vanLengths, (v) => v.id, vanName, (v) => v.vanPrice),
    included: diff(
      [{ k: "short", p: live.data.base.short }, { k: "long", p: live.data.base.long }],
      [{ k: "short", p: next.base.short }, { k: "long", p: next.base.long }],
      (x) => x.k,
      (x) => `Included options, ${x.k === "short" ? "144" : "170 and longer"}`,
      (x) => x.p,
    ),
    upgrades: diff(live.data.upgrades, next.upgrades, (u) => u.code, (u) => `${u.code} ${u.name}`, (u) => u.price),
    layout: diff(Object.entries(live.data.layout), Object.entries(next.layout), ([c]) => c, ([c]) => c, ([, p]) => p),
    counts: { included: next.baseItems.length, upgrades: next.upgrades.length, layout: Object.keys(next.layout).length },
  };
}

export async function POST(req: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return Response.json({ error: "Log in to /admin first." }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No workbook attached." }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".xlsx")) return Response.json({ error: "That is not an .xlsx workbook." }, { status: 400 });

  let data: PricingData;
  try {
    data = await parseWorkbook(await file.arrayBuffer(), file.name);
  } catch (e) {
    if (e instanceof WorkbookError) return Response.json({ problems: e.problems }, { status: 422 });
    return Response.json({ error: `Could not read the workbook: ${(e as Error).message}` }, { status: 422 });
  }

  if (form.get("publish") === "1") {
    await publishPricing(data, String(user.email ?? "admin"));
    return Response.json({ published: true });
  }
  return Response.json(await compare(data));
}
