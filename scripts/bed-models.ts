/**
 * Turns the SketchUp bed sheet into the web model for the Your Bed step.
 *
 *   npm run bed-models -- "<sprinter 170 beds>.glb" public/models/sprinter-170-beds.glb
 *
 * The SketchUp page holds one chassis and the beds side by side. Each is
 * named "Chassis - <van>" or "Bed - <name>", either on its group or on a
 * marker under it (the first export named the markers; both work: a named
 * marker is paired with the model it sits under).
 *
 * The beds are drawn at the right width and height already, so only their
 * position along the van changes: each moves until its back edge is flush
 * with the inside of the chassis rear.
 *
 * Then the motion is baked in, as glTF animations the web viewer plays:
 *   "<bed>-in"   the bed glides in through the rear doors and eases to a stop
 *   "<bed>-out"  it slides back out, for when the buyer picks another
 * Every bed starts hidden (scale 0), so the step opens on the empty chassis,
 * and each animation keeps the other beds hidden while it plays.
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
  console.error('usage: npm run bed-models -- "<export>.glb" <out>.glb');
  process.exit(1);
}

/* Metres in from the chassis's outer rear to where a bed's back edge sits:
 * the thickness of the rear doors. Build 1's bed frame sits 8 cm in. */
const REAR_INSET = 0.08;
/* How far behind the van a bed starts its slide, past its own length. */
const START_GAP = 0.6;
const IN_SECONDS = 1.6;
const OUT_SECONDS = 0.8;
const FRAMES = 30;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
await gradeMaterials(doc);

const meshCount = (n: Node) => {
  let m = 0;
  n.traverse((x) => { if (x.getMesh()) m++; });
  return m;
};
const NAMED = /^(Chassis|Bed) - (.+)$/;

// Everything that is one model on the sheet: the children of the first node
// that has more than one, below whatever single wrappers the exporter adds.
const scene = doc.getRoot().listScenes()[0];
let assembly = scene.listChildren()[0];
while (assembly.listChildren().length === 1) assembly = assembly.listChildren()[0];
const parts = assembly.listChildren();

const models = new Map<string, Node>(); // name -> model node
const markers: Node[] = [];
for (const n of parts.filter((p) => NAMED.test(p.getName()))) {
  if (meshCount(n) >= 5) {
    models.set(n.getName(), n);
    continue;
  }
  // A named marker: pair it with the unnamed model it sits under.
  markers.push(n);
  const mb = getBounds(n);
  const overlap = (p: Node) => {
    const b = getBounds(p);
    return Math.min(b.max[0], mb.max[0]) - Math.max(b.min[0], mb.min[0]);
  };
  const under = parts
    .filter((p) => !NAMED.test(p.getName()) && meshCount(p) >= 5)
    .sort((a, b) => overlap(b) - overlap(a))[0];
  if (under && overlap(under) > 0) models.set(n.getName(), under);
}
for (const m of markers) m.dispose();
for (const p of parts) if (p.getName() === "Active View") p.dispose();

const chassisEntry = [...models].find(([name]) => name.startsWith("Chassis"));
if (!chassisEntry) throw new Error("no chassis found: name its group or marker \"Chassis - <van>\"");
const chassis = chassisEntry[1];
chassis.setName(chassisEntry[0]);
const rear = getBounds(chassis).min[0] + REAR_INSET;
console.log(`${chassisEntry[0]}: rear inside face at x ${rear.toFixed(3)}`);

/* A world-space shift turned into the parent's local space, so a bed can sit
 * wherever SketchUp nested it. Only the parent's 3x3 matters for a shift. */
function toLocal(parent: Node, world: number[]): [number, number, number] {
  const m = parent.getWorldMatrix();
  const a = [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]];
  const det =
    a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) -
    a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) +
    a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const inv = [
    [(a[1][1] * a[2][2] - a[1][2] * a[2][1]) / det, (a[0][2] * a[2][1] - a[0][1] * a[2][2]) / det, (a[0][1] * a[1][2] - a[0][2] * a[1][1]) / det],
    [(a[1][2] * a[2][0] - a[1][0] * a[2][2]) / det, (a[0][0] * a[2][2] - a[0][2] * a[2][0]) / det, (a[0][2] * a[1][0] - a[0][0] * a[1][2]) / det],
    [(a[1][0] * a[2][1] - a[1][1] * a[2][0]) / det, (a[0][1] * a[2][0] - a[0][0] * a[2][1]) / det, (a[0][0] * a[1][1] - a[0][1] * a[1][0]) / det],
  ];
  return inv.map((row) => row[0] * world[0] + row[1] * world[1] + row[2] * world[2]) as [number, number, number];
}

