import path from "path";
import { fileURLToPath } from "url";

import { postgresAdapter } from "@payloadcms/db-postgres";
import sharp from "sharp";
import { buildConfig, type CollectionConfig } from "payload";

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
const slugField = {
  name: "slug",
  type: "text" as const,
  required: true,
  unique: true,
  index: true,
  admin: {
    position: "sidebar" as const,
    description:
      "Permanent id used in shared build links. Safe to set once, expensive to change later.",
  },
};

const Users: CollectionConfig = {
  slug: "users",
  auth: true,
  admin: { useAsTitle: "email", group: "Admin" },
  fields: [{ name: "name", type: "text" }],
};

const Media: CollectionConfig = {
  slug: "media",
  admin: { group: "Admin" },
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
    slugField,
    { name: "blurb", type: "text", required: true },
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
    slugField,
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
    slugField,
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
    slugField,
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
      name: "floorPlan",
      type: "relationship",
      relationTo: "floor-plans",
      admin: {
        description:
          "Leave empty to offer this trim package on every floor plan.",
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
    slugField,
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
  },
  collections: [
    FloorPlans,
    TrimPackages,
    Products,
    Categories,
    ColorGroups,
    Media,
    Users,
  ],
  // No rich text field in this schema, so no editor is configured. The lexical
  // package also carries a top-level await that breaks the CLI's CJS loader.
  db: postgresAdapter({
    pool: { connectionString },
    // Mockup phase: let Drizzle sync the schema straight to Neon. Switch to
    // generated migrations before the shop enters content worth keeping.
    push: true,
  }),
  secret: process.env.PAYLOAD_SECRET ?? "",
  typescript: { outputFile: path.resolve(dirname, "payload-types.ts") },
  sharp,
});
