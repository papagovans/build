# Papago Vans — Build Configurator

A wizard that lets prospects configure a custom Mercedes-Benz Sprinter camper
conversion, see a running price, and request a Build Sheet.

**Live:** https://build.papagovans.com
**Company:** Papago Vans, camper van conversions, Mesa AZ

> This README is the single source of truth for the project. `AGENTS.md` and
> `CLAUDE.md` both point here so the three cannot drift apart. Any AI assistant
> or developer can be handed this file and get fully up to speed.

---

## Quickstart

```bash
git clone https://github.com/papagovans/build.git
cd build
npm install
npm run dev          # http://localhost:3000
```

```bash
npm run build        # production build + typecheck
npm run lint
```

No environment variables and no database are required to run this. Everything
needed is in the repo.

---

## Current status

Phase 1 **mockup**, built so Papago ownership can visualize the system.
Not customer-facing yet.

| Working | Not built yet |
|---|---|
| 14-step wizard | Build Sheet PDF generation |
| Pricing engine | HubSpot lead submission |
| Compatibility rules engine | Sanity CMS (catalog is hardcoded) |
| 49 product thumbnails + lightbox | Per-floor-plan renders |
| Layout gallery, 8 views | Real catalog data and pricing |
| Name/email capture + personalization | |

### Known placeholders

- **Catalog data** is representative, not real. Only the Electricity options are
  verbatim from Papago's dev site. Everything else needs real spec sheets.
- **All 5 floor plans share one render set.** Fine for testing the flow, will
  confuse a real buyer comparing El Capitan against Rainier.
- **Product photos are retailer/manufacturer images used as mockup placeholders.
  They are not licensed for public launch.** Replace with owned, licensed, or
  supplier-provided imagery before going customer-facing.

---

## How the product works

```
Intro (name/email)
  → Floor Plan        5 layouts
  → Layout            gallery, 8 views of the chosen plan
  → Trim Package      3 tiers, each pre-fills every category
  → 9 Categories      Electricity, Plumbing, Heating/Cooling, Kitchen,
                      Finishes, Storage, Seating/Sleeping,
                      Exterior/Off-Road, Miscellaneous
  → Build Sheet       itemized total
```

Trim packages **pre-fill** every category, so the category steps are refinement
rather than data entry. A buyer can jump to the Build Sheet at any point after
picking a trim package.

**The customer-facing term is "trim package," never "package" alone.** Plain
"package" reads as a bolt-on bundle in this industry, and the catalog already
ships products literally named that way (Premium Insulation Package,
All-Terrain Wheels and Tires Package). Code identifiers stay `package` /
`packageId` / `BuildPackage`, which is correct shorthand for the full term.

### Pricing model

Three option types that behave differently. This distinction is the core of the
engine — do not flatten it into a generic list.

| Type | Behavior | Price |
|---|---|---|
| `included` | Ships with the build | `0`, display only |
| `upgrade` | **Replaces** an included item (via `replaces`) | the **delta** |
| `addon` | Purely additive | the **full** amount |

```
total = floorPlan.basePrice
      + package.priceDelta
      + Σ(selected upgrade deltas)
      + Σ(selected addon prices)
```

A fourth thing, **colour choices**, lives alongside the options. The Finishes
step carries four `COLOR_GROUPS` (flooring, walls, cabinets, countertop), each
a required pick-exactly-one swatch set. **All 16 choices are $0 today**, but
every choice keeps a `price` field that already flows through `priceBuild()`,
the Build Sheet, and the `?b=` URL, so a premium finish can carry an upcharge
later with no schema change.

**Base price is $180,000 for all five plans and includes the van.** This
differs from the public marketing site, which quotes $53k–$127k *excluding*
the van. Every price surface in the app must say "van included."

### Compatibility rules

`toggleOption()` in `lib/pricing.ts` enforces all of the following. Changing it
without preserving these will produce invalid, unbuildable configurations:

- `requires` — selecting an option pulls its dependencies in
  (selecting the winch auto-adds the bumper)
- **deselect cascades** — dropping the bumper also drops the winch, so you can
  never own a winch with nothing to mount it to
