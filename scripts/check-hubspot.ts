/*
 * Self-check for the HubSpot lead submission.
 *
 *   npx tsx scripts/check-hubspot.ts
 *
 * The thing worth protecting is the contract: this never throws, and a HubSpot
 * outage never costs a customer the Build Sheet they asked for.
 */
import assert from "node:assert/strict";

const CATALOG = {
  floorPlans: [{ id: "zion", name: "Zion", basePrice: 180000, packages: [] }],
  categories: [],
  colorGroups: [],
  options: [],
} as never;

const BUILD = { floorPlanId: "zion", packageId: null, selected: [], colors: {} } as never;
const CUSTOMER = { firstName: "Ada", lastName: "Byron", email: "ada@example.com", phone: "6025550100" };

async function run() {
  delete process.env.HUBSPOT_PORTAL_ID;
  delete process.env.HUBSPOT_BUILD_SHEET_FORM_ID;
  const { submitBuildSheetLead } = await import("../lib/hubspot.js?nocfg=" + Date.now());
  assert.equal(await submitBuildSheetLead(CATALOG, BUILD, CUSTOMER), "skipped",
    "with no form configured it must skip, not throw");

  assert.equal(
    await submitBuildSheetLead(CATALOG, BUILD, { ...CUSTOMER, email: "" }),
    "skipped",
    "no email means no lead",
  );

  // A HubSpot outage must be swallowed, not raised.
  process.env.HUBSPOT_PORTAL_ID = "43782575";
  process.env.HUBSPOT_BUILD_SHEET_FORM_ID = "test-form";
  const fresh = await import("../lib/hubspot.js?down=" + Date.now());
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error("network down"); }) as typeof fetch;
  const out = await fresh.submitBuildSheetLead(CATALOG, BUILD, CUSTOMER);
  globalThis.fetch = realFetch;
  assert.ok(out === "failed" || out === "skipped", `a dead network must not throw, got ${out}`);

  console.log("hubspot lead submission: ok");
}

run().catch((e) => { console.error(e); process.exit(1); });
