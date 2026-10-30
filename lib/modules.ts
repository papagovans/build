/**
 * The modular build: the pieces a buyer picks, by the team's codes
 * (owner, 2026-10-26; claude.ai/artifact/YX4sDowV5Siyscyhn7sTSS).
 *
 * A layout is stored as its build code, the same line the team says on a
 * call: "BD01-BC02-SHY-LRSH02-PI01-PU01+SC01+SS01". Pick-one pieces in step
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
export interface Piece {
  code: string;
  name: string;
  note: string;
}

export interface Slot {
  id: "BD" | "BC" | "SH" | "LR" | "PI" | "PU";
  title: string;
  pieces: Piece[];
}

export const SLOTS: Slot[] = [
  {
    id: "BD",
    title: "Bed",
    /* The five beds are named (owner, 2026-10-12). Only BD01 has a lineup
     * drawn, so every bed shows the Trailhead in 3D for now (owner,
     * 2026-10-27); a bed's own model replaces that when its lineup is
     * exported. */
    pieces: [
      {
        code: "BD01",
        name: "The Trailhead",
        note: "A fixed bed that\u2019s always made, with room under it for the gear you start every day with.",
      },
      { code: "BD02", name: "The Ridgeline", note: "The full-size fixed bed. Stretch out, and keep the big gear stowed below." },
      {
        code: "BD03",
        name: "The Lookout",
        note: "A fixed bed plus a two-seat nook by the window for coffee, maps and the view.",
      },
      {
        code: "BD04",
        name: "The Campfire",
        note: "Eat around the table at night, drop it and it\u2019s a bed. The whole van works as one room.",
      },
      {
        code: "BD05",
        name: "The High Camp",
        note: "Dinner at the table, then bring the bed down from the ceiling. Sleep upstairs and keep the living room set up.",
      },
    ],
  },
  {
    id: "BC",
    title: "Bed Cap",
    pieces: [
      { code: "BC01", name: "Bed Cap 1", note: "The panel that closes the front of the bed" },
      { code: "BC02", name: "Bed Cap 2", note: "The panel that closes the front of the bed" },
    ],
  },
  /* Shower yes or no (SHY, SHN), and the living rooms that fit each: the
   * shower takes LRSH living rooms, no shower takes LRNSH (owner, 2026-10-27).
   * Both sides are spelled out: a bare LR01 is kept for a future living room
   * that fits either. */
  {
    id: "SH",
    title: "Shower",
    pieces: [
      { code: "SHY", name: "Shower", note: "Enclosed shower with toilet" },
      { code: "SHN", name: "No Shower", note: "A tall cabinet in its place" },
    ],
  },
  {
    id: "LR",
    title: "Living Room",
    pieces: [
      { code: "LRSH01", name: "Living Room 1", note: "Bench seat, fold-out table, under-counter fridge" },
      { code: "LRSH02", name: "Living Room 2", note: "Bench seat, fold-out table, tall fridge" },
      { code: "LRNSH01", name: "Living Room 1", note: "Longer bench, fold-out table, under-counter fridge" },
      { code: "LRNSH02", name: "Living Room 2", note: "Longer bench, fold-out table, tall fridge" },
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
  { code: "OHS1", name: "Overhead Shelf", note: "A shelf over the driver and passenger seats" },
];

/** On every van, never a choice: the kitchenette (the full counter the
 * insert and uppers fit into) and the fold-out table. */
export const STANDARD_PIECES: Piece[] = [
  { code: "PK01", name: "Kitchenette Counter", note: "The full counter with the sink. The insert you pick fits under it" },
  { code: "FT01", name: "Fold-Out Table", note: "Hinged to the end of the counter" },
];
export const STANDARD = STANDARD_PIECES.map((p) => p.code);

/** Van id -> the lineup model. */
const LINEUPS: Record<string, string> = {
  "sprinter-170": "/models/sprinter-170-lineup-1.glb",
  /* Same pieces; the extended body only adds length behind the rear wheels. */
  "sprinter-170x": "/models/sprinter-170-lineup-1.glb",
};
export const lineupModelFor = (vanId: string | null) => (vanId ? LINEUPS[vanId] : undefined);
export const isModular = (vanId: string | null) => Boolean(lineupModelFor(vanId));

export interface Layout {
  /** slot id -> chosen code */
  picks: Partial<Record<Slot["id"], string>>;
  extras: string[];
}

/** "Y" or "N": the shower a piece goes with, read off its code (SHY, LRNSH02). */
const showerOf = (code = "") =>
  /^SH([YN])$/.exec(code)?.[1] ?? (code.startsWith("LRNSH") ? "N" : code.startsWith("LRSH") ? "Y" : undefined);

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
  if (layout.picks.LR && showerOf(layout.picks.LR) !== showerOf(layout.picks.SH)) delete layout.picks.LR;
  return layout;
}

export function layoutCode(layout: Layout): string {
  const main = SLOTS.map((s) => layout.picks[s.id]).filter(Boolean).join("-");
  return [main, ...layout.extras].join("+");
}

/** Changing the shower drops a living room that does not go with it. */
export function pick(layout: Layout, slot: Slot["id"], code: string): Layout {
  const picks = { ...layout.picks, [slot]: code };
  if (slot === "SH" && picks.LR && showerOf(picks.LR) !== showerOf(code)) delete picks.LR;
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
  const shower = showerOf(layout.picks.SH);
  return shower ? slot("LR").pieces.filter((p) => showerOf(p.code) === shower) : [];
};

export const slot = (id: Slot["id"]) => SLOTS.find((s) => s.id === id)!;

/** Every piece in a layout, labelled, for the summary and the Build Sheet. */
export function layoutLines(code: string | null) {
  const layout = parseLayout(code);
  return [
    ...SLOTS.filter((s) => layout.picks[s.id]).map((s) => ({ label: s.title, piece: getPiece(layout.picks[s.id]!)! })),
    ...STANDARD_PIECES.map((piece) => ({ label: "Standard", piece })),
    ...layout.extras.map((c) => ({ label: "Add-on", piece: getPiece(c)! })),
  ];
}

/** The full code as the team writes it, with the chassis in front. */
export const fullCode = (code: string | null) => (code ? `S170-${code}` : "");
