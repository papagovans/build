"use client";

/**
 * Upload the workbook, see what changes, publish (owner, 2026-10-30). The
 * same file goes up twice: once to compare, once to publish, so what
 * publishes is exactly what was reviewed.
 */
import { useState } from "react";
import { formatPrice } from "@/lib/pricing";

type Change = { item: string; from: number | null; to: number | null };
type Preview = {
  live: { publishedAt: string; source: string } | null;
  packages: Change[];
  vans: Change[];
  included: Change[];
  upgrades: Change[];
  layout: Change[];
  counts: { included: number; upgrades: number; layout: number };
};

async function send(file: File, publish: boolean) {
  const body = new FormData();
  body.set("file", file);
  if (publish) body.set("publish", "1");
  const res = await fetch("/api/pricing", { method: "POST", body });
  return { ok: res.ok, json: await res.json() };
}

function Changes({ title, rows }: { title: string; rows: Change[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="mt-6">
      <h3 className="text-xs font-bold uppercase tracking-widest text-steel mb-1">{title} ({rows.length})</h3>
      <table className="w-full max-w-3xl text-sm">
        <tbody className="divide-y divide-line">
          {rows.map((r) => {
            const delta = r.from != null && r.to != null ? r.to - r.from : null;
            return (
              <tr key={r.item}>
                <td className="py-1.5 pr-4 text-navy">{r.item}</td>
                <td className="py-1.5 pr-4 text-right text-steel whitespace-nowrap">{r.from == null ? "new" : formatPrice(r.from)}</td>
                <td className="py-1.5 pr-4 text-right text-navy font-semibold whitespace-nowrap">{r.to == null ? "removed" : formatPrice(r.to)}</td>
                <td className={`py-1.5 text-right whitespace-nowrap ${delta == null ? "text-steel" : delta > 0 ? "text-navy" : "text-steel"}`}>
                  {delta == null ? "" : `${delta > 0 ? "+" : "−"}${formatPrice(Math.abs(delta))}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export default function PricingUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  async function check(f: File) {
    setFile(f);
    setPreview(null);
    setProblems([]);
    setDone(false);
    setBusy(true);
    const { ok, json } = await send(f, false);
    setBusy(false);
    if (ok) setPreview(json);
    else setProblems(json.problems ?? [json.error ?? "Something went wrong."]);
  }

  async function publish() {
    if (!file) return;
    setBusy(true);
    const { ok, json } = await send(file, true);
    setBusy(false);
    if (ok) setDone(true);
    else setProblems(json.problems ?? [json.error ?? "Something went wrong."]);
  }

  const changed = preview
    ? preview.packages.length + preview.vans.length + preview.included.length + preview.upgrades.length + preview.layout.length
    : 0;

  return (
    <div>
      <label className="block max-w-3xl rounded-lg border-2 border-dashed border-steel/40 bg-white p-8 text-center cursor-pointer hover:border-navy transition-colors">
        <input
          type="file"
          accept=".xlsx"
          className="sr-only"
          onChange={(e) => e.target.files?.[0] && check(e.target.files[0])}
        />
        <span className="block brand-heading text-lg text-navy">{file ? file.name : "Choose the workbook"}</span>
        <span className="block mt-1 text-sm text-steel">{busy ? "Reading it…" : "papago-master-pricing.xlsx, from Dropbox"}</span>
      </label>

      {problems.length > 0 && (
        <div role="alert" className="mt-6 max-w-3xl rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">Nothing was published. Fix these in the workbook and upload it again:</p>
          <ul className="mt-2 list-disc pl-5 space-y-0.5">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        </div>
      )}

      {done && (
        <div role="status" className="mt-6 max-w-3xl rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900">
          Published. The builder and the package pages are on the new prices now (within 30 seconds). Reload this page to see it in the list.
        </div>
      )}

      {preview && !done && (
        <div className="mt-8">
          <p className="text-sm text-steel">
            Read {preview.counts.included} included options, {preview.counts.upgrades} upgrades and {preview.counts.layout} layout pieces.
            Compared with what is live{preview.live ? ` (published ${new Date(preview.live.publishedAt).toLocaleDateString("en-US")})` : " (the prices the builder shipped with)"}:
          </p>
          {changed === 0 ? (
            <p className="mt-4 font-semibold text-navy">No price changes. Publishing would change nothing a buyer sees.</p>
          ) : (
            <>
              <Changes title="Package totals" rows={preview.packages} />
              <Changes title="Van prices" rows={preview.vans} />
              <Changes title="Included options" rows={preview.included} />
              <Changes title="Upgrades" rows={preview.upgrades} />
              <Changes title="Layout pieces" rows={preview.layout} />
            </>
          )}
          <div className="mt-8 flex gap-3">
            <button
              onClick={publish}
              disabled={busy}
              className="px-8 py-3 rounded-full bg-gold text-navy text-sm font-semibold hover:bg-gold-deep transition-colors disabled:opacity-40"
            >
              {busy ? "Publishing…" : "Publish these prices"}
            </button>
            <button
              onClick={() => { setPreview(null); setFile(null); }}
              className="px-6 py-3 rounded-full border-2 border-navy text-navy text-sm font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
