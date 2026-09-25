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
vercel env pull .env.local --environment=preview --scope papago
npm run dev          # storefront localhost:3000, admin localhost:3000/admin
```

```bash
npm run build        # production build + typecheck
npm run lint
npm run seed                 # load the catalog into an empty database
npm run backup               # snapshot the database to ./backups
```

**This needs a database now.** The catalog lives in Payload on Neon Postgres,
so `.env.local` must carry a connection string plus `PAYLOAD_SECRET` and
`BLOB_READ_WRITE_TOKEN`.

The Neon variables are **Secret type in Vercel and will not come down over the
CLI**. `vercel env pull` writes `[SENSITIVE]` placeholders for them. Copy the
real block once from Vercel → Storage → `papago-build` → the `.env.local`
snippet. `PAYLOAD_SECRET` and `BLOB_READ_WRITE_TOKEN` do pull normally.

The project is **ESM** (`"type": "module"`). Payload's config uses
`import.meta.url`, and its CLI cannot load the config under CommonJS.

---

## Current status

Phase 1 **mockup**, built so Papago ownership can visualize the system.
Not customer-facing yet.

| Working | Not built yet |
|---|---|
| 5-stage wizard, van length first | Email adapter (writes to console today) |
| Pricing engine | |
| Compatibility rules engine | Real catalog data and pricing |
| **HubSpot lead submission** | |
| 49 product thumbnails + lightbox | |
| Layout gallery, 8 views | Generated DB migrations (dev uses push) |
| Name/email capture + personalization | |
| **Build Sheet PDF** | |
| **Payload admin at `/admin`, catalog in Postgres** | |

### Known placeholders

- **Catalog data** is representative, not real. It lives in Postgres now, but
  it got there from `scripts/seed.ts`, so it is the same placeholder content.
  Only the Electricity options are verbatim from Papago's dev site. Everything
  else needs real spec sheets, entered through `/admin`.
- **All 5 floor plans share one render set.** Fine for testing the flow, will
  confuse a real buyer comparing El Capitan against Rainier.
- **Product photos are retailer/manufacturer images used as mockup placeholders.
  They are not licensed for public launch.** Replace with owned, licensed, or
  supplier-provided imagery before going customer-facing.
- **The three van length renders come from Mercedes' own configurator**
  (`assets.mbvans.com`), cropped to a shared frame. Ownership confirmed these
  are cleared for use as a Mercedes-Benz reseller. Render codes are in the
  comment on `VAN_LENGTHS` in `lib/catalog.ts` so the set can be rebuilt or
  extended later.

---

## How the product works

```
Intro (name/email)
  → Van Length        144, 170, 170 EXT
  → Floor Plan        5 layouts, filtered to the ones built on that chassis
  → Layout            gallery, 8 views of the chosen plan
  → Trim Package      3 tiers, each pre-fills every category
  → Colors            the four swatch groups, plus finish upgrades
  → Options           every remaining category on ONE page with a jump nav:
                      Electrical, Water System, Heating & Cooling,
                      Interior, Exterior
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
total = floorPlan.basePrice          the price on the shortest van
      + vanLength.priceDelta        0 on a 144, +12k on a 170, +20k on a 170 EXT
      + package.priceDelta
      + Σ(selected upgrade deltas)
      + Σ(selected addon prices)
```

A fourth thing, **colour choices**, lives alongside the options. The Finishes
step carries four colour groups (flooring, walls, cabinets, countertop), each
a required pick-exactly-one swatch set. **All 16 choices are $0 today**, but
every choice keeps a `price` field that already flows through `priceBuild()`,
the Build Sheet, and the `?b=` URL, so a premium finish can carry an upcharge
later with no schema change.

**Base price is $180,000 for all five plans on a 144, and includes the van.**
The chassis adds a delta on top: the 170 adds $12,000 and the 170 EXT adds
$20,000. `basePrice` stays on the floor plan so three lengths times five plans
is eight numbers to maintain rather than fifteen that drift apart. This
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
  globals.css          brand tokens (Tailwind v4 @theme)
  (frontend)/          the storefront
    layout.tsx         fonts (Prompt), metadata
    page.tsx           loads the catalog, renders <Configurator />
    api/build-sheet/   POST -> the Build Sheet PDF
  (payload)/           the admin, its own root layout
    admin/             Payload UI at /admin
    api/               Payload REST + GraphQL
components/
  Configurator.tsx     the whole wizard: steps, state, lightbox
lib/
  catalog.ts           types, catalog helpers, HARDCODED_CATALOG (seed only)
  cms.ts               loads the live catalog out of Payload
  pricing.ts           pricing + rules engine + URL state + customer type
  build-sheet.tsx      the PDF document
  db-backup.ts         logical dump and restore for the Neon database
payload.config.ts      7 collections, fit-rule guards, storage adapter
scripts/seed.ts        loads HARDCODED_CATALOG into an empty database
scripts/backup.ts      snapshots the database to a gzipped JSON file
scripts/restore.ts     loads a snapshot back, replacing everything
public/                original art, now also the seed's image source
```

