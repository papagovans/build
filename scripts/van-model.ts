/**
 * Turns a SketchUp .glb export into the web model the configurator shows.
 *
 *   npm run van-model -- "<export>.glb" public/models/floor-plan.glb
 *
 * The SketchUp exporter (SimLab) gets three things wrong, and all three are
 * why the raw export looks flat and washed out:
 *
 *   1. Colours are written as sRGB into a field glTF defines as linear, so
 *      every flat colour renders far lighter than drawn: a 21% charcoal shows
 *      as 50% grey.
 *   2. Every surface gets the same half-gloss, non-metal finish, so wood
 *      glares like plastic and steel looks like paint.
 *   3. Materials use the old specular-glossiness format, which current
 *      browsers no longer draw correctly.
 *
 * Finishes are chosen from material names, so a material named "Oak" or
 * "Brushed Steel" in SketchUp comes out right with no change here.
 *
 * Then it compresses: roughly 50 MB in, under 3 MB out.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeIO, type Material } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { getBounds, metalRough } from "@gltf-transform/functions";
import sharp from "sharp";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: npm run van-model -- "<export>.glb" <out>.glb');
  process.exit(1);
}

/* Wood carries the warmth in these interiors, so it is pushed hardest. */
const WOOD = /wood|bamboo|cherry|oak|walnut|egger|flexx|floor/i;
const FOLIAGE = /folha|leaf|vegetation|grass/i;
const FLAT_SAT = 1.2;
const TEX = { sat: 1.3, dark: 0.88 };
const WOOD_TEX = { sat: 1.6, dark: 0.72 };

/* metal = metallic, rough = roughness. Order matters: first match wins. */
function finish(name: string): { metal: number; rough: number } {
  const n = name.toLowerCase();
  if (/mirror/.test(n)) return { metal: 1, rough: 0.05 };
  if (/chrome|хром|silver|alumin|metal|steel|철재|pewter|gleam|shine/.test(n))
    return { metal: 1, rough: 0.38 };
  if (/glass/.test(n)) return { metal: 0, rough: 0.05 };
  if (/enamel|glossy|polished/.test(n)) return { metal: 0, rough: 0.3 };
  if (/cuir|leather/.test(n)) return { metal: 0, rough: 0.55 };
  if (/denim|carpet|fabric|bedding|pebble|sand/.test(n) || FOLIAGE.test(n))
    return { metal: 0, rough: 0.97 };
  // Oiled wood and painted panels are close to matte. At half-gloss the
  // studio light glares off every counter and floor and bleaches them.
  if (WOOD.test(n)) return { metal: 0, rough: 0.88 };
  if (/пластик|plastic/.test(n)) return { metal: 0, rough: 0.45 };
  return { metal: 0, rough: 0.85 };
}

const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

