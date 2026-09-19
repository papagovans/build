import Configurator from "@/components/Configurator";
import { loadCatalog } from "@/lib/cms";

/**
 * Rendered per request so a catalog edit in the admin shows up immediately.
 * The whole catalog is a handful of small queries against Neon in the same
 * region. If that ever costs anything, cache it under a tag and revalidate
 * from a Payload afterChange hook rather than going back to build-time data.
 */
export const dynamic = "force-dynamic";

export default async function Page() {
  const catalog = await loadCatalog();
  return <Configurator catalog={catalog} />;
}
