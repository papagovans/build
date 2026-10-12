/**
 * The bed choices, and which van has a 3D model to show them in.
 *
 * Names and copy are the owner's, 2026-10-12. The model is one .glb per
 * chassis made by `npm run bed-models` from the SketchUp sheet: the chassis
 * plus every bed, each with a "<id>-in" and "<id>-out" animation baked in.
 *
 * ponytail: hard-coded here rather than in the admin while only the Sprinter
 * 170 has beds. Move to a Beds collection in Payload when a second chassis
 * gets them or the shop wants to edit the copy.
 */
export interface Bed {
  /** Matches the animation names in the model: "<id>-in", "<id>-out". */
  id: string;
  name: string;
  /** What it physically is, in plain words. */
  kind: string;
  description: string;
}

export const BEDS: Bed[] = [
  {
    id: "trailhead",
    name: "The Trailhead",
    kind: "A fixed platform bed, the more compact of the two",
    description:
      "A fixed bed that’s always made, with room under it for the gear you start every day with.",
  },
  {
    id: "ridgeline",
    name: "The Ridgeline",
    kind: "A fixed platform bed, the larger one",
    description: "The full-size fixed bed. Stretch out, and keep the big gear stowed below.",
  },
  {
    id: "lookout",
    name: "The Lookout",
    kind: "A fixed bed with a seat and table tucked beside it",
    description:
      "A fixed bed plus a two-seat nook by the window for coffee, maps and the view.",
  },
  {
    id: "campfire",
    name: "The Campfire",
    kind: "A dinette with facing benches and a table",
    description:
      "Eat around the table at night, drop it and it’s a bed. The whole van works as one room.",
  },
  {
    id: "high-camp",
    name: "The High Camp",
    kind: "A dinette below, with a bed that lifts up overhead",
    description:
      "Dinner at the table, then bring the bed down from the ceiling. Sleep upstairs and keep the living room set up.",
  },
];

/** Van id -> the chassis model carrying its beds. */
const BED_MODELS: Record<string, string> = {
  "sprinter-170": "/models/sprinter-170-beds.glb",
};

export const bedModelFor = (vanId: string | null) => (vanId ? BED_MODELS[vanId] : undefined);
export const hasBeds = (vanId: string | null) => Boolean(bedModelFor(vanId));
export const getBed = (id: string | null) => BEDS.find((b) => b.id === id);
