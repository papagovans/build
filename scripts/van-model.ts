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
shell();

const graded = process.env.GRADED_OUT ?? join(mkdtempSync(join(tmpdir(), "van-model-")), "graded.glb");
await io.write(graded, doc);

// instance, flatten and join stay off: together they wrecked the scale of the
// first export (a 7.6 m van came out 3 km long). simplify stays off so thin
// trim is never mangled; compression alone gets it under 3 MB.
execFileSync(
  "npx",
  /* palette stays off: it merges flat-colour materials into one palette
   * texture and the merge does not preserve doubleSided. The shell panels are
   * single sided on purpose, so merging them silently made the van a closed
   * box from the outside. It also renames every material, which makes the
   * output impossible to inspect. */
  ["-y", "@gltf-transform/cli", "optimize", graded, output,
   "--compress", "draco", "--texture-compress", "webp", "--texture-size", "1024",
   "--instance", "false", "--flatten", "false", "--join", "false", "--simplify", "false",
   "--palette", "false"],
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

/**
 * Closes the cutaway with a Sprinter interior: a ceiling, the sliding-door
 * side wall, and a rear bulkhead above the doors.
 *
 * The model was drawn to be seen from outside, so it has no roof and its
 * door side is cut away. That is right for the overview and wrong the moment
 * anyone walks inside, where those openings show page background.
 *
 * Every panel here is SINGLE SIDED with its normal pointing into the van, so
 * the two readings both work: from outside the camera meets the back face and
 * it is culled, leaving the cutaway exactly as drawn; from inside the camera
 * meets the front face and the van is enclosed.
 *
 * ponytail: measured to Build 1 (El Capitan) by raycasting the loaded model.
 * A different floor plan needs these re-measured, same as the component's
 * FEATURES and WALK numbers.
 */
function shell() {
  const B = {
    xRear: 0.06,   // inside face of the rear doors
    xCab: 4.36,    // where the cab begins; the side wall stops here
    xDrop: 4.42,   // the roof holds full height to here, then falls over the cab
    xFront: 5.02,  // the windscreen header; only the ceiling runs this far
    yHeader: 1.52, // underside of the header, 1.40m above the finished floor
    yFloor: 0.12,  // finished floor, same number the walk-through stands on
    yRoof: 2.02,   // underside of the high roof at the crown
    zDoor: -0.32,  // the cut-away sliding door side
    zFar: -2.28,   // the wall the cabinets are mounted on, already modelled
    arch: 0.12,    // how far the roof drops from crown to shoulder
  };
  const zc = (B.zDoor + B.zFar) / 2;
  const half = (B.zDoor - B.zFar) / 2;
  /* Shallow arc, flat through the middle and falling away at the shoulders,
   * which is the shape of the high roof. Squared rather than a true radius:
   * it keeps the crown flat where headroom is measured. */
  const roofY = (z: number) => B.yRoof - B.arch * ((z - zc) / half) ** 2;

  const panel = (mat: Material, quad: number[][]) => {
    const pos: number[] = [], nrm: number[] = [], tc: number[] = [];
    const [a, b, c] = quad;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const len = Math.hypot(...n) || 1;
    const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
    /* Wound so the front face points along n, which each quad below aims into
     * the cabin. That is what makes the panel solid from inside and culled
     * from outside, leaving the overview's cutaway exactly as drawn. */
    quad.forEach((p, i) => { pos.push(...p); nrm.push(n[0] / len, n[1] / len, n[2] / len); tc.push(...uvs[i]); });
    const acc = (type: "VEC3" | "VEC2" | "SCALAR", arr: Float32Array | Uint16Array) =>
      doc.createAccessor().setType(type).setArray(arr);
    return doc.createPrimitive().setMaterial(mat)
      .setAttribute("POSITION", acc("VEC3", new Float32Array(pos)))
      .setAttribute("NORMAL", acc("VEC3", new Float32Array(nrm)))
      .setAttribute("TEXCOORD_0", acc("VEC2", new Float32Array(tc)))
      .setIndices(acc("SCALAR", new Uint16Array([0, 1, 2, 0, 2, 3])));
  };

  /* Matte, because a van's headliner and wall panels are upholstered or
   * painted, and the studio light glares off anything glossier. */
  const matte = (name: string, rgb: number[], rough = 0.94) =>
    doc.createMaterial(name).setBaseColorFactor([...rgb, 1] as [number, number, number, number])
      .setRoughnessFactor(rough).setMetallicFactor(0).setDoubleSided(false);

  /* Authored straight in linear, not run through deepen(). deepen undoes the
   * exporter's sRGB-into-a-linear-field mistake, and these colours were never
   * exported, so passing them through it would darken them for no reason.
   *
   * A headliner and the wall above a window face down and inward, away from
   * the studio light, so lit on base colour alone they go muddy olive. A
   * little emissive holds them at the cream a van's panels actually read as. */
  const liner = matte("Shell headliner", [0.93, 0.92, 0.88]).setEmissiveFactor([0.16, 0.155, 0.145]);
  const wall = matte("Shell wall panel", [0.86, 0.84, 0.79]).setEmissiveFactor([0.12, 0.117, 0.108]);
  const glass = matte("Shell window", [0.06, 0.07, 0.08], 0.22);
  const trim = matte("Shell trim", [0.26, 0.27, 0.28]).setEmissiveFactor([0.03, 0.03, 0.032]);

  const node = doc.createNode("Van shell");
  const add = (mat: Material, quad: number[][]) => node.addChild(
    doc.createNode().setMesh(doc.createMesh().addPrimitive(panel(mat, quad))),
  );

  /* Ceiling, in strips across the van so the arc reads as a curve rather
   * than a fold. Wound so the normal points down into the cabin. */
  /* Height of the ceiling at a point. Behind xDrop it is the arch; forward of
   * it the roof falls away over the cab the way a high-roof Sprinter's does,
   * from the full box height down to the windscreen header.
   *
   * Smoothstep rather than a straight ramp: the real roof leaves the box
   * level, then curves down and meets the header almost flat again, and a
   * straight slope puts a visible crease at both ends instead.
   *
   * The model has no cab shell at all, no pillars, no windscreen frame, only
   * the seats, so there is nothing here to align to. The header height is the
   * Sprinter's, 1.40m above the finished floor. */
  const ceilY = (x: number, z: number) => {
    const top = roofY(z);
    if (x <= B.xDrop) return top;
    const t = Math.min(1, (x - B.xDrop) / (B.xFront - B.xDrop));
    return top - (top - B.yHeader) * (t * t * (3 - 2 * t));
  };

  /* Stations along the van. One span holds the whole flat run, then the cab
   * is cut finely enough that the curve reads as a curve. */
  const CAB_STEPS = 8;
  const stations = [B.xRear];
  for (let i = 0; i <= CAB_STEPS; i++) {
    stations.push(B.xDrop + (i / CAB_STEPS) * (B.xFront - B.xDrop));
  }

  const STRIPS = 14;
  for (let i = 0; i < STRIPS; i++) {
    const z0 = B.zFar + (i / STRIPS) * (B.zDoor - B.zFar);
    const z1 = B.zFar + ((i + 1) / STRIPS) * (B.zDoor - B.zFar);
    /* A recessed strip either side of the crown, where the model already
     * runs its LED coves, so the ceiling is not one flat sheet of cream. */
    const mid = Math.abs(i - (STRIPS - 1) / 2);
    const mat = mid > 2.2 && mid < 3.6 ? trim : liner;
    for (let j = 0; j < stations.length - 1; j++) {
      const xa = stations[j], xb = stations[j + 1];
      add(mat, [
        [xa, ceilY(xa, z0), z0], [xb, ceilY(xb, z0), z0],
        [xb, ceilY(xb, z1), z1], [xa, ceilY(xa, z1), z1],
      ]);
    }
  }

  /* The sliding-door side. Three bands: panel below the window line, the
   * glazing, and a return up to the roof shoulder. The glass is dark rather
   * than transparent on purpose, so a visitor who turns the camera around
   * inside sees a tinted window and not the page behind the model. */
  const zD = B.zDoor, yTop = roofY(zD);
  const sill = 1.08, head = 1.62;
  const vwall = (y0: number, y1: number, mat: Material, x0 = B.xRear, x1 = B.xCab) =>
    add(mat, [[x0, y0, zD], [x0, y1, zD], [x1, y1, zD], [x1, y0, zD]]);
  vwall(B.yFloor, sill, wall);
  vwall(sill, head, glass, 0.45, 3.95);
  vwall(sill, head, wall, B.xRear, 0.45);
  vwall(sill, head, wall, 3.95, B.xCab);
  vwall(head, yTop, wall);

  /* No rear bulkhead. The model already draws its own rear doors, and a panel
   * across the back both duplicated them and, being single sided, showed as a
   * pale slab standing past the roofline whenever the camera sat forward of
   * it in the overview.
   */

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
