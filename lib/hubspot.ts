/*
 * Lead submission to HubSpot.
 *
 * Every form for this business is built in HubSpot, so this posts to a HubSpot
 * form rather than writing to the CRM directly. Two reasons that matters:
 * there is no private app token to leak from this repo, and whoever owns the
 * form owns the fields, the notifications and the follow-up without a deploy.
 *
 * Set HUBSPOT_PORTAL_ID and HUBSPOT_BUILD_SHEET_FORM_ID in Vercel. Until both
 * exist this is a no-op, so the Build Sheet keeps working before the form does.
 */
import type { Catalog } from "./catalog";
import { getFloorPlan, getPackages } from "./catalog";
import type { BuildState } from "./pricing";
import { priceBuild, encodeBuild } from "./pricing";

const PORTAL_ID = process.env.HUBSPOT_PORTAL_ID;
const FORM_ID = process.env.HUBSPOT_BUILD_SHEET_FORM_ID;
const BUILD_URL = process.env.NEXT_PUBLIC_BUILD_URL ?? "https://build.papagovans.com";

export interface LeadCustomer {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

/**
 * Fire and forget. Returns "sent", "skipped" or "failed" so the caller can log
 * it, and never throws: a lead that fails to reach HubSpot must not cost the
 * customer the Build Sheet they actually asked for.
 */
export async function submitBuildSheetLead(
  catalog: Catalog,
  build: BuildState,
  customer: LeadCustomer,
): Promise<"sent" | "skipped" | "failed"> {
  if (!PORTAL_ID || !FORM_ID) return "skipped";
  if (!customer.email) return "skipped";

  const plan = build.floorPlanId ? getFloorPlan(catalog, build.floorPlanId) : undefined;
  const pkg =
    build.floorPlanId && build.packageId
      ? getPackages(catalog, build.floorPlanId).find((p) => p.id === build.packageId)
      : undefined;
  const price = priceBuild(catalog, build);

  /* The shareable build link, so whoever picks up the phone can open exactly
   * what the customer configured rather than reading it off a PDF. */
  const buildLink = `${BUILD_URL}/?b=${encodeBuild(build)}`;

  const fields = [
    { name: "firstname", value: customer.firstName },
    { name: "lastname", value: customer.lastName },
    { name: "email", value: customer.email },
    { name: "phone", value: customer.phone },
    { name: "papago_floor_plan", value: plan?.name ?? "" },
    { name: "papago_trim_package", value: pkg?.name ?? "" },
    { name: "papago_build_total", value: String(price.total) },
    { name: "papago_option_count", value: String(build.selected.length) },
    { name: "papago_build_link", value: buildLink },
  ].filter((f) => f.value !== "");

  try {
    const res = await fetch(
      `https://api.hsforms.com/submissions/v3/integration/submit/${PORTAL_ID}/${FORM_ID}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields,
          context: { pageUri: buildLink, pageName: "Build Sheet request" },
        }),
      },
    );
    if (!res.ok) {
      console.error("HubSpot submission failed", res.status, await res.text().catch(() => ""));
      return "failed";
    }
    return "sent";
  } catch (error) {
    console.error("HubSpot submission threw", error);
    return "failed";
  }
}
