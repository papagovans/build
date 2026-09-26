import path from "path";
import { fileURLToPath } from "url";

import { postgresAdapter } from "@payloadcms/db-postgres";
import { vercelBlobStorage } from "@payloadcms/storage-vercel-blob";
import sharp from "sharp";
import {
  buildConfig,
  type Access,
  type CollectionConfig,
  type Field,
  type FieldAccess,
  type FieldHook,
  type Payload,
} from "payload";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Neon hands over a pooled and an unpooled connection string. Schema changes
 * have to run over the direct one, so prefer it and fall back in the order
 * Vercel's integration happens to name them.
 */
const connectionString =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL;

/**
 * Every catalog collection carries a `slug` holding the id the hardcoded
 * catalog already used ("elec-solar-600", "el-capitan"). Two reasons it is not
 * optional:
 *
 *   1. Shared `?b=` build links encode those ids. Switching to Payload's
 *      numeric primary keys would break every link already in the wild.
 *   2. It makes the seed idempotent. Re-running it updates rows in place
 *      instead of duplicating the catalog.
 */
/** "All-Terrain Wheels & Tires Package" -> "all-terrain-wheels-tires-package" */
export function slugify(input: string) {
  return input
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * The slug is generated from the name on first save and then frozen.
 *
 * Frozen rather than merely discouraged because shared `?b=` build links
 * encode these ids. Editing one silently breaks every link a salesperson has
 * already sent. `access.update` returning false is what enforces it; the
 * greyed-out box is only the part staff can see.
 *
 * Not marked `required`, deliberately: the admin's client-side validation
 * would refuse to submit an empty read-only field before the server ever got
 * the chance to fill it in.
 */
// The collection slug is passed in so the uniqueness probe queries the right
// table. Typed off the generated Config so a typo is a compile error.
type CatalogCollection = Parameters<Payload["find"]>[0]["collection"];

const slugField = (collection: CatalogCollection): Field => ({
    name: "slug",
    type: "text" as const,
    unique: true,
    index: true,
    access: { update: () => false },
    admin: {
      position: "sidebar" as const,
      readOnly: true,
      description:
        "Generated from the name when you first save. Permanent: shared build links encode it.",
    },
    hooks: {
      beforeValidate: [
        (async ({ value, data, originalDoc, req }) => {
          // Already has one: keep it, whatever the form sent.
          if (originalDoc?.slug) return originalDoc.slug;
          // The seed and the restore set slugs explicitly and must win.
          if (value) return value;

          const base = slugify(String(data?.name ?? ""));
          if (!base) return value;

          // Two products can legitimately share a name. Without this the save
          // fails on the unique index with a raw Postgres error.
          let candidate = base;
          for (let n = 2; n <= 50; n++) {
            const { totalDocs } = await req.payload.find({
              collection,
              where: { slug: { equals: candidate } },
              limit: 1,
              depth: 0,
            });
            if (totalDocs === 0) break;
            candidate = `${base}-${n}`;
          }
          return candidate;
        }) as FieldHook,
      ],
    },
});

/**
 * Two roles, because the people entering catalog data should not also be able
 * to delete the owner's account.
 *
 * A user created before this field existed has `role` null in the database.
 * That is read as "admin" on purpose: the alternative is that adding roles
 * locks every existing account out of the Users collection, including the
 * only one that could put it right.
 */
type Role = "admin" | "staff";

function roleOf(user: unknown): Role {
  return (user as { role?: Role } | null | undefined)?.role ?? "admin";
}

const isAdmin: Access = ({ req: { user } }) =>
  Boolean(user) && roleOf(user) === "admin";

// Same rule, different signature: collection access and field access are
// separate types in Payload because field access also receives the document.
const isAdminField: FieldAccess = ({ req: { user } }) =>
  Boolean(user) && roleOf(user) === "admin";

/** Admins see everyone. Everyone else sees only their own account. */
const adminOrSelf: Access = ({ req: { user } }) => {
  if (!user) return false;
  if (roleOf(user) === "admin") return true;
  return { id: { equals: user.id } };
};

const Users: CollectionConfig = {
  slug: "users",
  auth: true,
  admin: {
    useAsTitle: "email",
    defaultColumns: ["email", "name", "role"],
    group: "Admin",
    description:
      "Staff accounts for this admin. Create one here with an email and a starting password, then have the person change it under their own account.",
  },
  access: {
    read: adminOrSelf,
    create: isAdmin,
    update: adminOrSelf,
    delete: isAdmin,
  },
  fields: [
    { name: "name", type: "text" },
    {
      name: "role",
      type: "select",
      required: true,
      defaultValue: "staff",
      // Only an admin can hand out a role, so staff cannot promote themselves
      // on the way through their own profile.
      access: { create: isAdminField, update: isAdminField },
      options: [
        {
          label: "Admin — full access, including managing these accounts",
          value: "admin",
        },
        {
          label: "Staff — can edit the catalog, cannot manage accounts",
          value: "staff",
        },
      ],
    },
  ],
  hooks: {
    beforeDelete: [
      ({ req, id }) => {
        // Deleting the account you are signed in with locks you out mid-click.
        if (req.user && String(req.user.id) === String(id)) {
          throw new Error(
            "You cannot delete the account you are signed in with. Ask another admin to do it.",
          );
        }
      },
    ],
  },
};

const Media: CollectionConfig = {
  slug: "media",
  admin: { group: "Admin" },
  /**
   * The only collection a browser reads directly. Payload defaults every
   * collection to authenticated-only, which 403s these files for anonymous
   * visitors and leaves the storefront with no product photos. Writes still
   * require a login; the rest of the catalog is only ever reached through the
   * Local API in lib/cms.ts, so it stays closed.
   */
  access: { read: () => true },
  upload: {
    // Product shots render at ~400px and the lightbox at ~800px. Anything the
    // shop uploads straight off a phone gets cut down on the way in.
    imageSizes: [
      { name: "thumb", width: 400, height: 400, position: "centre" },
      { name: "large", width: 800, height: undefined },
    ],
    mimeTypes: ["image/*"],
  },
  fields: [
    {
      name: "alt",
      type: "text",
      required: true,
      admin: { description: "What the photo shows. Read aloud by screen readers." },
    },
  ],
};

/**
 * 3D models for the floor plans: the .glb files `npm run van-model` writes.
 * Public read for the same reason as media: the browser fetches them
 * directly. Kept apart from media so image resizing never touches them.
 */
const Models: CollectionConfig = {
  slug: "models",
  labels: { singular: "3D Model", plural: "3D Models" },
  admin: { group: "Admin" },
  access: { read: () => true },
  upload: {
    // Browsers report .glb as either; Payload sniffs the file too.
    mimeTypes: ["model/gltf-binary", "application/octet-stream"],
  },
  fields: [
    {
      name: "note",
      type: "text",
      admin: { description: "Which SketchUp build this came from, e.g. Build 2." },
    },
  ],
};

const Categories: CollectionConfig = {
  slug: "categories",
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "blurb", "order"],
    group: "Catalog",
  },
  defaultSort: "order",
  fields: [
    { name: "name", type: "text", required: true },
    slugField("categories"),
    { name: "blurb", type: "text", required: true },
    { name: "order", type: "number", required: true, defaultValue: 0 },
  ],
};