/* Undo the exporter's colour-space mistake, then saturate around luminance. */
function deepen([r, g, b, a]: number[]): [number, number, number, number] {
  const [lr, lg, lb] = [r, g, b].map(toLinear);
  const l = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  const s = (c: number) => Math.min(1, Math.max(0, l + (c - l) * FLAT_SAT));
  return [s(lr), s(lg), s(lb), a];
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
await doc.transform(metalRough());

const textures = new Map<NonNullable<ReturnType<Material["getBaseColorTexture"]>>, number>();
for (const mat of doc.getRoot().listMaterials()) {
  const name = mat.getName();
  const { metal, rough } = finish(name);
  mat.setMetallicFactor(metal).setRoughnessFactor(rough);

  const tex = mat.getBaseColorTexture();
  const t = WOOD.test(name) ? WOOD_TEX : TEX;
  // A texture carries its own colour; the factor is only a multiplier on it.
  mat.setBaseColorFactor(tex ? [t.dark, t.dark, t.dark, 1] : deepen(mat.getBaseColorFactor()));
  if (tex) textures.set(tex, t.sat);

  // The exporter marks everything as cut-out. Only foliage actually is.
  if (mat.getAlphaMode() === "MASK" && !FOLIAGE.test(name)) mat.setAlphaMode("OPAQUE");
}
for (const [tex, sat] of textures) {
  const png = await sharp(Buffer.from(tex.getImage()!)).modulate({ saturation: sat }).png().toBuffer();
  tex.setImage(new Uint8Array(png)).setMimeType("image/png");
}

await dressBed();

const graded = join(mkdtempSync(join(tmpdir(), "van-model-")), "graded.glb");
await io.write(graded, doc);

// instance, flatten and join stay off: together they wrecked the scale of the
// first export (a 7.6 m van came out 3 km long). simplify stays off so thin
// trim is never mangled; compression alone gets it under 3 MB.
execFileSync(
  "npx",
  ["-y", "@gltf-transform/cli", "optimize", graded, output,
   "--compress", "draco", "--texture-compress", "webp", "--texture-size", "1024",
   "--instance", "false", "--flatten", "false", "--join", "false", "--simplify", "false"],
  { stdio: ["ignore", "ignore", "inherit"] },
);
console.log(`${output} written`);

/**
 * Lays a bedspread over the mattress: deep teal, the complement of the
 * walnut, with an ochre runner across the foot and a cream cuff folded back
 * at the head. It drapes over the aisle edge, the side a buyer looks at.
 *
 * ponytail: finds the mattress by its SketchUp material name ("Bedding") and
 * assumes a transverse bed, head toward -Z. A plan with a lengthwise bed or a
 * renamed mattress needs this adjusted, or the spread drawn in SketchUp.
 */
async function dressBed() {
  const mattress = doc.getRoot().listNodes().find((n) =>
    n.getMesh()?.listPrimitives().some((p) => /bedding/i.test(p.getMaterial()?.getName() ?? "")),
  );
  if (!mattress) return console.log("no mattress found, bed left bare");
  const { min, max } = getBounds(mattress);
  const top = max[1];
  const [x0, x1, z0, z1] = [min[0], max[0], min[2], max[2]];
  const aisle = x1; // the edge facing the living space
  const headZ = z0 + 0.42; // bare strip left at the head for pillows

  // 2:1 because the spread is about twice as long (across the van) as deep.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="512">
    <filter id="weave"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2"/>
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.10 0"/></filter>
    <rect width="1024" height="512" fill="#2E6878"/>
    <rect x="740" width="200" height="512" fill="#C8923F"/>
    <rect x="762" width="5" height="512" fill="#EDE4D2"/>
    <rect x="913" width="5" height="512" fill="#EDE4D2"/>
    <rect x="839" width="3" height="512" fill="#EDE4D2"/>
    <rect width="1024" height="512" filter="url(#weave)"/>
  </svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const tex = doc.createTexture("bedspread").setImage(new Uint8Array(png)).setMimeType("image/png");
  const cloth = doc.createMaterial("Bedspread").setBaseColorTexture(tex).setRoughnessFactor(0.97).setMetallicFactor(0).setDoubleSided(true);
  const cuff = doc.createMaterial("Bedspread cuff").setBaseColorFactor([0.78, 0.72, 0.6, 1]).setRoughnessFactor(0.95).setMetallicFactor(0).setDoubleSided(true);

  // Texture u runs from the head to the foot of the spread, so the runner
  // always lands near the foot however long the bed is.
  const uv = (x: number, z: number) => [(z - headZ) / (z1 - headZ), (x - x0) / (aisle - x0)];
  const node = doc.createNode("Bedspread");
  const add = (mat: Material, lo: number[], hi: number[]) => node.addChild(
    doc.createNode().setMesh(doc.createMesh().addPrimitive(box(mat, lo, hi, uv))),
  );
  add(cloth, [x0 - 0.01, top, headZ], [aisle + 0.02, top + 0.02, z1 - 0.01]);         // the spread
  add(cloth, [aisle + 0.02, top - 0.13, headZ], [aisle + 0.035, top + 0.02, z1 - 0.01]); // drape
  add(cuff, [x0 - 0.005, top + 0.02, headZ], [aisle + 0.025, top + 0.035, headZ + 0.2]); // fold-back
  doc.getRoot().listScenes()[0].addChild(node);
}

/* An axis-aligned box as one primitive, 24 vertices so each face has its own
 * normal. uv(x, z) maps every face, which is enough for a slab of cloth. */
function box(mat: Material, lo: number[], hi: number[], uv: (x: number, z: number) => number[]) {
  const pos: number[] = [], nrm: number[] = [], tc: number[] = [], idx: number[] = [];
  const faces: [number, number[][]][] = [
    [1, [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]]], // +y top
    [-1, [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]]], // -y
    [0, [[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]]], // +x
    [0, [[0, 0, 1], [0, 0, 0], [0, 1, 0], [0, 1, 1]]], // -x
    [0, [[0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1]]], // +z
    [0, [[1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 0]]], // -z
  ];
  const normals = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
  faces.forEach(([, corners], f) => {
    const base = pos.length / 3;
    for (const [cx, cy, cz] of corners) {
      const p = [cx ? hi[0] : lo[0], cy ? hi[1] : lo[1], cz ? hi[2] : lo[2]];
      pos.push(...p); nrm.push(...normals[f]); tc.push(...uv(p[0], p[2]));
    }
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  });
  const acc = (type: "VEC3" | "VEC2" | "SCALAR", a: Float32Array | Uint16Array) =>
    doc.createAccessor().setType(type).setArray(a);
  return doc.createPrimitive().setMaterial(mat)
    .setAttribute("POSITION", acc("VEC3", new Float32Array(pos)))
    .setAttribute("NORMAL", acc("VEC3", new Float32Array(nrm)))
    .setAttribute("TEXCOORD_0", acc("VEC2", new Float32Array(tc)))
    .setIndices(acc("SCALAR", new Uint16Array(idx)));
}
