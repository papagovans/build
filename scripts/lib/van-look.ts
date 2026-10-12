/**
 * The look every SketchUp export gets on its way to the web: shared by
 * van-model.ts (the floor plans) and bed-models.ts (the bed step).
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
 */
import { execFileSync } from "node:child_process";
import type { Document, Material } from "@gltf-transform/core";
import { metalRough } from "@gltf-transform/functions";
import sharp from "sharp";

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

/** Fixes the exporter's colours and finishes, in place. */
export async function gradeMaterials(doc: Document) {
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
}

/** Compresses a graded .glb for the web: roughly 50 MB in, under 3 MB out. */
export function compressForWeb(graded: string, output: string) {
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
}