/*
 * Step one of the wizard: the chassis.
 *
 * priceDelta is what this length adds over the shortest van, not a price of
 * its own. The floor plan carries basePrice. Three lengths times five plans
 * would otherwise be fifteen numbers to keep in step, and they would drift.
 */
const VanLengths: CollectionConfig = {
  slug: "van-lengths",
  labels: { singular: "Van Length", plural: "Van Lengths" },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "tagline", "priceDelta", "order"],
    group: "Catalog",
  },
  defaultSort: "order",
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
      admin: {
        description:
          "What the length gets the buyer, not the spec. Nobody arrives knowing they want 170 inches.",
      },
    },
    slugField("van-lengths"),
    {
      name: "tagline",
      type: "text",
      required: true,
      admin: { description: 'The spec, e.g. 170" wheelbase, room for a fixed bed.' },
    },
    {
      name: "priceDelta",
      type: "number",
      required: true,
      defaultValue: 0,
      admin: {
        description:
          "What this length ADDS over the shortest van. The shortest one is 0.",
      },
    },
    { name: "image", type: "upload", relationTo: "media" },
    {
      name: "overallInches",
      type: "number",
      required: true,
      defaultValue: 233.5,
      admin: {
        description:
          "Overall vehicle length in inches. Drives the to-scale comparison bar.",
      },
    },
    { name: "order", type: "number", required: true, defaultValue: 0 },
  ],
};

