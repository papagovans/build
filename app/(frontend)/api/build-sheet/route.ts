import { decodeBuild } from "@/lib/pricing";
import { loadCatalog } from "@/lib/cms";
import { buildSheetFilename, renderBuildSheet } from "@/lib/build-sheet";

/**
 * POST { b, firstName, lastName, email } -> the Build Sheet PDF.
 *
 * It is a POST on purpose. The build itself is the shareable `?b=` string, but
 * the customer's name and email must never ride in a URL, so they travel in
 * the body. Everything is decoded through `decodeBuild()`, which drops unknown
 * or unavailable option ids, so a hand-edited payload cannot invent a build.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.b !== "string") {
    return new Response("Bad request", { status: 400 });
  }

  // The sheet is priced against the live catalog, not a copy the client sent,
  // so a tampered payload cannot invent prices.
  const catalog = await loadCatalog();
  const build = decodeBuild(catalog, body.b);
  if (!build.floorPlanId) {
    return new Response("Pick a floor plan first", { status: 400 });
  }

  const clean = (value: unknown) =>
    typeof value === "string" ? value.slice(0, 120).trim() : "";
  const customer = {
    firstName: clean(body.firstName),
    lastName: clean(body.lastName),
    email: clean(body.email),
  };

  const pdf = await renderBuildSheet(catalog, build, customer);

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${buildSheetFilename(catalog, build, customer)}"`,
      "Cache-Control": "no-store",
    },
  });
}
