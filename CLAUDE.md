@AGENTS.md

# Papago Vans Build Configurator

Wizard at **build.papagovans.com** that lets prospects configure a custom
Mercedes Sprinter camper conversion and get a Build Sheet. Papago Vans is a
camper van conversion company in Mesa, AZ.

**Papago Vans is its own business.** It is unrelated to SumoLab, renchit, or
Heavy DJs. Do not borrow framing, tone, or audience language from those.

## Status

Phase 1 mockup, shown to Papago ownership so they can visualize the system.
Not customer-facing yet.

| Done | Not yet |
|---|---|
| Wizard, pricing engine, rules engine | Build Sheet PDF generation |
| Product thumbnails + lightbox | HubSpot lead submission |
| Layout gallery, personalization | Sanity CMS (catalog is hardcoded) |

## Architecture decisions worth not re-litigating

**No database.** Build state encodes into the `?b=` URL param, so builds are
shareable and resumable with zero persistence. A full 16-option build is ~318
chars. Only add a database when abandoned-build analytics are actually needed.

**Customer PII stays out of the URL.** Name and email live in `sessionStorage`
only. The `?b=` param is designed to be shared, so PII must never ride along.

**Catalog is hardcoded in `lib/catalog.ts`** and deliberately mirrors the
intended Sanity schema so the port is mechanical. Do not model CMS content
until the flow is approved; changing a TS file is free, changing a Sanity
schema after content entry is not.

## The pricing model

Three option types that behave differently. This distinction is the core of the
engine, do not flatten it:

- `included` — ships with the build, $0, display only
- `upgrade` — *replaces* an included item via `replaces`, price is the **delta**
- `addon` — purely additive, price is the **full** amount

`total = floorPlan.basePrice + package.priceDelta + Σ(upgrade deltas) + Σ(addons)`

Base price is **$180,000 for all five plans** and **includes the van**. This
differs from the public site, which quotes $53k–$127k excluding the van. Every
price surface must say "van included."

## The rules engine (`lib/pricing.ts`)

`toggleOption` enforces compatibility, and it must keep doing all of this:

- `requires` — selecting pulls dependencies in (winch auto-adds the bumper)
- deselect **cascades** — dropping the bumper drops the winch
- `conflictsWith` — mutually exclusive options (indoor vs exterior shower)
- two upgrades sharing a `replaces` target are implicitly exclusive
- `availableFor` — per-floor-plan fit rules; changing plans clears bad selections

## Conventions

**Brand tokens** in `app/globals.css`, sampled from papagovans.com's live CSS:
navy `#303C47`, gold `#F4D969`, steel `#53687B`, cream `#FCFAF3`. Font is
**Prompt**. Headlines are uppercase (`.brand-heading`).

**Wizard steps** are index constants at the top of `components/Configurator.tsx`.
Inserting a step means updating those constants plus the `labels` array, not
scattering magic numbers.

**Next.js 16** — read `node_modules/next/dist/docs/` before writing code, per
AGENTS.md. Notably `params` is a Promise, and Tailwind v4 uses `@theme`.

**Inline `<script>` tags need `is:inline`-equivalent care.** Not relevant here
yet, but the sibling landing-page repo (`papagovans/web`, Astro) hit this with
gtag/fbq snippets.

## Images

- `public/floorplans/` — 8 renders from Papago. `cutaway` is the card thumbnail,
  `floorplan` is the true top-down. All 5 plans currently share one set.
- `public/products/` — 49 option thumbnails, one per option id, all `.webp`.
- `public/sprinter.webp` — Mercedes press cutout with alpha, used in the sticky bar.

**Licensing:** product thumbnails are retailer/manufacturer photos used as
mockup placeholders. They are **not licensed for public launch**. Replace with
owned, licensed, or supplier-provided imagery before going customer-facing.
Always visually check sourced images — two were rejected for carrying a
competitor's logo and for being mid-construction DIY shots.

Optimize any new image: max 800px, webp. The set is 49 files under 1 MB total.

## Deploying

Vercel project `papago/build` on the **personal `papago` scope**, not the
SumoLab team. The Vercel MCP tools are scoped to SumoLab and will 403 here —
use the CLI (`vercel --prod --scope papago`).

GitHub auto-deploy is connected but **has silently failed to fire at least
once**. After pushing, verify a new deployment actually appeared
(`vercel ls --scope papago`) and deploy manually if not.
