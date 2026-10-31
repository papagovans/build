/**
 * Reads the master pricing workbook (papago-master-pricing.xlsx, owner
 * 2026-10-30) into the builder's pricing data. One reader for both ways in:
 * the Pricing page's upload and scripts/import-pricing.ts.
 *
 * Retail numbers only come out. Costs, install hours and markup are read to
 * work each retail price out and then dropped, because the result is served
 * to every buyer's browser.
 *
 * Retail is worked out from the workbook's inputs with the same arithmetic as
 * its formulas (qty x (unit cost + hours x labor) x (1 + markup)), because a
 * workbook last saved by a script carries no calculated values.
 *
 * Throws a WorkbookError listing everything wrong, rather than the first thing.
 */
import ExcelJS from "exceljs";

export class WorkbookError extends Error {
  constructor(public problems: string[]) {
    super(problems.join("\n"));
  }
}

// Workbook chassis code -> the builder's van id (?b= links use these).
export const VAN_IDS: Record<string, string> = {
  S144: "sprinter-144",
  S170: "sprinter-170",
  S170X: "sprinter-170x",
  T148: "transit-148",
  T148X: "transit-148x",
  P136: "promaster-136",
  P159: "promaster-159",
  P159X: "promaster-159x",
};
const TIERS = ["McKinley", "Zion", "Olympus", "El Capitan"];
const SLOT_ORDER = ["BD", "BC", "SH", "LR", "PI", "PU"];
const EXTRA_ORDER = ["SC01", "OC01", "SS01", "ST01", "CB01", "OHS1"];

export interface PricingData {
  source: string;
  vans: Record<string, { code: string; price: number }>;
  vanOptions: { code: string; name: string; fits: string; price: number }[];
  base: { short: number; long: number };
  baseItems: { code: string; category: string; name: string; manufacturer: string; model: string; fits: string; qty: number; retail: number }[];
  upgrades: { code: string; category: string; name: string; manufacturer: string; model: string; replaces: string | null; fits: string; price: number }[];
  layout: Record<string, number>;
  packages: { slug: string; name: string; tagline: string; van: string; vanOptions: string[]; upgrades: string[]; layout: string | null }[];
}

type Cell = ExcelJS.CellValue;
/** A cell's plain value: a formula's cached result, rich text as text. */
function plain(v: Cell): string | number | null {
  if (v == null) return null;
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if ("result" in v) return plain(v.result as Cell);
  if ("richText" in v) return v.richText.map((r) => r.text).join("");
  if ("text" in v) return String(v.text);
  return null;
}
const num = (v: Cell) => {
  const p = plain(v);
  return typeof p === "number" ? p : 0;
};
const str = (v: Cell) => {
  const p = plain(v);
  return p == null ? "" : String(p).trim();
};

/** A table: the header row's names -> column numbers, and its rows below. */
function table(ws: ExcelJS.Worksheet, headerRow: number, problems: string[], need: string[]) {
  const cols: Record<string, number> = {};
  ws.getRow(headerRow).eachCell((c, n) => {
    const name = str(c.value);
    if (name) cols[name] = n;
  });
  for (const n of need) if (!cols[n]) problems.push(`${ws.name}: no "${n}" column in row ${headerRow}`);
  return cols;
}

