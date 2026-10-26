/**
 * The modular build: the pieces a buyer picks, by the team's codes
 * (owner, 2026-10-26; claude.ai/artifact/YX4sDowV5Siyscyhn7sTSS).
 *
 * A layout is stored as its build code, the same line the team says on a
 * call: "BD01-BC02-DW01-DL02-PI01-PU01+SC01+SS01". Pick-one pieces in step
 * order joined by "-", each yes add-on with "+". The chassis prefix (S170-)
 * is left off because the van is already its own field of the build.
 *
 * The 3D model is one .glb per lineup, made by `npm run modular-models`, with
 * a "<code>-in" and "<code>-out" animation for every piece.
 *
 * ponytail: hard-coded while there is one lineup on one chassis. Move to a
 * Payload collection when a second lineup lands or the shop wants to edit
 * names. The names here are descriptive placeholders until the owner names
 * them; no prices yet, so the conversion price is unchanged.
 */
export type Fit = "blue" | "red";

export interface Piece {
  code: string;
  name: string;
  note: string;
  /** DW sets the fit; DL must match it. */
  fit?: Fit;
}

export interface Slot {
  id: "BD" | "BC" | "DW" | "DL" | "PI" | "PU";
  title: string;
  pieces: Piece[];
}

export const SLOTS: Slot[] = [
  {
    id: "BD",
    title: "Bed",
    pieces: [{ code: "BD01", name: "Rear Platform Bed", note: "Fixed across the back, with a garage underneath" }],
  },
  {
    id: "BC",
    title: "Bed Cap",
    pieces: [
      { code: "BC01", name: "Bed Cap 1", note: "The panel that closes the front of the bed" },
      { code: "BC02", name: "Bed Cap 2", note: "The panel that closes the front of the bed" },
    ],
  },
  {
    id: "DW",
    title: "Shower",
    pieces: [
      { code: "DW01", name: "Shower", note: "Enclosed shower with toilet", fit: "blue" },
      { code: "DW02", name: "No Shower", note: "A tall cabinet in its place", fit: "red" },
    ],
  },
  {
    id: "DL",
    title: "Living Room",
    pieces: [
      { code: "DL01", name: "Living Room 1", note: "Bench seat, fold-out table, under-counter fridge", fit: "blue" },
      { code: "DL02", name: "Living Room 2", note: "Bench seat, fold-out table, tall fridge", fit: "blue" },
      { code: "DL03", name: "Living Room 3", note: "Longer bench, fold-out table, under-counter fridge", fit: "red" },
      { code: "DL04", name: "Living Room 4", note: "Longer bench, fold-out table, tall fridge", fit: "red" },
    ],
  },
  {
    id: "PI",
    title: "Kitchenette Insert",
    pieces: [
      { code: "PI01", name: "Drawers", note: "Three drawers and a door under the counter" },
      { code: "PI02", name: "Cupboard", note: "A double-door cupboard under the counter" },
    ],
  },
  {
    id: "PU",
    title: "Kitchen Uppers",
    pieces: [
      { code: "PU01", name: "With Microwave", note: "Overhead cabinets with a built-in microwave" },
      { code: "PU02", name: "Without Microwave", note: "Overhead cabinets, all storage" },
    ],
  },
];

/** Yes-or-no add-ons, in the order they are asked. */
export const EXTRAS: Piece[] = [
  { code: "SC01", name: "Sconces", note: "A pair of reading lights above the bed" },
  { code: "OC01", name: "Bed Soft Cabinets", note: "Overhead cabinets above the bed, driver side" },
  { code: "SS01", name: "Rear Garage Slide-Out", note: "A tray that pulls out the back doors" },
  { code: "ST01", name: "Stove Top", note: "A two-burner cooktop set into the counter" },
  { code: "CB01", name: "Sink Cutting Board", note: "A board that sits over the sink" },
];