const FloorPlans: CollectionConfig = {
  slug: "floor-plans",
  labels: { singular: "Floor Plan", plural: "Floor Plans" },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "tagline", "basePrice", "order"],
    group: "Catalog",
  },
  defaultSort: "order",
  fields: [
    { name: "name", type: "text", required: true },
    slugField("floor-plans"),
    { name: "tagline", type: "text", required: true },
    {
      name: "basePrice",
      type: "number",
      required: true,
      admin: {
        description:
          "Includes the Mercedes Sprinter itself. Every price surface in the app says so.",
      },
    },
    { name: "order", type: "number", required: true, defaultValue: 0 },
    {
      name: "model",
      type: "upload",
      relationTo: "models",
      label: "3D model",
      admin: {
        description:
          "The .glb the floor plan card and the Layout step show. Make it with npm run van-model. Leave empty to show the shared model.",
      },
    },
    {
      name: "availableLengths",
      type: "relationship",
      relationTo: "van-lengths",
      hasMany: true,
      label: "Van lengths",
      admin: {
        description:
          "Which chassis this floor plan is built on. Leave empty for all of them.",
        components: {
          Field: {
            path: "/components/admin/RelationshipCheckboxes#RelationshipCheckboxes",
            clientProps: {
              collection: "van-lengths",
              label: "Van lengths",
              help: "Tick every chassis this floor plan is built on. The wizard hides the plan from anyone who picked a length that is not ticked.",
              emptyNoun: "van lengths",
            },
          },
        },
      },
    },
    {
      name: "gallery",
      type: "array",
      labels: { singular: "View", plural: "Views" },
      admin: {
        description:
          "The layout gallery. First entry is the one shown on the floor plan card.",
      },
      fields: [
        { name: "label", type: "text", required: true },
        { name: "image", type: "upload", relationTo: "media", required: true },
      ],
    },
    {
      name: "specs",
      type: "array",
      fields: [
        { name: "label", type: "text", required: true },
        { name: "value", type: "text", required: true },
      ],
    },
  ],
};

const Products: CollectionConfig = {
  slug: "products",
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "category", "type", "price"],
    group: "Catalog",
    description:
      "One shared library. A product is entered once here and picked by as many trim packages as need it, so a price change lands everywhere at once.",
  },
  fields: [
    { name: "name", type: "text", required: true },
    slugField("products"),
    { name: "description", type: "text" },
    {
      name: "category",
      type: "relationship",
      relationTo: "categories",
      required: true,
    },
    {
      name: "type",
      type: "select",
      required: true,
      defaultValue: "included",
      options: [
        { label: "Included with every build", value: "included" },
        { label: "Upgrade (replaces an included item)", value: "upgrade" },
        { label: "Add-on (extra, replaces nothing)", value: "addon" },
      ],
    },
    {
      name: "price",
      type: "number",
      required: true,
      defaultValue: 0,
      admin: {
        description:
          "Included: leave at 0. Upgrade: charge the DIFFERENCE over the item it replaces. Add-on: the full price.",
      },
    },
    {
      name: "selectable",
      type: "checkbox",
      defaultValue: true,
      admin: {
        description:
          "Untick to hide this from its category step. It still prices, still shows on the Build Sheet, and still appears in the what-is-included list of any trim package that carries it. For components a buyer has no opinion about, like a 50A versus a 100A charger.",
      },
    },
    { name: "image", type: "upload", relationTo: "media" },
    {
      type: "collapsible",
      label: "Fit rules",
      admin: {
        description:
          "These stop the configurator building a van the shop cannot deliver.",
      },
      fields: [
        {
          name: "replaces",
          type: "relationship",
          relationTo: "products",
          label: "Replaces this included item",
          admin: {
            condition: (data) => data?.type === "upgrade",
            description:
              "Two upgrades replacing the same item are automatically mutually exclusive.",
          },
        },
        {
          name: "requires",
          type: "relationship",
          relationTo: "products",
          hasMany: true,
          label: "Requires these first",
          admin: {
            description:
              "Picking this pulls them in. Removing one of them removes this too.",
          },
        },
        {
          name: "conflictsWith",
          type: "relationship",
          relationTo: "products",
          hasMany: true,
          label: "Cannot be combined with",
        },
        {
          name: "availableFor",
          type: "relationship",
          relationTo: "floor-plans",
          hasMany: true,
          label: "Only fits these floor plans",
          admin: { description: "Leave empty if it fits every plan." },
        },
      ],
    },
  ],
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data;
        // A product cannot depend on, fight, or replace itself. Payload will
        // happily store it and the rules engine would then loop.
        const self = data.id;
        if (self) {
          for (const key of ["requires", "conflictsWith"] as const) {
            const list = data[key];
            if (Array.isArray(list) && list.some((v) => v === self)) {
              throw new Error(
                `A product cannot list itself under "${key}". Remove it and save again.`,
              );
            }
          }
          if (data.replaces === self) {
            throw new Error("A product cannot replace itself.");
          }
        }
        if (data.type !== "upgrade" && data.replaces) {
          throw new Error(
            'Only an upgrade can replace something. Change the type to "Upgrade", or clear the Replaces field.',
          );
        }
        if (data.type === "included" && Number(data.price) !== 0) {
          throw new Error(
            "An included item ships with every build, so its price must be 0. Make it an upgrade or an add-on to charge for it.",
          );
        }
        return data;
      },
    ],
  },
};