**There is deliberately no `app/layout.tsx`.** Route groups cannot escape a
root layout, so the admin can only own its own `<html>` if none exists above
it. Both groups carry their own root layout. Do not add one.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 ·
Payload 3 · Neon Postgres · Vercel Blob · deployed on Vercel.

### Decisions worth not re-litigating

**No database for build state.** A buyer's configuration encodes into the `?b=`
URL parameter, so builds stay shareable and resumable with no persistence. A
fully loaded 16-option build is ~318 characters. The catalog moving to Postgres
did not change this and must not. Add a table for build state only when
abandoned-build analytics are actually needed.

**Customer PII stays out of the URL.** Name and email live in `sessionStorage`
only. The `?b=` param is designed to be shared, so PII must never ride along.

**Slugs are the ids, everywhere.** Every catalog row carries a `slug` holding
the id the hardcoded catalog used (`elec-solar-600`, `el-capitan`). Payload's
numeric primary keys never leave `lib/cms.ts`. Two reasons: `?b=` links encode
those ids and would all break, and the seed matches on slug, which is what
makes it re-runnable instead of duplicating the catalog.

**Products are one shared library.** Trim packages point at products; they do
not own them. The same inverter appears in several packages across five plans
as a single row, so a price change lands everywhere at once. Never let the
admin create a product *inside* a package: that is how fifteen copies of one
inverter end up with four different prices.

**The catalog is read through Payload's Local API, not REST.** `lib/cms.ts`
runs in-process, so there is no HTTP hop and the catalog collections stay
closed to anonymous reads. `media` is the single exception, because a browser
fetches those files directly.

**Payload chosen over Sanity.** The catalog is relational: products reference
other products through `requires`, `conflictsWith` and `replaces`. Payload
gives real foreign keys and an admin generated from the schema, and it runs
inside this same Next app, so a schema change and an app change ship in one
commit. The tradeoff accepted was adding a database.

**Six categories, shaped like systems.** There were nine, and they were shaped
like places in the van: Kitchen, Storage, Seating, Miscellaneous. A buyer then
has to guess which drawer a thing lives in, and the guesses were bad. A blackout
blind was Miscellaneous. A roof fan was Heating/Cooling. Papago's live site
still files winches and light bars under *Electricity*.

The six are systems instead, which is how the shop quotes and how an owner
thinks once they are living in it. Interior is the largest at 18 products,
because it absorbed Kitchen, Storage, Seating and Miscellaneous. Split it again
only if buyers say that step feels long, not because 18 looks like a big number.

Finishes survives as a category because the four colour groups hang off it.
Chassis is not one: van length is step one of the wizard, ahead of all of this.

---

## Administering the catalog

Staff sign in at **`/admin`** and work down one level at a time. Nothing here
needs code.

```
Floor Plans      name, tagline, base price, gallery views, spec table
  └ Trim Packages    price delta, and which products it pre-selects
Products         the shared library: title, description, photo, price,
                 category, and the fit rules
Colour Groups    swatch sets, each choice a name, hex and price
Categories       the nine wizard steps and their order
Media            every uploaded image
```

**Selectable** is the tickbox that decides whether a buyer is asked about a
product at all. Untick it and the product vanishes from its category step while
staying entirely real: it still prices, still reaches the Build Sheet, and still
appears in the what-is-included list of any trim package carrying it.

It exists because a buyer has no opinion about a 50A versus a 100A DC-DC
charger, and being asked is worse than not being asked. Those belong to the trim
package. Electrical went from three questions to one: the only thing left to
decide there is 400W or 600W of solar.