/** On every van, never a choice: the kitchenette and the fold-out table. */
export const STANDARD = ["PK01", "FT01"];

/** Van id -> the lineup model. */
const LINEUPS: Record<string, string> = {
  "sprinter-170": "/models/sprinter-170-lineup-1.glb",
};
export const lineupModelFor = (vanId: string | null) => (vanId ? LINEUPS[vanId] : undefined);
export const isModular = (vanId: string | null) => Boolean(lineupModelFor(vanId));

export interface Layout {
  /** slot id -> chosen code */
  picks: Partial<Record<Slot["id"], string>>;
  extras: string[];
}

const slotOf = (code: string) => SLOTS.find((s) => s.pieces.some((p) => p.code === code));
export const getPiece = (code: string) =>
  [...SLOTS.flatMap((s) => s.pieces), ...EXTRAS].find((p) => p.code === code);

/** The only bed so far is chosen for the buyer: one option is not a question. */
export const emptyLayout = (): Layout => ({ picks: { BD: "BD01" }, extras: [] });

/** Reads a build code, dropping anything unknown or a living room that does not fit. */
export function parseLayout(code: string | null | undefined): Layout {
  const layout = emptyLayout();
  if (!code) return layout;
  // A pasted link can arrive with "+" already decoded to a space.
  const [main, ...extras] = code.split(/[+ ]/);
  for (const c of main.split("-")) {
    const slot = slotOf(c);
    if (slot) layout.picks[slot.id] = c;
  }
  layout.extras = EXTRAS.map((e) => e.code).filter((c) => extras.includes(c));
  const dl = layout.picks.DL;
  if (dl && getPiece(dl)?.fit !== getPiece(layout.picks.DW ?? "")?.fit) delete layout.picks.DL;
  return layout;
}

export function layoutCode(layout: Layout): string {
  const main = SLOTS.map((s) => layout.picks[s.id]).filter(Boolean).join("-");
  return [main, ...layout.extras].join("+");
}

/** Choosing a shower (or not) drops a living room of the other colour. */
export function pick(layout: Layout, slot: Slot["id"], code: string): Layout {
  const picks = { ...layout.picks, [slot]: code };
  if (slot === "DW" && picks.DL && getPiece(picks.DL)?.fit !== getPiece(code)?.fit) delete picks.DL;
  return { ...layout, picks };
}

export const toggleExtra = (layout: Layout, code: string): Layout => ({
  ...layout,
  extras: layout.extras.includes(code)
    ? layout.extras.filter((c) => c !== code)
    : EXTRAS.map((e) => e.code).filter((c) => c === code || layout.extras.includes(c)),
});

/** Living rooms the chosen shower allows; none until a shower is chosen. */
export const livingRoomsFor = (layout: Layout) => {
  const fit = getPiece(layout.picks.DW ?? "")?.fit;
  return fit ? SLOTS.find((s) => s.id === "DL")!.pieces.filter((p) => p.fit === fit) : [];
};

export const slot = (id: Slot["id"]) => SLOTS.find((s) => s.id === id)!;

/** Every piece in a layout, labelled, for the summary and the Build Sheet. */
export function layoutLines(code: string | null) {
  const layout = parseLayout(code);
  const standard: Piece[] = [
    { code: "PK01", name: "Kitchenette", note: "Counter, sink and storage, passenger side" },
    { code: "FT01", name: "Fold-Out Table", note: "Hinged to the end of the galley" },
  ];
  return [
    ...SLOTS.filter((s) => layout.picks[s.id]).map((s) => ({ label: s.title, piece: getPiece(layout.picks[s.id]!)! })),
    ...standard.map((piece) => ({ label: "Standard", piece })),
    ...layout.extras.map((c) => ({ label: "Add-on", piece: getPiece(c)! })),
  ];
}

/** The full code as the team writes it, with the chassis in front. */
export const fullCode = (code: string | null) => (code ? `S170-${code}` : "");
