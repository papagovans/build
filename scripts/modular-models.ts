/**
 * Turns a SketchUp lineup sheet into the web model for the modular steps.
 *
 *   npm run modular-models -- "<Papago Builder - 1st bed option>.glb" public/models/sprinter-170-lineup-1.glb
 *
 * The sheet (owner, 2026-10-26) lays every piece out in a row beside the
 * chassis, each piece a SketchUp component named with its code
 * ("PK01-KITCHENETTE"; owner, 2026-10-27). The code is the part of the name
 * before the first dash or space. Codes are the team's
 * (claude.ai/artifact/YX4sDowV5Siyscyhn7sTSS), without the "S170-" prefix.
 *
 * Every piece moves to where it is installed and is baked two animations:
 * "<code>-in" drops it into the van from above and settles it, and
 * "<code>-out" lifts it out and away. The van has no roof in the cutaway,
 * so nothing passes through anything. Every piece starts hidden.
 *
 * ponytail: where each piece is installed is measured from lineup 1's
 * chassis (the table below). A different chassis needs it re-measured; a new
 * piece needs one line in it, or it is left out with a warning. DEBUG=1
 * prints every piece's box.
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
/* Middle of the two cab seats, front to back (the chassis draws them at x
 * 4.42 to 5.09). */
const SEATS_MID = 4.755;
/* Middle of the kitchenette's insert bay, and of its sink, in the van. */
const BAY_MID = LINE_START + (13.885 - 13.238);
const SINK_MID = LINE_START + (14.8085 - 13.238);

type Side = "DS" | "PS";
/* code: [side, where its left edge goes in the van]. Or `mid` to centre the
 * piece on a point instead. */
const PIECES: Record<string, { side: Side; at?: number; mid?: number }> = {
  BC01: { side: "DS", at: BED_FRONT },
  BC02: { side: "DS", at: BED_FRONT },
  SHY: { side: "DS", at: LINE_START },
  SHN: { side: "DS", at: LINE_START },
  LRSH01: { side: "DS", at: LINE_START + SHOWER },
  LRSH02: { side: "DS", at: LINE_START + SHOWER },
  LRNSH01: { side: "DS", at: LINE_START + TALL },
  LRNSH02: { side: "DS", at: LINE_START + TALL },
  SS01: { side: "DS", at: BED_FRONT - 0.02 - 1.549 }, // under the bed, front edge just inside it
  SC01: { side: "DS", mid: BED_MID }, // the pair
  OC01: { side: "DS", mid: BED_MID },
  OHS1: { side: "DS", mid: SEATS_MID }, // over the cab seats; drawn centred across the van already
  PK01: { side: "PS", at: LINE_START },
  PI01: { side: "PS", mid: BAY_MID },
  PI02: { side: "PS", mid: BAY_MID },
  ST01: { side: "PS", mid: BAY_MID }, // drops into the counter over the insert
  CB01: { side: "PS", mid: SINK_MID },
  FT01: { side: "PS", at: LINE_START + 1.828 }, // hinged to the galley's door end
  PU02: { side: "PS", at: LINE_START },
  PU01: { side: "PS", at: LINE_START }, // the set with the microwave
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
type Part = { n: Node; min: number[]; max: number[] };
const box = (ls: Part[]) => ({
  min: [0, 1, 2].map((k) => Math.min(...ls.map((l) => l.min[k]))),
  max: [0, 1, 2].map((k) => Math.max(...ls.map((l) => l.max[k]))),
});

/* Every piece is a SketchUp component whose name starts with its code
 * ("PK01-KITCHENETTE", "S170-MERCEDES SPRINTER 170"); the exporter appends
 * "_<instance>". Each is lifted out of the export's nesting with its world
 * transform baked in, so the rest of this script works in sheet space. */
const codeOf = (name: string) => /^([A-Z]+\d+|SH[YN])(?=[-_ ]|$)/.exec(name)?.[1];
const named: { code: string; n: Node }[] = [];
scene.traverse((n) => {
  const code = codeOf(n.getName());
  if (!code || named.some((p) => p.n !== n && isAncestor(p.n, n))) return;
  named.push({ code, n });
});
function isAncestor(a: Node, n: Node): boolean {
  for (let p = n.getParentNode(); p; p = p.getParentNode()) if (p === a) return true;
  return false;
}
const byCode = new Map<string, Part[]>();
const chassis: Part[] = [];
for (const { code, n } of named) {
  const part = { n, ...getBounds(n) };
  const m = n.getWorldMatrix();
  n.getParentNode()?.removeChild(n);
  n.setMatrix(m);
  scene.addChild(n);
  if (process.env.DEBUG) console.log(code, part.min.map((v) => v.toFixed(3)), part.max.map((v) => v.toFixed(3)));
  // The chassis and its one bed travel together until there is a second bed.
  if (code === "S170" || code === "BD01") chassis.push(part);
  else if (PIECES[code]) byCode.set(code, [part]);
  else {
    console.warn(`${code}: no install position in PIECES yet, left out`);
    n.dispose();
  }
}
// Whatever is left (the coloured dots, the OR labels) is sheet furniture.
for (const n of scene.listChildren()) if (!named.some((p) => p.n === n)) n.dispose();
if (!chassis.length) throw new Error("no chassis (a component named S170-...) found");
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