It is not a soft delete. An unticked product a package carries is as real as any
other, worth $8,180 on the Summit build today.

**Availability is ticked, not typed.** Two relationships decide what a buyer
is offered, and both render as checkbox lists rather than Payload's default
type-ahead select:

```
Floor Plans   → Van lengths    which chassis this plan is built on
Trim Packages → Floor plans    which plans this package is offered on
```

Leaving every box unticked means *all of them*, including any added later.
That is the safe default: a plan quietly missing from a chassis is a worse
failure than one offered too widely, and the shop sees the miss immediately.

Both use `components/admin/RelationshipCheckboxes.tsx`, one component
configured twice through `clientProps`. The stored value is an ordinary
relationship array, so nothing downstream knows the control is custom.

**Fit rules** are plain-English pickers on a product: requires these first,
cannot be combined with, replaces this included item, only fits these floor
plans. Payload refuses to save a contradiction: nothing may require, conflict
with or replace itself, only an upgrade may replace, and an included item must
be priced at 0.

**Images** are resized on upload to a 400px thumbnail and an 800px lightbox
copy, so a phone photo straight from the shop is fine.

Edits appear on the storefront immediately. The page renders per request
(`export const dynamic = "force-dynamic"`), which is a handful of small
queries against Neon in the same region. If that ever costs anything, cache it
under a tag and revalidate from a Payload `afterChange` hook rather than going
back to build-time data.

### Reseeding

`npm run seed` is safe to re-run: it matches on slug, so it updates
in place and re-uploads nothing. Run it after editing `HARDCODED_CATALOG` in
`lib/catalog.ts`, or to fill a fresh database.

It runs under `tsx` rather than `payload run`, because that runner exits
without awaiting the script and the seed silently does nothing.

---

## Backing up the catalog

Two layers, because they fail differently.

**Layer 1: Neon's point-in-time restore.** Free, automatic, nothing to run.
It rewinds the database to any moment inside the retention window, which is
the right tool for "someone deleted a floor plan an hour ago." Check the
window in the Neon console under the project's **Settings → Storage →
History retention**, and raise it to whatever the plan allows before the shop
starts entering real data. It does not survive the Neon project itself being
deleted or the Vercel integration being removed, which is why there is a
layer 2.

**Layer 0: mirror everything to Dropbox.** `~/projects/backup-papago.sh`
mirrors all three Papago repos and snapshots the database into
`Dropbox/SumoLab/Clients/Papago Vans/repo-backups/`. A mirror is a full bare
clone, every branch and commit, not a copy of the working tree:

```bash
~/projects/backup-papago.sh
git clone "<vault>/papagovans-build.git" papagovans-build   # to restore
```

It refuses to run rather than half-finish if the 4TB drive is not mounted.

**Layer 2: a file you hold.**

```bash
npm run backup                              # -> ./backups (gitignored)
BACKUP_DIR="/path/in/Dropbox" npm run backup
npm run restore -- backups/papago-catalog-<stamp>.json.gz
```

`npm run backup` only reads, so it is safe any time. It writes a gzipped
JSON snapshot of every table in the `public` schema, primary keys included;
the whole catalog is about 11 KB. **Set `BACKUP_DIR`** or the backup sits on
the same disk as everything else and protects against nothing.

`npm run restore` **replaces the entire database**. It prints which database
it is pointing at and how many rows it is about to destroy, then waits for
you to type `restore`. Pass `--yes` to skip that in a script. The whole thing
runs in one transaction, so a failure leaves the database exactly as it was.

Snapshots carry real pricing and the admin account's password hash, and this
repo is public, so `/backups` is gitignored. Keep them somewhere private.

**What a snapshot does not contain.** Product images live in Vercel Blob, not
Postgres; the snapshot records their filenames and URLs, so restoring into a
database whose Blob store was also wiped gives you a catalog with dead image
links. The `neon_auth` schema is skipped too: the Vercel integration creates
it, and this app does not use it, since Payload has its own `users`.

Live sessions, document locks and admin UI preferences are deliberately not
restored. Everyone signs in again after a restore.

### Verifying a backup

A snapshot nobody has restored is not a backup. The round trip has been run
against the dev database and is worth repeating after any schema change:

```bash
npm run backup
npm run restore -- backups/<the file you just wrote> --yes
```

Then check the row counts match, `/admin` and the storefront both load, and
a product image still returns 200 anonymously. Two things that specifically
broke during development and are now handled: `products.replaces_id` points
at another product, so those columns go in as null and are filled once every
row exists; and rows arrive with their original ids, so every identity
sequence is walked forward afterwards or the next admin save collides.

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

**Wizard steps** are constants at the top of `components/Configurator.tsx`.

They used to be partly computed: each category had its own step, so the length
of the wizard depended on how many categories existed. That meant six Next
clicks through screens most buyers did not care about. Categories are sections
on a single Options page now, with a jump nav, so a buyer sees the whole shape
of the decision and goes straight to the parts they have an opinion about.

Inserting a step means updating the constants and the Stepper's `labels` array
together. Never scatter magic numbers.

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
| **Database** | Neon Postgres via the Vercel integration, store `papago-build`, region `us-east-1` to match the project's `iad1` |
| **Media** | Vercel Blob store `papago-build-media`, public access |
| **Admin** | Payload at `/admin`. Accounts are created in the app; the first-user screen is open until one exists, so never deploy an empty database |
| **DNS** | Cloudflare, zone `papagovans.com`, `build` CNAME → `cname.vercel-dns.com`, **DNS only / gray cloud** (proxy on breaks SSL) |
| **CRM** | HubSpot portal `43782575` (not yet wired to this app) |
| **Source art** | Original van renders in Dropbox: `SumoLab/Clients/Papago Vans/app build/` |

Sibling project: **`github.com/papagovans/web`** → `go.papagovans.com`, the
Astro landing page with Google Ads and Meta conversion tracking.

---

## Roadmap

**Phase 2, mostly done** — Build Sheet PDF, the Payload admin, and HubSpot
lead submission all ship. Remaining: an email adapter, generated migrations to
replace Drizzle push, and admin polish (drag-to-reorder, a preview link).

### Lead submission

Every Build Sheet request posts to a HubSpot **form**, not to the CRM API.
That keeps a private app token out of this repo, and it lets whoever owns the
form change its fields, notifications and follow-up without a deploy.

```bash
vercel env add HUBSPOT_PORTAL_ID --scope papago            # 43782575
vercel env add HUBSPOT_BUILD_STARTED_FORM_ID --scope papago
vercel env add HUBSPOT_BUILD_SHEET_FORM_ID --scope papago
```

**Two submissions, two forms.** One fires when a buyer hands over their
details at the start, before configuring anything; the other when they ask for
the Build Sheet. HubSpot matches on email, so the second updates the same
contact rather than creating a duplicate.

| | `papago_lead_source` |
|---|---|
| Details submitted | `Van Builder Started` |
| Build Sheet requested | `Van Builder Completed` |

Started with no matching Completed is the signal worth chasing: someone who
began a van and walked away. That distinction is the whole reason it is two
forms rather than one submitted twice.

The early capture is deliberate and it has a cost: the pipeline fills with
half-built vans. The lead source is what lets a salesperson tell a browser
from a buyer instead of working them all the same.

**No PDF is attached.** The completed submission carries `papago_build_link`
instead, which opens the live build in the configurator. Whoever picks up the
phone can change it and re-price on the call; a PDF is a photograph of a
decision. Attaching a real file would also need a private app token, which is
exactly what submitting to a form avoids.

Until both are set, `submitBuildSheetLead()` returns `"skipped"` and the Build
Sheet works exactly as before. It never throws: a customer who asked for their
Build Sheet gets it whether or not HubSpot is reachable.

Alongside the contact fields it sends the floor plan, the trim package, the
total, the option count, and **a link back to the exact build**, so whoever
picks up the phone can open what the customer configured rather than reading
it off a PDF. Create those as properties on the HubSpot form:
`papago_floor_plan`, `papago_trim_package`, `papago_build_total`,
`papago_option_count`, `papago_build_link`.

```bash
npx tsx scripts/check-hubspot.ts    # asserts it skips cleanly and never throws
```

**Phase 3** — Additional chassis (Transit, Promaster), Hearth financing
calculator, book-a-call handoff, sales-rep view of submitted builds.
