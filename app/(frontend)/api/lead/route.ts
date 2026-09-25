import { submitBuildStartedLead } from "@/lib/hubspot";

/**
 * POST { firstName, lastName, email, phone, vanLength } -> 204.
 *
 * Fired when someone hands over their details at the start of a build. It goes
 * through the server rather than straight from the browser so the portal and
 * form ids stay in server env, and so a blocked request or an ad blocker on the
 * client cannot silently swallow leads.
 *
 * Always 204, even when HubSpot is unreachable. The caller is a buyer trying
 * to get to the next screen, not an integration that can retry, and nothing
 * about their build depends on the CRM answering.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) return new Response(null, { status: 204 });

  const clean = (v: unknown) => (typeof v === "string" ? v.slice(0, 120).trim() : "");
  const customer = {
    firstName: clean(body.firstName),
    lastName: clean(body.lastName),
    email: clean(body.email),
    phone: clean(body.phone),
  };

  const result = await submitBuildStartedLead(customer, clean(body.vanLength) || undefined);
  if (result === "failed") {
    console.error("Van builder lead did not reach HubSpot", { email: customer.email });
  }

  return new Response(null, { status: 204 });
}
