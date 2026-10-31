/**
 * Where the published prices live (owner, 2026-10-30): the Pricing page
 * (/pricing) reads the uploaded workbook and publishes its retail prices here,
 * and every builder and package page reads them back on each request. No
 * deploy between the workbook and the live site.
 *
 * Each publish is its own file in Vercel Blob, pricing/versions/<time>.json,
 * and the newest one is live. Nothing is overwritten, so every version stays
 * for rollback, and a CDN can never serve a stale "latest". Retail only: the
 * store is public, like the product photos, and costs never reach it.
 *
 * With nothing published, or the store unreachable, the builder runs on the
 * copy it shipped with (lib/pricing-data.json).
 */
import "server-only";

import { list, put } from "@vercel/blob";
import bundled from "./pricing-data.json";
import type { PricingData } from "./workbook";

const PREFIX = "pricing/versions/";

export interface PricingVersion {
  url: string;
  publishedAt: string;
  source: string;
  by: string;
}

/* One lookup per server instance every 30 seconds, not one per page view. */
let cached: { at: number; data: PricingData; version: PricingVersion | null } | undefined;

export async function listVersions(): Promise<PricingVersion[]> {
  const { blobs } = await list({ prefix: PREFIX, limit: 100 });
  return blobs
    .map((b) => {
      // pricing/versions/<ISO time>__<who>__<file>.json
      const [time, by, ...rest] = b.pathname.slice(PREFIX.length, -".json".length).split("__");
      return { url: b.url, publishedAt: time.replace(/_/g, ":"), by: decodeURIComponent(by ?? ""), source: decodeURIComponent(rest.join("__")) };
    })
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export async function loadPricing(): Promise<{ data: PricingData; version: PricingVersion | null }> {
  if (cached && Date.now() - cached.at < 30_000) return cached;
  let result: { data: PricingData; version: PricingVersion | null } = { data: bundled as PricingData, version: null };
  try {
    const [latest] = await listVersions();
    if (latest) {
      const res = await fetch(latest.url, { cache: "no-store" });
      if (res.ok) result = { data: (await res.json()) as PricingData, version: latest };
    }
  } catch (e) {
    console.error("pricing: falling back to the bundled prices", e);
  }
  cached = { at: Date.now(), ...result };
  return result;
}

export async function publishPricing(data: PricingData, by: string): Promise<void> {
  const time = new Date().toISOString().replace(/:/g, "_");
  const name = `${PREFIX}${time}__${encodeURIComponent(by)}__${encodeURIComponent(data.source)}.json`;
  await put(name, JSON.stringify(data), { access: "public", contentType: "application/json", addRandomSuffix: false });
  cached = undefined;
}
