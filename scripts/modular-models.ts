/**
 * Turns a SketchUp lineup sheet into the web model for the modular steps.
 *
 *   npm run modular-models -- "<Papago Builder - 1st bed option>.glb" public/models/sprinter-170-lineup-1.glb
 *
 * The sheet (owner, 2026-10-26) lays every piece out in a row beside the
 * chassis: the driver-side line at its installed depth, the passenger-side
 * line further along z, a coloured dot under each choice. The export carries
 * no names (3,386 nodes called "empty_N"), so pieces are found by geometry:
 * parts whose boxes touch are one piece, and each piece is matched to its
 * code by where its left edge sits on the sheet. Codes are the team's
 * (claude.ai/artifact/YX4sDowV5Siyscyhn7sTSS), without the "S170-" prefix.
 *
 * Every piece moves to where it is installed and is baked two animations:
 * "<code>-in" drops it into the van from above and settles it, and
 * "<code>-out" lifts it out and away. The van has no roof in the cutaway,
 * so nothing passes through anything. Every piece starts hidden.
 *
 * ponytail: the sheet positions and installed positions below are measured
 * from lineup 1. A new lineup with a different sheet layout needs this table
 * re-measured (run with DEBUG=1 to print every piece's box). Upgrade path:
 * name each group in SketchUp and match on names, as bed-models.ts does.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Node, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { getBounds } from "@gltf-transform/functions";
import { compressForWeb, gradeMaterials } from "./lib/van-look.ts";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: npm run modular-models -- "<export>.glb" <out>.glb');
  process.exit(1);
}

/* The chassis, measured on lineup 1. The bed is part of it (one bed so far):
 * its front face is at x 1.64. A bed cap is 13 mm thick and sits on that
 * face, so every cabinet line starts at 1.653. The passenger wall is z -0.46;
 * passenger pieces are drawn with their backs at z 4.62 on the sheet. */
const BED_FRONT = 1.64;
const LINE_START = 1.653;
const BED_MID = 0.875;
const PS_SHIFT = -0.46 - 4.62;
const SHOWER = 1.155; // SHY's width; the LRSH living rooms start after it
const TALL = 0.609; // SHN's width; the LRNSH ones after it
/* Middle of the kitchenette's insert bay, and of its sink, in the van. */
const BAY_MID = LINE_START + (13.885 - 13.238);
const SINK_MID = LINE_START + (14.8085 - 13.238);

type Side = "DS" | "PS";
/* code: [side, sheet x of its left edge(s), where its left edge goes in the
 * van]. Or `mid` to centre the piece on a point instead. */
const PIECES: Record<string, { side: Side; sheet: number[]; at?: number; mid?: number }> = {
  BC01: { side: "DS", sheet: [8.145], at: BED_FRONT },
  BC02: { side: "DS", sheet: [9.796], at: BED_FRONT },
  SHY: { side: "DS", sheet: [13.238], at: LINE_START },
  SHN: { side: "DS", sheet: [14.889], at: LINE_START },
  LRSH01: { side: "DS", sheet: [20.743], at: LINE_START + SHOWER }, // lower and upper are two pieces
  LRSH02: { side: "DS", sheet: [22.521], at: LINE_START + SHOWER },
  LRNSH01: { side: "DS", sheet: [26.547], at: LINE_START + TALL },
  LRNSH02: { side: "DS", sheet: [28.833], at: LINE_START + TALL },
  SS01: { side: "DS", sheet: [33.252], at: BED_FRONT - 0.02 - 1.549 }, // under the bed, front edge just inside it
  SC01: { side: "DS", sheet: [35.856, 37.272], mid: BED_MID }, // the pair
  OC01: { side: "DS", sheet: [38.371], mid: BED_MID },
  PK01: { side: "PS", sheet: [13.238], at: LINE_START },
  PI01: { side: "PS", sheet: [19.969], mid: BAY_MID },
  PI02: { side: "PS", sheet: [21.239], mid: BAY_MID },
  ST01: { side: "PS", sheet: [26.71], mid: BAY_MID }, // drops into the counter over the insert
  CB01: { side: "PS", sheet: [28.607], mid: SINK_MID },
  FT01: { side: "PS", sheet: [30.306], at: LINE_START + 1.828 }, // hinged to the galley's door end
  PU02: { side: "PS", sheet: [33.232], at: LINE_START },
  PU01: { side: "PS", sheet: [36.407], at: LINE_START }, // the set with the microwave
};
/* How high above its place a piece appears, and how long the moves take. */
const DROP = 1.4;
const IN_SECONDS = 1.3;
const OUT_SECONDS = 0.7;
const FPS = 30;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
await gradeMaterials(doc);

const scene = doc.getRoot().listScenes()[0];
const leaves: { n: Node; min: number[]; max: number[] }[] = [];
scene.traverse((n) => {
  if (n.getMesh()) leaves.push({ n, ...getBounds(n) });
});

// Parts whose boxes touch (within 3 cm) are one piece.
const TOUCH = 0.03;
const root = leaves.map((_, i) => i);
const find = (i: number): number => (root[i] === i ? i : (root[i] = find(root[i])));
for (let i = 0; i < leaves.length; i++)
  for (let j = i + 1; j < leaves.length; j++) {
    const [a, b] = [leaves[i], leaves[j]];
    if ([0, 1, 2].every((k) => a.min[k] <= b.max[k] + TOUCH && b.min[k] <= a.max[k] + TOUCH)) root[find(i)] = find(j);
  }