- `conflictsWith` — mutually exclusive options (indoor vs. exterior shower)
- two upgrades sharing the same `replaces` target are implicitly exclusive
- `availableFor` — per-floor-plan fit rules; switching plans clears selections
  that no longer fit

---

## Architecture

```
app/
  layout.tsx           fonts (Prompt), metadata
  page.tsx             renders <Configurator />
  globals.css          brand tokens (Tailwind v4 @theme)
components/
  Configurator.tsx     the whole wizard: steps, state, lightbox
lib/
  catalog.ts           floor plans, trim packages, categories, 49 options,
                       4 colour groups
  pricing.ts           pricing + rules engine + URL state + customer type
public/
  floorplans/          8 renders (cutaway, top-down floorplan, 6 angles)
  products/            49 option thumbnails, one per option id, .webp
  sprinter.webp        Mercedes press cutout with alpha, sticky bar
```

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 ·
deployed on Vercel.

### Decisions worth not re-litigating

**No database.** Build state encodes into the `?b=` URL parameter, so builds are
shareable and resumable with zero persistence layer. A fully loaded 16-option
build is ~318 characters. Add a database only when abandoned-build analytics are
actually needed.

**Customer PII stays out of the URL.** Name and email live in `sessionStorage`
only. The `?b=` param is designed to be shared, so PII must never ride along.

**The catalog is hardcoded and deliberately mirrors the intended CMS schema**,
so porting to Sanity is mechanical. Do not model CMS content until the flow is
approved — changing a TypeScript file is free, changing a CMS schema after
content entry is not.

**Nine categories, not eight.** Papago's live site files winches, bumpers, and
light bars under *Electricity*. Exterior / Off-Road was split out to fix that.

---

## Conventions

**Brand tokens** live in `app/globals.css`, sampled from papagovans.com's live
stylesheet so this reads as the same product:

| Token | Hex |
|---|---|
| navy | `#303C47` |
| gold | `#F4D969` |
| steel | `#53687B` |
| cream | `#FCFAF3` |

Font is **Prompt**. Headlines are uppercase via `.brand-heading`.

**Wizard steps** are index constants at the top of `components/Configurator.tsx`.
Inserting a step means updating those constants and the `labels` array — never
scatter magic numbers.

**Images:** optimize anything new to max 800px, webp. The full set of 49 product
images is under 1 MB. Always *look at* a sourced image before committing it —
two were rejected during sourcing, one carrying a competitor's logo and one a
mid-construction DIY shot.

---

## Deploying

Auto-deploys from `main`. To deploy manually:

```bash
vercel --prod --scope papago
```

**Two gotchas:**

1. The Vercel project is on the **personal `papago` scope**, not the SumoLab
   team. Vercel MCP tooling is scoped to SumoLab and will return 403 here. Use
   the CLI.
2. GitHub auto-deploy **has silently failed to fire at least once**. After
   pushing, confirm a new deployment appeared with `vercel ls --scope papago`
   and deploy manually if it did not.

---

## Services and accounts

Everything an operator needs access to:

| Service | Detail |
|---|---|
| **GitHub** | `github.com/papagovans/build` (repo is currently public) |
| **Vercel** | project `build`, personal scope `papago` |
| **DNS** | Cloudflare, zone `papagovans.com`, `build` CNAME → `cname.vercel-dns.com`, **DNS only / gray cloud** (proxy on breaks SSL) |
| **CRM** | HubSpot portal `43782575` (not yet wired to this app) |
| **Source art** | Original van renders in Dropbox: `SumoLab/Clients/Papago Vans/app build/` |

Sibling project: **`github.com/papagovans/web`** → `go.papagovans.com`, the
Astro landing page with Google Ads and Meta conversion tracking.

---

## Roadmap

**Phase 2** — Build Sheet PDF (`@react-pdf/renderer` in a route handler),
HubSpot lead submission, Sanity CMS so the catalog is self-serve editable.

**Phase 3** — Additional chassis (Transit, Promaster), Hearth financing
calculator, book-a-call handoff, sales-rep view of submitted builds.