const TrimPackages: CollectionConfig = {
  slug: "trim-packages",
  labels: { singular: "Trim Package", plural: "Trim Packages" },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "priceDelta", "floorPlan", "order"],
    group: "Catalog",
    description:
      "Essential, Adventure, Summit. A trim package pre-selects products from the shared library; it does not own them.",
  },
  defaultSort: "order",
  fields: [
    { name: "name", type: "text", required: true },
    slugField("trim-packages"),
    { name: "tagline", type: "text", required: true },
    {
      name: "priceDelta",
      type: "number",
      required: true,
      defaultValue: 0,
      admin: { description: "Added on top of the floor plan base price." },
    },
    { name: "order", type: "number", required: true, defaultValue: 0 },
    {
      name: "floorPlans",
      type: "relationship",
      relationTo: "floor-plans",
      hasMany: true,
      label: "Floor plans",
      admin: {
        description:
          "Leave every box unticked to offer this trim package on all floor plans.",
        components: {
          Field: {
            path: "/components/admin/RelationshipCheckboxes#RelationshipCheckboxes",
            clientProps: {
              collection: "floor-plans",
              label: "Floor plans",
              help: "Tick every floor plan this trim package is offered on. Leave all unticked to offer it everywhere.",
              emptyNoun: "floor plans",
            },
          },
        },
      },
    },
    {
      name: "defaults",
      type: "relationship",
      relationTo: "products",
      hasMany: true,
      label: "Pre-selected products",
      admin: {
        description:
          "Ticked on automatically when a buyer picks this trim package. They can still change any of it.",
      },
    },
  ],
};

const ColorGroups: CollectionConfig = {
  slug: "color-groups",
  labels: { singular: "Colour Group", plural: "Colour Groups" },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "category", "order"],
    group: "Catalog",
    description:
      "Pick-exactly-one swatch sets. Every choice is $0 today; the price field exists so a premium finish can charge later without a rebuild.",
  },
  defaultSort: "order",
  fields: [
    { name: "name", type: "text", required: true },
    slugField("color-groups"),
    { name: "blurb", type: "text", required: true },
    { name: "order", type: "number", required: true, defaultValue: 0 },
    {
      name: "category",
      type: "relationship",
      relationTo: "categories",
      required: true,
      admin: { description: "Which wizard step these swatches appear on." },
    },
    {
      name: "choices",
      type: "array",
      required: true,
      minRows: 2,
      labels: { singular: "Swatch", plural: "Swatches" },
      fields: [
        { name: "name", type: "text", required: true },
        { name: "slug", type: "text", required: true },
        {
          name: "hex",
          type: "text",
          required: true,
          admin: { description: "Six-digit hex, e.g. #c8a072." },
        },
        {
          name: "hex2",
          type: "text",
          admin: {
            description:
              "Optional second hex. Set it for wood grains to render a two-tone swatch.",
          },
        },
        { name: "price", type: "number", required: true, defaultValue: 0 },
      ],
    },
  ],
};

export default buildConfig({
  admin: {
    user: Users.slug,
    meta: { titleSuffix: " | Papago Vans" },
    // Component paths, not imports: Payload resolves these against the project
    // root and writes them into app/(payload)/admin/importMap.js. Regenerate
    // with `npx payload generate:importmap` after changing them.
    components: {
      graphics: {
        Logo: "/components/admin/PapagoLogo#Logo",
        Icon: "/components/admin/PapagoLogo#Icon",
      },
    },
  },
  collections: [
    VanLengths,
    FloorPlans,
    TrimPackages,
    Products,
    Categories,
    ColorGroups,
    Media,
    Models,
    Users,
  ],
  // No rich text field in this schema, so no editor is configured. The lexical
  // package also carries a top-level await that breaks the CLI's CJS loader.
  db: postgresAdapter({
    pool: { connectionString },
    // Dev only. Drizzle syncs the schema straight to Neon, which is what makes
    // schema changes free during the mockup phase. It must never run from a
    // production function: generate migrations before the shop enters content
    // worth keeping.
    push: process.env.NODE_ENV !== "production",
  }),
  plugins: [
    // Vercel's filesystem is read-only, so uploads cannot live on disk.
    vercelBlobStorage({
      enabled: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      collections: { media: true, models: true },
      token: process.env.BLOB_READ_WRITE_TOKEN ?? "",
    }),
  ],
  secret: process.env.PAYLOAD_SECRET ?? "",
  typescript: { outputFile: path.resolve(dirname, "payload-types.ts") },
  sharp,
});