export async function parseWorkbook(buffer: ArrayBuffer, source: string): Promise<PricingData> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const problems: string[] = [];
  const sheet = (name: string) => {
    const ws = wb.getWorksheet(name);
    if (!ws) problems.push(`No "${name}" tab`);
    return ws;
  };
  const settings = sheet("Settings");
  const chassis = sheet("Chassis");
  const baseWs = sheet("Base Options");
  const upWs = sheet("Upgrades");
  const pkWs = sheet("Packages");
  const layoutWs = ["Beds", "Living", "Kitchen"].map((n) => sheet(n));
  if (problems.length) throw new WorkbookError(problems);

  const markup = num(settings!.getCell("B4").value);
  const labor = num(settings!.getCell("B5").value);
  const retailOf = (qty: number, unit: number, hrs: number, m: Cell) =>
    qty * (unit + hrs * labor) * (1 + (plain(m) == null || plain(m) === "" ? markup : num(m)));

  // Chassis: the vans, until the Van Options table, then the van options.
  const cc = table(chassis!, 4, problems, ["Code", "Placeholder Price"]);
  const vans: PricingData["vans"] = {};
  let optionsHeader = 0;
  for (let r = 5; r <= chassis!.rowCount; r++) {
    const code = str(chassis!.getCell(r, 1).value);
    if (code === "Van Options" || code === "Code") {
      optionsHeader = code === "Code" ? r : r + 1;
      break;
    }
    if (!code) continue;
    if (!VAN_IDS[code]) problems.push(`Chassis: ${code} has no builder van (add it to VAN_IDS in lib/workbook.ts)`);
    const price = plain(chassis!.getCell(r, cc["Placeholder Price"]).value);
    if (typeof price !== "number") problems.push(`Chassis: ${code} Placeholder Price is not a number`);
    else if (VAN_IDS[code]) vans[VAN_IDS[code]] = { code, price: Math.round(price) };
  }
  for (const id of Object.values(VAN_IDS)) if (!Object.values(vans).length || !vans[id]) problems.push(`Chassis: no row for ${id}`);

  const vanOptions: PricingData["vanOptions"] = [];
  const packageVanOptions: Record<string, string[]> = Object.fromEntries(TIERS.map((t) => [t, []]));
  if (optionsHeader) {
    const vc = table(chassis!, optionsHeader, problems, ["Code", "Option", "Fits", "Placeholder Price", ...TIERS]);
    for (let r = optionsHeader + 1; r <= chassis!.rowCount; r++) {
      const code = str(chassis!.getCell(r, vc.Code).value);
      if (!code) continue;
      vanOptions.push({ code, name: str(chassis!.getCell(r, vc.Option).value), fits: str(chassis!.getCell(r, vc.Fits).value), price: Math.round(num(chassis!.getCell(r, vc["Placeholder Price"]).value)) });
      for (const t of TIERS) if (num(chassis!.getCell(r, vc[t]).value)) packageVanOptions[t].push(code);
    }
  } else problems.push("Chassis: no Van Options table");

  // Base options: every line's retail, and the total for a short and a long van.
  const bc = table(baseWs!, 4, problems, ["Code", "Category", "Description", "Manufacturer", "Model #", "Fits", "Qty", "Unit Cost", "Install Hrs", "Markup %"]);
  const base = { short: 0, long: 0 };
  const baseItems: PricingData["baseItems"] = [];
  const baseRetail: Record<string, number> = {};
  baseWs!.eachRow((row, r) => {
    if (r < 5) return;
    const code = str(row.getCell(bc.Code).value);
    if (!code) return;
    const qty = num(row.getCell(bc.Qty).value);
    const retail = retailOf(qty, num(row.getCell(bc["Unit Cost"]).value), num(row.getCell(bc["Install Hrs"]).value), row.getCell(bc["Markup %"]).value);
    const fits = str(row.getCell(bc.Fits).value) || "All";
    baseRetail[code] = retail;
    if (fits === "All" || fits === "Short") base.short += retail;
    if (fits === "All" || fits === "Long") base.long += retail;
    baseItems.push({
      code, category: str(row.getCell(bc.Category).value), name: str(row.getCell(bc.Description).value),
      manufacturer: str(row.getCell(bc.Manufacturer).value), model: str(row.getCell(bc["Model #"]).value),
      fits, qty, retail: Math.round(retail),
    });
  });
  base.short = Math.round(base.short);
  base.long = Math.round(base.long);
  if (!base.short) problems.push("Base Options: retail comes to $0; fill in the costs");

  // Upgrades: what the buyer pays on top (retail less the base line it
  // replaces), and how many each package carries.
  const uc = table(upWs!, 4, problems, ["Code", "Category", "Description", "Manufacturer", "Model #", "Replaces", "Fits", "Unit Cost", "Install Hrs", "Markup %", ...TIERS]);
  const upgrades: PricingData["upgrades"] = [];
  const packageUpgrades: Record<string, string[]> = Object.fromEntries(TIERS.map((t) => [t, []]));
  upWs!.eachRow((row, r) => {
    if (r < 5) return;
    const code = str(row.getCell(uc.Code).value);
    if (!code) return;
    const replaces = str(row.getCell(uc.Replaces).value) || null;
    if (replaces && baseRetail[replaces] === undefined) problems.push(`Upgrades: ${code} replaces ${replaces}, which is not on Base Options`);
    const pays = retailOf(1, num(row.getCell(uc["Unit Cost"]).value), num(row.getCell(uc["Install Hrs"]).value), row.getCell(uc["Markup %"]).value) - (replaces ? baseRetail[replaces] ?? 0 : 0);
    upgrades.push({
      code, category: str(row.getCell(uc.Category).value), name: str(row.getCell(uc.Description).value),
      manufacturer: str(row.getCell(uc.Manufacturer).value), model: str(row.getCell(uc["Model #"]).value),
      replaces, fits: str(row.getCell(uc.Fits).value) || "All", price: Math.round(pays),
    });
    for (const t of TIERS) if (num(row.getCell(uc[t]).value)) packageUpgrades[t].push(code);
  });

  // Layout pieces (Beds, Living, Kitchen): what each adds over the standard
  // pick, and the pieces each package ticks, which become its layout code.
  const layout: Record<string, number> = {};
  const packagePieces: Record<string, string[]> = Object.fromEntries(TIERS.map((t) => [t, []]));
  for (const ws of layoutWs) {
    const lc = table(ws!, 4, problems, ["Code", "Unit Cost", "Install Hrs", "Markup %", ...TIERS]);
    ws!.eachRow((row, r) => {
      if (r < 5) return;
      const full = str(row.getCell(lc.Code).value);
      if (!full) return;
      const code = full.split("-").slice(1).join("-"); // S170-BD01 -> BD01
      layout[code] = Math.round(retailOf(1, num(row.getCell(lc["Unit Cost"]).value), num(row.getCell(lc["Install Hrs"]).value), row.getCell(lc["Markup %"]).value));
      for (const t of TIERS) if (num(row.getCell(lc[t]).value)) packagePieces[t].push(code);
    });
  }
  const layoutCode = (pieces: string[]) =>
    pieces.length
      ? SLOT_ORDER.flatMap((s) => pieces.filter((p) => p.startsWith(s))).join("-") + EXTRA_ORDER.filter((e) => pieces.includes(e)).map((e) => "+" + e).join("")
      : null;

  // Packages: tagline and chassis from the Packages tab.
  const labels: Record<string, number> = {};
  pkWs!.eachRow((row, r) => {
    const l = str(row.getCell(1).value);
    if (l && r >= 5) labels[l] = r;
  });
  if (!labels.Chassis || !labels.Tagline) problems.push("Packages: no Chassis or Tagline row");
  const packages: PricingData["packages"] = TIERS.map((t, i) => {
    const chassisCode = labels.Chassis ? str(pkWs!.getCell(labels.Chassis, 2 + i).value) : "";
    if (!VAN_IDS[chassisCode]) problems.push(`Packages: ${t} chassis "${chassisCode}" is not a van on the Chassis tab`);
    return {
      slug: t.toLowerCase().replace(/ /g, "-"),
      name: t,
      tagline: labels.Tagline ? str(pkWs!.getCell(labels.Tagline, 2 + i).value) : "",
      van: VAN_IDS[chassisCode] ?? "",
      vanOptions: packageVanOptions[t],
      upgrades: packageUpgrades[t],
      layout: layoutCode(packagePieces[t]),
    };
  });

  if (problems.length) throw new WorkbookError([...new Set(problems)]);
  return { source, vans, vanOptions, base, baseItems, upgrades, layout, packages };
}