// Each bed goes inside two new nodes, so its own transform from SketchUp is
// never touched. The outer one ("wrapper") sits at the bed's centre and is
// what the animations move and scale; the inner one carries the rest of the
// shift. Anchoring at the centre matters: a bed hidden at scale 0 collapses
// to its wrapper's origin, and SketchUp's origins sit up to 33 m away on the
// sheet, which made the viewer frame 38 m of nothing around a tiny van.
const beds: { slug: string; wrapper: Node; rest: number[]; start: number[] }[] = [];
for (const [name, model] of models) {
  if (!name.startsWith("Bed")) continue;
  const parent = model.getParentNode() ?? assembly;
  const b = getBounds(model);
  const shift = toLocal(parent, [rear - b.min[0], 0, 0]);
  const slide = toLocal(parent, [-(b.max[0] - b.min[0]) - START_GAP, 0, 0]);
  // The bed's installed centre, as a point in the parent's space.
  const pw = parent.getWorldMatrix();
  const centre = [rear + (b.max[0] - b.min[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
  const at = toLocal(parent, [centre[0] - pw[12], centre[1] - pw[13], centre[2] - pw[14]]);
  const wrapper = doc.createNode(name).setTranslation(at).setScale([0, 0, 0]);
  const inner = doc.createNode(`${name} offset`).setTranslation([shift[0] - at[0], shift[1] - at[1], shift[2] - at[2]]);
  parent.removeChild(model);
  inner.addChild(model);
  wrapper.addChild(inner);
  parent.addChild(wrapper);
  model.setName(`${name} model`);
  const slug = name.replace(/^Bed - /, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  beds.push({ slug, wrapper, rest: at, start: at.map((v, i) => v + slide[i]) });
  console.log(`${name}: ${(b.max[0] - b.min[0]).toFixed(2)} m long, moved ${(rear - b.min[0]).toFixed(2)} m to the rear`);
}
if (!beds.length) throw new Error("no beds found: name each group or marker \"Bed - <name>\"");

const buffer = doc.getRoot().listBuffers()[0];
const acc = (type: "SCALAR" | "VEC3", arr: Float32Array) =>
  doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer);
const easeOut = (t: number) => 1 - (1 - t) ** 3; // fast in, settles gently
const easeIn = (t: number) => t ** 3;

/* One clip: this bed moves from a to b; every other bed stays hidden. */
function clip(name: string, bed: (typeof beds)[number], a: number[], b: number[], seconds: number, ease: (t: number) => number) {
  const anim = doc.createAnimation(name);
  const times = Float32Array.from({ length: FRAMES + 1 }, (_, i) => (i / FRAMES) * seconds);
  const path = new Float32Array((FRAMES + 1) * 3);
  for (let i = 0; i <= FRAMES; i++) {
    const k = ease(i / FRAMES);
    for (let c = 0; c < 3; c++) path[i * 3 + c] = a[c] + (b[c] - a[c]) * k;
  }
  const move = doc.createAnimationSampler().setInput(acc("SCALAR", times)).setOutput(acc("VEC3", path)).setInterpolation("LINEAR");
  anim.addSampler(move).addChannel(doc.createAnimationChannel().setTargetNode(bed.wrapper).setTargetPath("translation").setSampler(move));
  const ends = Float32Array.from([0, seconds]);
  for (const other of beds) {
    const s = other === bed ? 1 : 0;
    const scale = doc.createAnimationSampler().setInput(acc("SCALAR", ends)).setOutput(acc("VEC3", Float32Array.from([s, s, s, s, s, s]))).setInterpolation("STEP");
    anim.addSampler(scale).addChannel(doc.createAnimationChannel().setTargetNode(other.wrapper).setTargetPath("scale").setSampler(scale));
  }
}
for (const bed of beds) {
  clip(`${bed.slug}-in`, bed, bed.start, bed.rest, IN_SECONDS, easeOut);
  clip(`${bed.slug}-out`, bed, bed.rest, bed.start, OUT_SECONDS, easeIn);
}

const graded = process.env.GRADED_OUT ?? join(mkdtempSync(join(tmpdir(), "bed-models-")), "graded.glb");
await io.write(graded, doc);
compressForWeb(graded, output);
console.log(`${output} written: ${beds.map((b) => b.slug).join(", ")}`);