const groups = new Map<number, typeof leaves>();
leaves.forEach((l, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), l]));
const box = (ls: typeof leaves) => ({
  min: [0, 1, 2].map((k) => Math.min(...ls.map((l) => l.min[k]))),
  max: [0, 1, 2].map((k) => Math.max(...ls.map((l) => l.max[k]))),
});

const byCode = new Map<string, typeof leaves>();
let chassis: typeof leaves | undefined;
for (const g of groups.values()) {
  const b = box(g);
  if (process.env.DEBUG) console.log(g.length, b.min.map((v) => v.toFixed(3)), b.max.map((v) => v.toFixed(3)));
  if (b.max[1] < 0.08) {
    g.forEach((l) => l.n.dispose()); // the coloured dots under each choice
    continue;
  }
  if (b.min[0] < 1) {
    chassis = g;
    continue;
  }
  const side: Side = (b.min[2] + b.max[2]) / 2 > 3 ? "PS" : "DS";
  const code = Object.keys(PIECES).find(
    (c) => PIECES[c].side === side && PIECES[c].sheet.some((x) => Math.abs(x - b.min[0]) < 0.01),
  );
  if (!code) {
    console.warn(`unmatched piece at x ${b.min[0].toFixed(3)} (${side}), left out`);
    g.forEach((l) => l.n.dispose());
    continue;
  }
  byCode.set(code, [...(byCode.get(code) ?? []), ...g]);
}
if (!chassis) throw new Error("no chassis found at the start of the sheet");
const missing = Object.keys(PIECES).filter((c) => !byCode.has(c));
if (missing.length) throw new Error(`pieces not found on the sheet: ${missing.join(", ")}`);

/* Each piece goes inside two new nodes. The outer one sits at the piece's
 * installed centre, so a hidden piece (scale 0) collapses onto its own spot
 * rather than somewhere down the sheet; the inner one carries the move. The
 * export is flat (every part a child of the scene, no rotation), so a move is
 * a plain translation. */
const pieces: { code: string; wrapper: Node; rest: number[] }[] = [];
for (const [code, ls] of byCode) {
  const p = PIECES[code];
  const b = box(ls);
  const width = b.max[0] - b.min[0];
  const dx = (p.at ?? p.mid! - width / 2) - b.min[0];
  const dz = p.side === "PS" ? PS_SHIFT : 0;
  const rest = [b.min[0] + dx + width / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2 + dz];
  const wrapper = doc.createNode(code).setTranslation(rest as [number, number, number]).setScale([0, 0, 0]);
  const inner = doc.createNode(`${code} offset`).setTranslation([dx - rest[0], -rest[1], dz - rest[2]]);
  for (const l of ls) {
    scene.removeChild(l.n);
    inner.addChild(l.n);
  }
  scene.addChild(wrapper.addChild(inner));
  pieces.push({ code, wrapper, rest });
  console.log(`${code}: ${ls.length} parts, ${width.toFixed(2)} m, x ${(b.min[0] + dx).toFixed(3)}`);
}
const ch = doc.createNode("Chassis - Sprinter 170");
for (const l of chassis) {
  scene.removeChild(l.n);
  ch.addChild(l.n);
}
scene.addChild(ch);

const buffer = doc.getRoot().listBuffers()[0];
const acc = (type: "SCALAR" | "VEC3", arr: number[]) =>
  doc.createAccessor().setType(type).setArray(new Float32Array(arr)).setBuffer(buffer);
/* Start and end at rest speed, no overshoot: same curves as the bed swaps. */
const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const settle = (t: number) => 1 - (1 - t) ** 4;
const arrive = (t: number) => easeInOut(t) * 0.35 + settle(t) * 0.65;

/** height(t) is the lift above the installed spot, 0..1 of DROP. */
function clip(name: string, wrapper: Node, rest: number[], seconds: number, lift: (t: number) => number, shown: number[]) {
  const n = Math.round(seconds * FPS);
  const times = Array.from({ length: n + 1 }, (_, i) => (i / n) * seconds);
  const path = times.flatMap((t) => [rest[0], rest[1] + DROP * lift(t / seconds), rest[2]]);
  const anim = doc.createAnimation(name);
  const move = doc.createAnimationSampler().setInput(acc("SCALAR", times)).setOutput(acc("VEC3", path)).setInterpolation("LINEAR");
  // Switched with STEP, so a piece never grows or shrinks on screen.
  const vis = doc
    .createAnimationSampler()
    .setInput(acc("SCALAR", [0, seconds]))
    .setOutput(acc("VEC3", shown.flatMap((s) => [s, s, s])))
    .setInterpolation("STEP");
  anim.addSampler(move).addChannel(doc.createAnimationChannel().setTargetNode(wrapper).setTargetPath("translation").setSampler(move));
  anim.addSampler(vis).addChannel(doc.createAnimationChannel().setTargetNode(wrapper).setTargetPath("scale").setSampler(vis));
}
for (const { code, wrapper, rest } of pieces) {
  clip(`${code}-in`, wrapper, rest, IN_SECONDS, (k) => 1 - arrive(k), [1, 1]);
  clip(`${code}-out`, wrapper, rest, OUT_SECONDS, easeInOut, [1, 0]);
}

const graded = process.env.GRADED_OUT ?? join(mkdtempSync(join(tmpdir(), "modular-models-")), "graded.glb");
await io.write(graded, doc);
compressForWeb(graded, output);
console.log(`${output} written: ${pieces.length} pieces`);
