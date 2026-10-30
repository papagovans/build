"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Script from "next/script";
import {
  EXTRAS,
  type Layout,
  type Piece,
  SLOTS,
  type Slot,
  STANDARD,
  STANDARD_PIECES,
  fullCode,
  isModular,
  layoutCode,
  layoutLines,
  lineupModelFor,
  livingRoomsFor,
  parseLayout,
  pick,
  slot,
  toggleExtra,
} from "@/lib/modules";
import { UPGRADES_CATEGORY_ID } from "@/lib/upgrades";
import {
  getFloorPlan,
  getOption,
  getPackages,
  optionsFor,
  selectableOptionsFor,
  colorGroupsFor,
  type Catalog,
  type Category,
  getVanLength,
  planFitsLength,
  type ColorChoice,
  type ColorGroup,
  type FloorPlan,
  type Option,
  type VanLength,
  VAN_MAKES,
  VAN_NOTE,
  includedFor,
  partsOf,
  topLevel,
  vanLabel,
} from "@/lib/catalog";
import {
  EMPTY_CUSTOMER,
  applyPackage,
  decodeBuild,
  emptyBuild,
  encodeBuild,
  formatPrice,
  isSuperseded,
  priceBuild,
  setColor,
  setFloorPlan,
  setVanLength,
  isValidCustomer,
  toggleOption,
  type BuildState,
  type Customer,
} from "@/lib/pricing";

/**
 * Every step index is fixed now. It used to be that the categories each got
 * their own step, so the total depended on how many the shop had published and
 * the summary index had to be computed. They are all sections on one Options
 * page instead, which makes the wizard a known length.
 *
 * The van comes first and the name comes second, deliberately. Asking a
 * stranger for their details before showing them anything is the highest
 * abandonment point in a configurator; asking after they have chosen a van
 * asks someone who has already committed to something. The chassis also
 * narrows which floor plans are offered, so it has to precede the plan either
 * way.
 */
const LENGTH_STEP = 0;
const INTRO_STEP = 1;
/* The modular steps (owner, 2026-10-26): bed, driver side, passenger side,
 * add-ons, built up piece by piece in 3D. Only for a van with a lineup model
 * (lib/modules.ts), today the Sprinter 170, which skips the floor plans
 * instead. Every other van steps over these four; see stepFrom(). */
const BED_STEP = 2;
const DRIVER_STEP = 3;
const PASSENGER_STEP = 4;
const EXTRAS_STEP = 5;
const MODULAR_STEPS = [BED_STEP, DRIVER_STEP, PASSENGER_STEP, EXTRAS_STEP];
const PLAN_STEP = 6;
const GALLERY_STEP = 7;
/* Phase 1 of the streamlined builder (owner, 2026-09-28): one included list,
 * no trim tiers, colours or upgrades. StepPackage, StepColors and StepOptions
 * below are kept, unused, for when upgrades come back. */
const INCLUDED_STEP = 8;
/* Placeholder add-ons for now (owner, 2026-10-26; lib/upgrades.ts). */
const UPGRADES_STEP = 9;
const SUMMARY_STEP = 10;

/* The category that owns the colour swatches. It gets its own step; every
 * other category is a section on the single Options page. */
const COLOR_CATEGORY = "finishes";

/* Both live in localStorage, so a buyer who comes back tomorrow on the same
 * browser picks up where they left off instead of starting over. Device only:
 * neither ever rides in the URL, and a shared ?b= link beats the saved build. */
const CUSTOMER_KEY = "pv_customer";
const BUILD_KEY = "pv_build";

/* The marketing site the header logo returns to. Env so it can be pointed at
 * the rebuilt site the day that launches, without a code change. */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://papagovans.com";

/* Each floor plan's own model is uploaded in the admin. This shared one is
 * the fallback for a plan that has none yet. */
const FLOOR_PLAN_MODEL = "/models/floor-plan.glb";

/* A procedural studio light map: one key light from the side, a softer fill,
 * a dim floor. The viewer's built-in "neutral" light is even from every
 * direction, which is what made the model look flat and washed out. */
const STUDIO_LIGHT = "/models/studio.hdr";

/* Walking the aisle in first person. Where a person can stand is mapped by
 * `npm run van-model` and stored inside each model, so it follows the model:
 * upload a different floor plan in the admin and the walk-through follows. */
const WALK = {
  /* Degrees from straight up; 90 is level. A little below level is how
   * people look round a room, and it keeps counters and floor in frame. */
  gaze: 78,
  step: 0.1,
  turnDeg: 5,
};

/* The walk map as the model carries it: a grid of 5 cm cells over the floor,
 * one bit each, set where a person can stand. Metres, model coordinates. */
type WalkMap = {
  x0: number; z0: number; cell: number; cols: number; rows: number;
  eye: number; start: [number, number]; heading: number;
  open: (x: number, z: number) => boolean;
};

/* Reads the map out of the .glb's JSON chunk. The browser already fetched the
 * file for the viewer, so this is normally a cache hit. Null means the model
 * predates the map, and the Walk inside button stays hidden. */
async function loadWalkMap(url: string): Promise<WalkMap | null> {
  try {
    const buf = await (await fetch(url)).arrayBuffer();
    const view = new DataView(buf);
    const json = new TextDecoder().decode(new Uint8Array(buf, 20, view.getUint32(12, true)));
    const w = JSON.parse(json).scenes?.[0]?.extras?.papagoWalk;
    if (!w) return null;
    const bits = Uint8Array.from(atob(w.cells), (c) => c.charCodeAt(0));
    return {
      ...w,
      open: (x: number, z: number) => {
        const q = Math.floor((x - w.x0) / w.cell), r = Math.floor((z - w.z0) / w.cell);
        if (q < 0 || r < 0 || q >= w.cols || r >= w.rows) return false;
        const k = r * w.cols + q;
        return Boolean((bits[k >> 3] >> (k & 7)) & 1);
      },
    };
  } catch {
    return null;
  }
}

/* The slice of model-viewer's element API the walk mode drives. */
type ModelViewerElement = HTMLElement & {
  cameraTarget: string;
  cameraOrbit: string;
  getCameraOrbit(): { theta: number; phi: number; radius: number };
  getCameraTarget(): { x: number; y: number; z: number };
};


/* Google's viewer ships as a web component. Loaded from the CDN rather than
 * npm so three.js stays out of the wizard bundle for the steps without it. */
const MODEL_VIEWER_SRC =
  "https://cdn.jsdelivr.net/npm/@google/model-viewer@4/dist/model-viewer.min.js";

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.HTMLAttributes<HTMLElement> & Record<string, unknown>;
    }
  }
}

/**
 * The loaded catalog, shared with the whole wizard. Eight components read it;
 * threading it through every one of them as a prop would be all noise.
 */
const CatalogContext = createContext<Catalog | null>(null);

function useCatalog(): Catalog {
  const catalog = useContext(CatalogContext);
  if (!catalog) throw new Error("useCatalog must be used inside the wizard");
  return catalog;
}

export default function Configurator({ catalog }: { catalog: Catalog }) {
  const [build, setBuild] = useState<BuildState>(() => emptyBuild(catalog));
  const [customer, setCustomer] = useState<Customer>(EMPTY_CUSTOMER);
  const [step, setStep] = useState(LENGTH_STEP);
  /* One lead per visit. Stepping back to the details and forward again is
   * navigation, not a second person, and HubSpot would happily log both. */
  const leadSent = useRef(false);

  // Restore a shared build from the URL, else the last build on this device,
  // and the customer from this device.
  // Customer details deliberately stay out of the URL so shared links carry no PII.
  useEffect(() => {
    let savedBuild: string | null = null;
    let known = EMPTY_CUSTOMER;
    try {
      savedBuild = localStorage.getItem(BUILD_KEY);
      const saved = localStorage.getItem(CUSTOMER_KEY);
      // Merged onto the empty customer so a session saved before a field
      // existed restores as "" rather than undefined.
      if (saved) known = { ...EMPTY_CUSTOMER, ...JSON.parse(saved) };
      setCustomer(known);
    } catch {
      // Private mode or blocked storage. Non-fatal.
    }
    const restored = decodeBuild(
      catalog,
      new URLSearchParams(window.location.search).get("b") ?? savedBuild,
    );
    /* A returning buyer always reopens on the floor plans, with everything
       they picked still in place, rather than deep in the options where they
       left off. Floor plans are the decision the rest hangs on, and the one
       worth seeing again. Someone we have no details for gets the details
       form first, the same gate the Van Length step applies. */
    if (restored.floorPlanId || restored.vanLengthId) {
      setBuild(restored);
      setStep(isValidCustomer(known) ? (isModular(restored.vanLengthId) ? BED_STEP : PLAN_STEP) : INTRO_STEP);
    }
  }, [catalog]);

  useEffect(() => {
    try {
      if (customer.firstName || customer.email) {
        localStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer));
      }
    } catch {
      // Non-fatal.
    }
  }, [customer]);

  // Keep the URL in sync so any build is shareable and resumable. No database.
  useEffect(() => {
    const encoded = encodeBuild(build);
    const url = new URL(window.location.href);
    if (encoded) url.searchParams.set("b", encoded);
    else url.searchParams.delete("b");
    window.history.replaceState(null, "", url);
    try {
      if (encoded) localStorage.setItem(BUILD_KEY, encoded);
    } catch {
      // Non-fatal.
    }
  }, [build]);

  const plan = build.floorPlanId
    ? getFloorPlan(catalog, build.floorPlanId)
    : undefined;
  const breakdown = useMemo(() => priceBuild(catalog, build), [catalog, build]);
  const van = build.vanLengthId ? getVanLength(catalog, build.vanLengthId) : undefined;

  const modular = isModular(build.vanLengthId);
  const layout = useMemo(() => parseLayout(build.layout), [build.layout]);
  // An updater, not a value, so two quick clicks each build on the other.
  const updateLayout = (change: (l: Layout) => Layout) =>
    setBuild((b) => ({ ...b, layout: layoutCode(change(parseLayout(b.layout))) }));
  /* A modular van skips the floor plans; every other van skips the modular steps. */
  const skips = (i: number) =>
    modular ? i === PLAN_STEP || i === GALLERY_STEP : MODULAR_STEPS.includes(i);
  const stepFrom = (from: number, dir: 1 | -1) => {
    let next = from + dir;
    while (skips(next)) next += dir;
    return next;
  };
  const afterDetails = modular ? BED_STEP : PLAN_STEP;

  /** Whether each step's own choices are made. */
  const done = (i: number) =>
    i === LENGTH_STEP
      ? Boolean(build.vanLengthId)
      : i === INTRO_STEP
        ? isValidCustomer(customer)
        : i === BED_STEP
          ? Boolean(layout.picks.BC)
          : i === DRIVER_STEP
            ? Boolean(layout.picks.SH && layout.picks.LR)
            : i === PASSENGER_STEP
              ? Boolean(layout.picks.PI && layout.picks.PU)
              : i === EXTRAS_STEP
                ? true
                : Boolean(build.floorPlanId);
  const canAdvance = done(step);
  /** A step can be jumped to once every step before it that is not skipped is done. */
  const canReach = (i: number) => {
    for (let j = LENGTH_STEP; j < i; j++) if (!skips(j) && !done(j)) return false;
    return !skips(i);
  };

  /** Last name drives the personalized headlines, with a neutral fallback. */
  const surname = customer.lastName.trim();
  const possessive = surname ? `The ${surname} Build` : "Your Build";

  const goTo = useCallback((next: number) => {
    setStep(Math.max(0, Math.min(SUMMARY_STEP, next)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  /* Back and Next. On the modular steps they sit side by side beside the
   * title (owner, 2026-10-27): under a tall viewer they fell below the fold. */
  const onModularStep = modular && MODULAR_STEPS.includes(step);
  const stepNav = (
    <div className={`flex items-center ${onModularStep ? "gap-2" : "justify-between"}`}>
      <button
        onClick={() => goTo(stepFrom(step, -1))}
        className="px-6 py-3 text-sm font-medium text-steel hover:text-navy transition-colors"
      >
        ← Back
      </button>
      {step < SUMMARY_STEP && (
        <button
          onClick={() => goTo(stepFrom(step, 1))}
          disabled={!canAdvance}
          className="px-8 py-3 rounded-full bg-gold text-navy text-sm font-semibold hover:bg-gold-deep transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {step === GALLERY_STEP
            ? "Next: What\u2019s Included"
            : step === INCLUDED_STEP
              ? "Next: Upgrades"
              : step === UPGRADES_STEP
                ? "Next: Build Sheet"
                : "Next"}{" "}
          →
        </button>
      )}
      </div>
  );

  return (
    <CatalogContext.Provider value={catalog}>
    <div className="flex flex-col min-h-screen pb-28">
      <Header />
      {/* The introduction belongs to the first screen. Repeated on every step
          it pushed the 3D views below the fold on a laptop. */}
      {step === LENGTH_STEP && <Hero />}

      {/* Van context and step nav travel together so neither scrolls away. */}
      {/* The stepper shows from the very first screen, because "step 1 of 8" is
          most useful to someone deciding whether to start at all. The van bar
          above it waits until there is a van to name. */}
      <div className="sticky top-0 z-30 shadow-sm">
        {step > LENGTH_STEP && (
          <VanContextBar
            planName={modular ? undefined : plan?.name}
            buildCode={modular ? fullCode(build.layout) : undefined}
            surname={surname}
            van={van}
          />
        )}
        <Stepper
          step={step}
          onJump={goTo}
          canReach={canReach}
          skips={skips}
        />
        {/* Part of the pinned header, so it stays on screen the whole way down
            the long included list instead of scrolling away under the bar. */}
        {step === INCLUDED_STEP && build.floorPlanId && (
          <IncludedNav floorPlanId={build.floorPlanId} vanLengthId={build.vanLengthId} />
        )}
      </div>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-10">
        {step === INTRO_STEP && (
          <StepIntro
            customer={customer}
            vanLengthName={van ? vanLabel(van) : undefined}
            onChange={setCustomer}
            onContinue={() => {
              /* Deliberately not awaited. The buyer moves to the next screen
               * immediately; whether the CRM answers is our problem, not
               * theirs. keepalive so it survives the navigation. */
              if (!leadSent.current && isValidCustomer(customer)) {
                leadSent.current = true;
                fetch("/api/lead", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  keepalive: true,
                  body: JSON.stringify({
                    ...customer,
                    vanLength: van ? vanLabel(van) : undefined,
                  }),
                }).catch(() => {});
              }
              goTo(afterDetails);
            }}
          />
        )}

        {step === LENGTH_STEP && (
          <StepVanLength
            selectedId={build.vanLengthId}
            possessive={possessive}
            onChoose={(id) =>
              setBuild((b) => {
                const next = setVanLength(catalog, b, id);
                /* A modular van has no floor plan step, but the conversion
                 * price still lives on a plan, and every plan costs the same
                 * (owner, 2026-09-28). So it quietly takes the first that fits. */
                if (!isModular(id) || next.floorPlanId) return next;
                const plan = catalog.floorPlans.find((p) => planFitsLength(catalog, p.id, id));
                return plan ? setFloorPlan(next, plan.id) : next;
              })
            }
            /* Details already on file: going back to change the van is not
               a reason to fill the form in again. */
            onContinue={() => goTo(isValidCustomer(customer) ? afterDetails : INTRO_STEP)}
          />
        )}

        {modular && MODULAR_STEPS.includes(step) && (
          <StepModular
            step={step}
            vanId={build.vanLengthId}
            layout={layout}
            possessive={possessive}
            onChange={updateLayout}
            nav={stepNav}
          />
        )}

        {step === PLAN_STEP && (
          <StepFloorPlan
            selectedId={build.floorPlanId}
            vanLengthId={build.vanLengthId}
            possessive={possessive}
            /* No auto-advance: picking a plan unlocks its 3D model on this
               page, and the buyer moves on with Next once they have looked. */
            onSelect={(id) => setBuild((b) => setFloorPlan(b, id))}
          />
        )}

        {step === GALLERY_STEP && plan && (
          <StepGallery plan={plan} onContinue={() => goTo(INCLUDED_STEP)} />
        )}

        {step === INCLUDED_STEP && build.floorPlanId && (
          <StepIncluded floorPlanId={build.floorPlanId} vanLengthId={build.vanLengthId} />
        )}

        {step === UPGRADES_STEP && build.floorPlanId && (
          <StepUpgrades
            selected={build.selected}
            possessive={possessive}
            onToggle={(id) => setBuild((b) => toggleOption(catalog, b, id))}
          />
        )}

        {step === SUMMARY_STEP && plan && (
          <StepSummary
            build={build}
            breakdown={breakdown}
            customer={customer}
            possessive={possessive}
            firstName={customer.firstName.trim()}
          />
        )}

        {step > LENGTH_STEP && !onModularStep && <div className="mt-12">{stepNav}</div>}
      </main>

      <SummaryBar
        breakdown={breakdown}
        planName={(modular ? undefined : plan?.name) ?? (van ? vanLabel(van) : undefined)}
        onGetBuildSheet={() => goTo(SUMMARY_STEP)}
        canFinish={canReach(SUMMARY_STEP)}
        atSummary={step === SUMMARY_STEP}
      />
    </div>
    </CatalogContext.Provider>
  );
}

// ---------------------------------------------------------------------------

function Header() {
  return (
    <header className="bg-white border-b border-line">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        {/* New tab rather than same tab: a half-configured van lives in the
            ?b= URL and in this page's state, and sending someone back to the
            marketing site in place would quietly throw it away. */}
        <a
          href={SITE_URL}
          target="_blank"
          rel="noopener"
          aria-label="Papago Vans home page, opens in a new tab"
          className="inline-block rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
        >
          {/* Served from this app. The old WordPress logo URL died with the
              site's move to Vercel on 2026-10-01 and left a broken image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/papago-wordmark.svg"
            alt="Papago Vans"
            width={174}
            height={27}
            className="h-6 w-auto transition-opacity hover:opacity-70"
          />
        </a>
        <a href="tel:+14807617175" className="text-right leading-tight">
          <span className="block text-xs text-steel">Questions? Call us</span>
          <span className="block text-base font-semibold text-navy">(480) 761-7175</span>
        </a>
      </div>
    </header>
  );
}

/**
 * Compact, information-dense header. The Sprinter itself lives in the sticky
 * context bar, so this space explains what the buyer is actually getting
 * rather than repeating the photo.
 */
const BUILD_FACTS: { value: string; label: string; detail: string }[] = [
  {
    value: "Three Vans",
    label: "Sprinter, Transit, ProMaster",
    detail: "You buy the van direct through our dealers, to keep costs down",
  },
  {
    value: "RVIA Certified",
    label: "Veteran-owned",
    detail: "Meets the standard insurers and campgrounds look for",
  },
  {
    value: "Built to Order",
    label: "Mesa, Arizona",
    detail: "Every van built in-house, start to finish",
  },
  {
    value: "Financing",
    label: "Available",
    detail: "For the van and the build together",
  },
];

function Hero() {
  return (
    <section className="bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-8 sm:pt-12">
        <div className="text-center max-w-2xl mx-auto">
          <h1 className="brand-heading text-4xl sm:text-5xl leading-none">
            Build Your Van
          </h1>
          <p className="mt-4 text-steel">
            Three high-roof vans and four floor plans, with everything
            that comes in the build listed item by item. Your estimated total
            updates as you go.
          </p>
        </div>

        <dl className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5 border-t border-line pt-6">
          {BUILD_FACTS.map((f) => (
            <div key={f.value}>
              <dt className="text-sm font-semibold text-navy leading-tight">{f.value}</dt>
              <dd className="text-sm text-steel mt-0.5">{f.label}</dd>
              <dd className="text-xs text-steel/80 mt-1 leading-snug">{f.detail}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/**
 * Persistent context strip. Keeps three facts on screen at all times: whose
 * build this is, which van it is on, and which layout.
 */
function VanContextBar({
  planName,
  buildCode,
  surname,
  van,
}: {
  planName?: string;
  /** A modular van's code, the line the team quotes on a call. */
  buildCode?: string;
  surname: string;
  van?: VanLength;
}) {
  return (
    <div className="bg-white border-b border-line">
      {/*
        The van overhangs a navy shelf that belongs to this bar rather than to
        the hero above it. Flush under the hero it reads as one header, and the
        overlap survives the bar going sticky instead of clipping at the
        viewport edge.
      */}
      <div className="bg-white h-[29px] sm:h-[37px]" />
      {/* On a phone a long build code takes its own line under the van, rather
          than squeezing the build's name to nothing (owner, 2026-10-27). */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-3 min-w-0">
          {/*
            Twice the old render. The box holds the lower two thirds and the
            image, bottom-anchored, spills its top third onto the shelf.
          */}
          {/* The exact van the buyer picked, the same render as the van step. */}
          <div className="relative w-[132px] sm:w-[168px] h-[59px] sm:h-[75px] shrink-0">
            <Image
              key={van?.id ?? "default"}
              src={van?.image || "/sprinter.webp"}
              alt={van ? vanLabel(van) : "Mercedes-Benz Sprinter"}
              width={168}
              height={107}
              sizes="168px"
              className="absolute bottom-0 left-0 w-full h-auto"
              priority
            />
          </div>
          <div className="min-w-0">
            <p className="brand-heading text-lg sm:text-2xl leading-tight truncate">
              {surname ? `${surname} Build` : "Your Build"}
            </p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-steel">
              Building on
            </p>
            <p className="text-sm sm:text-base font-bold text-navy leading-tight truncate">
              {van ? vanLabel(van) : "Mercedes-Benz Sprinter"}
            </p>
          </div>
        </div>

        <div className="flex gap-6 min-w-0 w-full sm:w-auto sm:shrink-0">
          {buildCode && (
            <div className="sm:text-right min-w-0 sm:max-w-[45vw]">
              <p className="text-[10px] font-bold uppercase tracking-widest text-steel">Build Code</p>
              <p className="font-mono text-xs sm:text-sm text-navy leading-tight break-all">{buildCode}</p>
            </div>
          )}
          {planName && (
            <div className="text-right min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-steel">
                Floor Plan
              </p>
              <p className="brand-heading text-base sm:text-xl leading-tight truncate">
                {planName}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const AUTOCOMPLETE: Record<keyof Customer, string> = {
  firstName: "given-name",
  lastName: "family-name",
  email: "email",
  phone: "tel",
};

/**
 * The details form, which sits after the van choice rather than before it.
 *
 * It names the van they just picked. The point of asking second is that the
 * reader has already committed to something, and the copy only collects on
 * that if it says so out loud.
 */
function StepIntro({
  customer,
  vanLengthName,
  onChange,
  onContinue,
}: {
  customer: Customer;
  vanLengthName?: string;
  onChange: (c: Customer) => void;
  onContinue: () => void;
}) {
  const ready = isValidCustomer(customer);

  const field = (
    key: keyof Customer,
    label: string,
    type = "text",
    placeholder = "",
  ) => (
    <div>
      <label
        htmlFor={key}
        className="block text-xs font-bold uppercase tracking-widest text-steel mb-1"
      >
        {label}
      </label>
      <input
        id={key}
        type={type}
        value={customer[key]}
        placeholder={placeholder}
        autoComplete={AUTOCOMPLETE[key]}
        onChange={(e) => onChange({ ...customer, [key]: e.target.value })}
        className="w-full rounded-md border border-black/15 bg-white px-4 py-3 text-charcoal outline-none focus:border-sky focus:ring-2 focus:ring-sky/30"
      />
    </div>
  );

  return (
    <section className="max-w-xl mx-auto">
      <div className="text-center mb-8">
        <p className="text-xs font-bold uppercase tracking-widest text-sky">
          {vanLengthName ? `${vanLengthName} · Reserved for you` : "Let\u2019s get started"}
        </p>
        <h2 className="brand-heading text-3xl mt-1">Who Are We Building For?</h2>
        <p className="mt-2 text-steel">
          Your van is picked. Tell us who it is for and we will keep your Build
          Sheet as you go, so nothing is lost if you come back to it later.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) onContinue();
        }}
        className="bg-white rounded-lg p-6 sm:p-8 space-y-5"
      >
        <div className="grid sm:grid-cols-2 gap-5">
          {field("firstName", "First Name")}
          {field("lastName", "Last Name")}
        </div>
        {field("email", "Email", "email", "where should we send your build sheet?")}
        {field("phone", "Phone", "tel", "(480) 555-0134")}

        <button
          type="submit"
          disabled={!ready}
          className="w-full px-8 py-4 rounded-full bg-gold text-navy text-sm font-semibold hover:bg-gold-deep transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Start My Build →
        </button>

        <button
          type="button"
          onClick={onContinue}
          className="w-full text-xs uppercase tracking-widest text-steel hover:text-navy transition-colors"
        >
          Skip for now
        </button>
      </form>
    </section>
  );
}

function Stepper({
  step,
  onJump,
  canReach,
  skips,
}: {
  step: number;
  onJump: (n: number) => void;
  canReach: (i: number) => boolean;
  skips: (i: number) => boolean;
}) {
  const labels = [
    "Your Van",
    "Your Info",
    "Bed",
    "Driver Side",
    "Passenger Side",
    "Extras",
    "Floor Plan",
    "Layout",
    "What\u2019s Included",
    "Upgrades",
    "Build Sheet",
  ];

  /* A progress count beats a row of pills on its own: a buyer scanning a
   * configurator wants to know how much is left, not what the stages are
   * called. The nudges start where the finish is genuinely in sight, which is
   * also where people abandon. Nothing before step 6 gets one, because
   * cheerleading at step 2 is a lie about how far along you are. */
  // Steps this van skips are neither counted nor shown.
  const shown = labels.map((label, i) => ({ label, i })).filter(({ i }) => !skips(i));
  const total = shown.length;
  const position = shown.findIndex(({ i }) => i === step) + 1;
  const nudge: Record<number, string> = {
    [INCLUDED_STEP]: "almost there",
    [SUMMARY_STEP]: "that\u2019s the whole van",
  };

  return (
    <nav
      aria-label="Build steps"
      className="bg-white border-b border-line"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center gap-5">
        <p className="shrink-0 py-3 leading-tight">
          <span className="brand-heading block text-base sm:text-lg text-navy whitespace-nowrap">
            Step {position} of {total}
          </span>
          {nudge[step] && (
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-steel">
              {nudge[step]}
            </span>
          )}
        </p>
        <ol className="flex gap-1 overflow-x-auto py-3 text-xs">
          {shown.map(({ label, i }) => {
            const isCurrent = i === step;
            const reachable = i <= INTRO_STEP || canReach(i);
            return (
              <li key={label} className="shrink-0">
                <button
                  onClick={() => reachable && onJump(i)}
                  disabled={!reachable}
                  aria-current={isCurrent ? "step" : undefined}
                  className={`px-3 py-1.5 rounded-full whitespace-nowrap font-medium transition-colors ${
                    isCurrent
                      ? "bg-navy text-white"
                      : reachable
                        ? "text-steel hover:bg-offwhite"
                        : "text-black/25 cursor-not-allowed"
                  }`}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}

/**
 * Step one: which van. Three makes, each in its real wheelbases plus its
 * extended body (owner, 2026-10-30), every card carrying its van price.
 *
 * Choosing sets the van; Continue advances. Those are deliberately separate,
 * so a buyer can click between vans and watch the render change.
 */
function StepVanLength({
  selectedId,
  possessive,
  onChoose,
  onContinue,
}: {
  selectedId: string | null;
  possessive: string;
  onChoose: (id: string) => void;
  onContinue: () => void;
}) {
  const catalog = useCatalog();
  const active = getVanLength(catalog, selectedId ?? "") ?? catalog.vanLengths[0];

  return (
    <section>
      <StepHeading
        eyebrow={possessive}
        title="Choose Your Van"
        blurb="We build on the Mercedes-Benz Sprinter, Ford Transit and Ram ProMaster. Pick the van, then how long it is."
      />

      {/* One stage, the chosen van's render. Makes without renders yet show
          their name instead of borrowing another maker's van. */}
      <div className="relative w-full max-w-[720px] mx-auto aspect-[903/576] bg-offwhite rounded-lg overflow-hidden">
        {catalog.vanLengths.filter((v) => v.image).map((v) => (
          <Image
            key={v.id}
            src={v.image}
            alt={vanLabel(v)}
            fill
            priority={v.id === active?.id}
            sizes="(max-width: 1024px) 100vw, 900px"
            /* Inline rather than a Tailwind opacity utility: next/image writes
             * its own style attribute for `fill`, and that inline style wins
             * over the class, so the wrong van stayed visible. */
            style={{ opacity: v.id === active?.id ? 1 : 0 }}
            className="object-contain transition-opacity duration-500"
          />
        ))}
        {active && !active.image && (
          <div className="absolute inset-0 grid place-items-center text-center px-6">
            <p className="brand-heading text-2xl sm:text-3xl text-navy">{vanLabel(active)}</p>
          </div>
        )}
      </div>

      <div className="mt-8 space-y-6">
        {VAN_MAKES.map((make) => {
          const vans = catalog.vanLengths.filter((v) => v.make === make.id);
          if (vans.length === 0) return null;
          return (
            <div key={make.id}>
              <h3 className="text-xs font-bold uppercase tracking-widest text-steel mb-2">{make.name}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {vans.map((v) => {
                  const isSelected = v.id === selectedId;
                  return (
                    <button
                      key={v.id}
                      onClick={() => onChoose(v.id)}
                      aria-pressed={isSelected}
                      className={`text-left bg-white rounded-lg p-5 border-2 transition-all hover:shadow-lg ${
                        isSelected ? "border-gold shadow-lg" : "border-black/10 hover:border-sky/40"
                      }`}
                    >
                      <p className="text-2xl font-extrabold text-navy leading-none">
                        {v.wheelbase}&quot;
                        <span className="ml-2 text-xs font-bold uppercase tracking-widest text-steel">
                          {v.extended ? "extended" : "wheelbase"}
                        </span>
                      </p>
                      <h4 className="brand-heading text-lg mt-2">{v.name}</h4>
                      <p className="mt-1 text-sm text-steel">{v.tagline}</p>
                      <p className="mt-3 text-sm font-semibold text-navy">
                        {formatPrice(v.vanPrice)} <span className="font-normal text-steel">van, average</span>
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-sm text-steel max-w-3xl">{VAN_NOTE}</p>

      <div className="mt-8 flex justify-end">
        <button
          onClick={onContinue}
          disabled={!selectedId}
          className="px-8 py-3 rounded-full bg-gold text-navy text-sm font-semibold hover:bg-gold-deep transition-colors disabled:opacity-40"
        >
          Continue →
        </button>
      </div>
    </section>
  );
}

/* The slice of model-viewer's element API the modular steps drive. */
type LineupViewerElement = HTMLElement & {
  appendAnimation(name: string, options?: { repetitions?: number; timeScale?: number }): void;
  detachAnimation(name: string, options?: { fade?: boolean }): void;
  updateHotspot(config: { name: string; position: string }): void;
};

/* The garage slide-out's two trays, each opened by its own dot (owner,
 * 2026-10-27). Positions are the model's, printed by modular-models: each
 * tray's rear edge and top, and how far "SS01-<n>-open" slides it. */
const TRAYS = [
  { n: 1, z: -1.637 },
  { n: 2, z: -1.129 },
];
const TRAY_DOT = { x: 0.13, y: 0.21, slide: 1.084, seconds: 2.4 };
const trayDot = (z: number, out: number) => `${TRAY_DOT.x - TRAY_DOT.slide * out}m ${TRAY_DOT.y}m ${z}m`;

/**
 * The van, built up piece by piece. Every piece has a "<code>-in" and a
 * "<code>-out" animation baked into the model (scripts/modular-models.ts),
 * and model-viewer runs several at once, so this only compares what should be
 * in the van with what is and plays the difference. A finished clip holds its
 * piece in place; the other clip is stopped before one starts, so the two
 * never blend. The camera turns to face the side the step is about.
 */
function LineupStage({ vanId, codes, orbit }: { vanId: string | null; codes: string[]; orbit: string }) {
  const viewer = useRef<LineupViewerElement>(null);
  const [loaded, setLoaded] = useState(false);
  const shown = useRef(new Set<string>());
  const placed = useRef(false);
  const key = codes.join(",");
  const [open, setOpen] = useState<number[]>([]);
  const garage = loaded && codes.includes("SS01");

  useEffect(() => {
    const el = viewer.current;
    if (!el) return;
    const onLoad = () => setLoaded(true);
    el.addEventListener("load", onLoad);
    return () => el.removeEventListener("load", onLoad);
  }, []);

  useEffect(() => {
    const el = viewer.current;
    if (!el || !loaded) return;
    // Whatever was chosen before the model loaded (a shared link, a return
    // visit) is simply there; so is everything for anyone who asked their
    // device for less motion.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timeScale = !placed.current || reduce ? 40 : 1;
    placed.current = true;
    const want = new Set(key ? key.split(",") : []);
    for (const c of want)
      if (!shown.current.has(c)) {
        el.detachAnimation(`${c}-out`, { fade: false });
        el.appendAnimation(`${c}-in`, { repetitions: 1, timeScale });
      }
    for (const c of shown.current)
      if (!want.has(c)) {
        el.detachAnimation(`${c}-in`, { fade: false });
        el.appendAnimation(`${c}-out`, { repetitions: 1, timeScale });
      }
    shown.current = want;
    // A slide-out that leaves the van goes home with it, so it comes back shut.
    if (!want.has("SS01"))
      setOpen((o) => {
        for (const n of o) {
          el.detachAnimation(`SS01-${n}-open`, { fade: false });
          el.appendAnimation(`SS01-${n}-close`, { repetitions: 1, timeScale: 40 });
        }
        return [];
      });
  }, [key, loaded]);

  /** Slides one tray out or back, and walks its dot along with it. */
  function toggleTray(n: number, z: number) {
    const el = viewer.current;
    if (!el) return;
    const opening = !open.includes(n);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.detachAnimation(`SS01-${n}-${opening ? "close" : "open"}`, { fade: false });
    el.appendAnimation(`SS01-${n}-${opening ? "open" : "close"}`, { repetitions: 1, timeScale: reduce ? 40 : 1 });
    setOpen((o) => (opening ? [...o, n] : o.filter((x) => x !== n)));
    const start = performance.now();
    const ms = reduce ? 0 : TRAY_DOT.seconds * 1000;
    const ease = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2); // the clip's own curve
    const step = (now: number) => {
      const t = ms ? Math.min(1, (now - start) / ms) : 1;
      const out = opening ? ease(t) : 1 - ease(t);
      el.updateHotspot({ name: `hotspot-tray-${n}`, position: trayDot(z, out) });
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  return (
    /* Square for the most room to look around (owner, 2026-10-27), but never
     * taller than the screen leaves under the header and the price bar. */
    <div className="relative aspect-square max-h-[calc(100svh-15rem)] w-full rounded-2xl overflow-hidden bg-offwhite">
      <Script type="module" src={MODEL_VIEWER_SRC} strategy="afterInteractive" />
      <model-viewer
        ref={viewer}
        src={lineupModelFor(vanId)}
        alt="Your van, built up as you choose"
        camera-orbit={orbit}
        /* The scroll wheel zooms (owner, 2026-10-12). The viewer's default
           closest distance is this framing itself, which would block zooming
           in, so allow down to 1.5 m. */
        min-camera-orbit="auto auto 1.5m"
        max-camera-orbit="auto 88deg 16m"
        camera-controls=""
        touch-action="pan-y"
        interaction-prompt="none"
        shadow-intensity="1.2"
        shadow-softness="0.6"
        exposure="0.9"
        environment-image={STUDIO_LIGHT}
        style={{ width: "100%", height: "100%" }}
      >
        {garage &&
          TRAYS.map(({ n, z }) => (
            <button
              key={n}
              type="button"
              slot={`hotspot-tray-${n}`}
              data-position={trayDot(z, open.includes(n) ? 1 : 0)}
              data-normal="0m 1m 0m"
              aria-label={`${open.includes(n) ? "Slide in" : "Slide out"} garage tray ${n}`}
              aria-pressed={open.includes(n)}
              onClick={() => toggleTray(n, z)}
              className="relative grid place-items-center h-7 w-7 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy rounded-full"
            >
              <span aria-hidden="true" className="absolute h-4 w-4 rounded-full bg-gold opacity-75 motion-safe:animate-ping" />
              <span aria-hidden="true" className="relative h-3.5 w-3.5 rounded-full bg-gold ring-2 ring-white shadow" />
            </button>
          ))}
      </model-viewer>
    </div>
  );
}

/* How to drive the 3D view, under it. Mouse wording by default; a touch
 * screen gets the finger gestures, since it has no wheel or right button. */
function ViewerLegend() {
  const touch = useSyncExternalStore(
    (change) => {
      const q = window.matchMedia("(pointer: coarse)");
      q.addEventListener("change", change);
      return () => q.removeEventListener("change", change);
    },
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false, // server render: mouse wording, corrected on the client
  );
  const items = touch
    ? [
        { icon: "drag", text: "Drag to turn" },
        { icon: "zoom", text: "Pinch to zoom" },
        { icon: "move", text: "Two fingers to move" },
      ]
    : [
        { icon: "drag", text: "Click and drag to turn" },
        { icon: "zoom", text: "Scroll wheel to zoom" },
        { icon: "move", text: "Right-click and drag to move" },
      ];
  return (
    <ul aria-label="How to use the 3D view" className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-steel">
      {items.map((it) => (
        <li key={it.icon} className="flex items-center gap-2">
          <LegendIcon kind={it.icon} />
          {it.text}
        </li>
      ))}
    </ul>
  );
}

function LegendIcon({ kind }: { kind: string }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  if (kind === "zoom")
    return (
      <svg {...common}>
        <rect x="7" y="3" width="10" height="17" rx="5" />
        <path d="M12 6.5v3" strokeWidth={2.2} />
      </svg>
    );
  if (kind === "move")
    return (
      <svg {...common}>
        <path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v4.5h-4.5" />
    </svg>
  );
}

/* Where the camera sits for each modular step: behind for the bed, across
 * the aisle for the driver side, and from the cab for the passenger side,
 * where looking across the aisle the driver-side cabinets would block it. */
const STAGE_ORBIT: Record<number, string> = {
  [BED_STEP]: "-40deg 64deg 70%",
  [DRIVER_STEP]: "-20deg 52deg 75%",
  [PASSENGER_STEP]: "115deg 55deg 60%",
  [EXTRAS_STEP]: "-40deg 55deg 75%",
};

/**
 * Upgrades: yes-or-no extras with their prices. Picking one that needs
 * another (the winch needs the bumper) adds both, and dropping the base drops
 * what hangs off it; toggleOption() does that, so this only lists and asks.
 */
function StepUpgrades({
  selected,
  possessive,
  onToggle,
}: {
  selected: string[];
  possessive: string;
  onToggle: (id: string) => void;
}) {
  const catalog = useCatalog();
  const upgrades = catalog.options.filter((o) => o.categoryId === UPGRADES_CATEGORY_ID);
  return (
    <section>
      <StepHeading
        eyebrow={possessive}
        title="Add Upgrades"
        blurb="All optional. Pick what you want on top of the build; the total updates as you go."
      />
      <p className="-mt-4 mb-6 text-xs font-semibold uppercase tracking-widest text-steel">
        Placeholder prices
      </p>
      <ul aria-label="Upgrades" className="max-w-3xl divide-y divide-line border-y border-line">
        {upgrades.map((o) => {
          const on = selected.includes(o.id);
          const needs = (o.requires ?? []).map((id) => getOption(catalog, id)?.name).filter(Boolean);
          return (
            <li key={o.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => onToggle(o.id)}
                className={`group w-full text-left flex gap-4 px-3 py-4 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${
                  on ? "bg-white" : "hover:bg-white/60"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-3.5 w-3.5 shrink-0 rounded border transition-colors ${
                    on ? "border-gold bg-gold" : "border-steel/40 group-hover:border-steel"
                  }`}
                />
                <span className="relative hidden sm:block w-28 aspect-[4/3] shrink-0 rounded-md overflow-hidden bg-offwhite">
                  {o.thumb && <Image src={o.thumb} alt="" fill sizes="112px" className="object-cover" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="brand-heading text-lg leading-tight">{o.name}</span>
                    <span className="text-sm font-semibold text-navy shrink-0">+{formatPrice(o.price)}</span>
                  </span>
                  {(o.manufacturer || o.model) && (
                    <span className="block mt-0.5 text-xs text-steel">{[o.manufacturer, o.model].filter(Boolean).join(" ")}</span>
                  )}
                  <span className="block mt-1 text-sm text-charcoal">{o.whatItIs}</span>
                  {needs.length > 0 && (
                    <span className="block mt-1 text-xs text-steel">Needs the {needs.join(", ")}, added with it</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Which wizard phase each piece belongs to, for the Show toggles. */
const PHASES = ["Bed", "Driver Side", "Passenger Side", "Extras"];
const PHASE_OF: Record<string, string> = {
  BC01: "Bed", BC02: "Bed",
  SHY: "Driver Side", SHN: "Driver Side",
  LRSH01: "Driver Side", LRSH02: "Driver Side", LRNSH01: "Driver Side", LRNSH02: "Driver Side",
  PK01: "Passenger Side", FT01: "Passenger Side",
  PI01: "Passenger Side", PI02: "Passenger Side", PU01: "Passenger Side", PU02: "Passenger Side",
  SC01: "Extras", OC01: "Extras", SS01: "Extras", ST01: "Extras", CB01: "Extras", OHS1: "Extras",
};

/** The pieces in the van at a step: the choices so far, plus the standard
 * kitchen once the passenger side is the subject or has been chosen (so a
 * restored link never shows uppers floating over nothing). Every bed is
 * part of the chassis model (the Trailhead stands in for all five until the
 * others are drawn), so no bed has a piece of its own. */
function stageCodes(layout: Layout, step: number) {
  const picked = SLOTS.map((s) => layout.picks[s.id]).filter((c): c is string => !!c && !c.startsWith("BD"));
  const kitchen = step >= PASSENGER_STEP || layout.picks.PI || layout.picks.PU;
  return [...picked, ...(kitchen ? STANDARD : []), ...layout.extras];
}

/**
 * The four modular steps (owner, 2026-10-26): bed, driver side, passenger
 * side, add-ons. One component for all four so the 3D view stays mounted
 * between them and the van keeps building rather than reloading each step.
 */
function StepModular({
  step,
  vanId,
  layout,
  possessive,
  onChange,
  nav,
}: {
  step: number;
  vanId: string | null;
  layout: Layout;
  possessive: string;
  onChange: (change: (l: Layout) => Layout) => void;
  nav: React.ReactNode;
}) {
  const choose = (id: Slot["id"]) => (code: string) => onChange((l) => pick(l, id, code));
  const heading = {
    [BED_STEP]: {
      title: "Choose Your Bed Cap",
      blurb: "The bed sets the shape of the van. Pick the panel that closes its front.",
    },
    [DRIVER_STEP]: {
      title: "Choose Your Driver Side",
      blurb: "Shower or no shower first. It decides which living rooms fit beside it.",
    },
    [PASSENGER_STEP]: {
      title: "Choose Your Passenger Side",
      blurb: "The kitchenette and its fold-out table come on every van. Pick what goes under the counter and above it.",
    },
    [EXTRAS_STEP]: {
      title: "Add the Extras",
      blurb: "Each one is a simple yes or no. Leave them all off if you like.",
    },
  }[step]!;
  const living = livingRoomsFor(layout);
  /* Phases switched off in the 3D view, so a buyer can look at one part of
   * the van on its own (owner, 2026-10-26). View only: the build keeps them. */
  const [hidden, setHidden] = useState<string[]>([]);
  const codes = stageCodes(layout, step).filter((c) => !hidden.includes(PHASE_OF[c] ?? ""));

  return (
    <section>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <StepHeading eyebrow={possessive} title={heading.title} blurb={heading.blurb} className="" />
        <div className="shrink-0 lg:pt-4">{nav}</div>
      </div>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start">
        <div className="lg:sticky lg:top-44">
          <div role="group" aria-label="Show in the 3D view" className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-steel mr-1">Show:</span>
            {PHASES.map((phase) => {
              const on = !hidden.includes(phase);
              return (
                <button
                  key={phase}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setHidden((h) => (on ? [...h, phase] : h.filter((x) => x !== phase)))}
                  className={`px-3 py-1 rounded-full border font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${
                    on ? "bg-navy border-navy text-white" : "border-steel/30 text-steel hover:border-steel"
                  }`}
                >
                  {phase}
                </button>
              );
            })}
          </div>
          <LineupStage vanId={vanId} codes={codes} orbit={STAGE_ORBIT[step]} />
          <ViewerLegend />
        </div>

        <div className="space-y-8">
          {step === BED_STEP && (
            <>
              <Choices label="Bed" pieces={slot("BD").pieces} selected={layout.picks.BD} onSelect={choose("BD")} />
              {layout.picks.BD !== "BD01" && (
                <p className="text-sm text-steel">The 3D view shows The Trailhead until this bed is drawn.</p>
              )}
              <Choices label="Bed Cap" pieces={slot("BC").pieces} selected={layout.picks.BC} onSelect={choose("BC")} />
            </>
          )}
          {step === DRIVER_STEP && (
            <>
              <Choices label="Shower" pieces={slot("SH").pieces} selected={layout.picks.SH} onSelect={choose("SH")} />
              {living.length ? (
                <Choices label="Living Room" pieces={living} selected={layout.picks.LR} onSelect={choose("LR")} />
              ) : (
                <p className="text-sm text-steel">Choose shower or no shower to see the living rooms that fit.</p>
              )}
            </>
          )}
          {step === PASSENGER_STEP && (
            <>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-steel mb-2">Comes Standard</h3>
                <ul aria-label="Comes standard" className="divide-y divide-line border-y border-line">
                  {STANDARD_PIECES.map((piece) => (
                    <li key={piece.code} className="px-3 py-4 bg-white">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="brand-heading text-lg leading-tight">{piece.name}</span>
                        <span className="font-mono text-[11px] text-steel">{piece.code}</span>
                      </span>
                      <span className="block mt-1 text-sm text-charcoal">{piece.note}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <Choices label="Kitchenette Insert" pieces={slot("PI").pieces} selected={layout.picks.PI} onSelect={choose("PI")} />
              <Choices label="Kitchen Uppers" pieces={slot("PU").pieces} selected={layout.picks.PU} onSelect={choose("PU")} />
            </>
          )}
          {step === EXTRAS_STEP && (
            <ul aria-label="Extras" className="divide-y divide-line border-y border-line">
              {EXTRAS.map((piece) => {
                const on = layout.extras.includes(piece.code);
                return (
                  <li key={piece.code}>
                    <ChoiceRow piece={piece} on={on} role="checkbox" onClick={() => onChange((l) => toggleExtra(l, piece.code))} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

/** A pick-one list under a small heading. */
function Choices({
  label,
  pieces,
  selected,
  onSelect,
}: {
  label: string;
  pieces: Piece[];
  selected?: string;
  onSelect: (code: string) => void;
}) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-widest text-steel mb-2">{label}</h3>
      <ul role="radiogroup" aria-label={label} className="divide-y divide-line border-y border-line">
        {pieces.map((piece) => (
          <li key={piece.code}>
            <ChoiceRow piece={piece} on={piece.code === selected} role="radio" onClick={() => onSelect(piece.code)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChoiceRow({
  piece,
  on,
  role,
  onClick,
}: {
  piece: Piece;
  on: boolean;
  role: "radio" | "checkbox";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={on}
      onClick={onClick}
      className={`group w-full text-left flex gap-4 px-3 py-4 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold ${
        on ? "bg-white" : "hover:bg-white/60"
      }`}
    >
      <span
        aria-hidden="true"
        className={`mt-1.5 h-3.5 w-3.5 shrink-0 border transition-colors ${role === "radio" ? "rounded-full" : "rounded"} ${
          on ? "border-gold bg-gold" : "border-steel/40 group-hover:border-steel"
        }`}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="brand-heading text-lg leading-tight">{piece.name}</span>
          <span className="font-mono text-[11px] text-steel">{piece.code}</span>
        </span>
        <span className="block mt-1 text-sm text-charcoal">{piece.note}</span>
      </span>
    </button>
  );
}

function StepFloorPlan({
  selectedId,
  vanLengthId,
  possessive,
  onSelect,
}: {
  selectedId: string | null;
  vanLengthId: string | null;
  possessive: string;
  onSelect: (id: string) => void;
}) {
  const catalog = useCatalog();
  /* Only the plans the shop builds on this chassis. A plan with no lengths set
   * fits all of them, so an unconfigured catalog shows everything rather than
   * nothing. */
  const plans = vanLengthId
    ? catalog.floorPlans.filter((p) => planFitsLength(catalog, p.id, vanLengthId))
    : catalog.floorPlans;
  const chosenVan = vanLengthId ? getVanLength(catalog, vanLengthId) : undefined;
  /* The conversion on this van plus the van itself, so the card matches the
     total the buyer sees from here on. */
  const lengthDelta = (chosenVan?.priceDelta ?? 0) + (chosenVan?.vanPrice ?? 0);
  return (
    <section>
      <Script type="module" src={MODEL_VIEWER_SRC} strategy="afterInteractive" />
      <StepHeading
        eyebrow={possessive}
        title="Choose Your Floor Plan"
        blurb="Four layouts, each built to order on the van you picked. Pick the one that fits how you travel."
      />
      {/* Two by two: four plans, each big enough to read the 3D model. */}
      <div className="grid gap-6 sm:grid-cols-2">
        {plans.map((plan) => {
          const isSelected = plan.id === selectedId;
          return (
            <div
              key={plan.id}
              className={`group bg-white rounded-lg overflow-hidden border-2 transition-all hover:shadow-lg ${
                isSelected
                  ? "border-gold shadow-lg"
                  : "border-transparent hover:border-sky/40"
              }`}
            >
              {/* Static until chosen, then the buyer can turn it. The card is
                  not one big <button> because a draggable viewer inside a
                  button is invalid and every drag would also fire a click. */}
              <div className="relative aspect-[16/10] bg-offwhite">
                <model-viewer
                  src={plan.model ?? FLOOR_PLAN_MODEL}
                  alt={`${plan.name} 3D layout`}
                  camera-orbit="35deg 65deg 70%"
                  max-camera-orbit="auto 88deg auto"
                  camera-controls={isSelected ? "" : undefined}
                  interaction-prompt={isSelected ? "auto" : "none"}
                  disable-zoom=""
                  touch-action="pan-y"
                  shadow-intensity="1.5"
                  shadow-softness="0.4"
                  exposure="0.9"
                  environment-image={STUDIO_LIGHT}
                  style={{ width: "100%", height: "100%" }}
                />
                {!isSelected && (
                  <button
                    onClick={() => onSelect(plan.id)}
                    aria-label={`Choose ${plan.name}`}
                    className="absolute inset-0 cursor-pointer"
                  />
                )}
              </div>
              <button
                onClick={() => onSelect(plan.id)}
                aria-pressed={isSelected}
                className="block w-full text-left p-5"
              >
                <h3 className="brand-heading text-xl">{plan.name}</h3>
                <p className="mt-1 text-sm text-steel min-h-10">{plan.tagline}</p>
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-steel">
                  {plan.specs.map((s) => (
                    <span key={s.label}>
                      <strong className="text-charcoal">{s.value}</strong> {s.label}
                    </span>
                  ))}
                </div>
                <p className="mt-4 text-sm font-bold text-navy">
                  {formatPrice(plan.basePrice + lengthDelta)}
                </p>
                <p className="text-xs text-steel">Van and conversion</p>
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-sm text-steel max-w-3xl">{VAN_NOTE}</p>
    </section>
  );
}

/* On-screen arrows, for phones and tablets with no keyboard. Hold to keep
 * walking: one step every 60ms while the pointer is down. */
function WalkPad({ onStep }: { onStep: (forward: number, turn: number) => void }) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  const hold = (forward: number, turn: number, label: string, glyph: string, cls: string) => (
    <button
      type="button"
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        stop();
        onStep(forward, turn);
        timer.current = setInterval(() => onStep(forward, turn), 60);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      className={`${cls} grid place-content-center w-10 h-10 rounded-md bg-navy/85 text-white text-lg select-none touch-none hover:bg-navy`}
    >
      {glyph}
    </button>
  );
  return (
    <div className="absolute right-4 bottom-4 grid grid-cols-3 grid-rows-2 gap-1">
      {hold(1, 0, "Walk forward", "\u2191", "col-start-2")}
      {hold(0, 1, "Turn left", "\u2190", "col-start-1 row-start-2")}
      {hold(-1, 0, "Walk back", "\u2193", "col-start-2 row-start-2")}
      {hold(0, -1, "Turn right", "\u2192", "col-start-3 row-start-2")}
    </div>
  );
}

function StepGallery({
  plan,
  onContinue,
}: {
  plan: FloorPlan;
  onContinue: () => void;
}) {
  const viewer = useRef<ModelViewerElement>(null);
  const [walking, setWalking] = useState(false);
  /* Where the walker is heading, kept here rather than read off the viewer:
   * the viewer glides toward each new pose, so reading it mid-glide loses
   * part of every step when a key is held. Radians. */
  const pose = useRef({ x: 0, z: 0, heading: 0, phi: Math.PI / 2 });
  const model = plan.model ?? FLOOR_PLAN_MODEL;
  const [map, setMap] = useState<WalkMap | null>(null);
  useEffect(() => {
    let live = true;
    loadWalkMap(model).then((m) => { if (live) setMap(m); });
    return () => { live = false; };
  }, [model]);

  /* The camera sits a centimetre behind its target, so orbiting the target
   * is turning your head, and moving the target is walking. */
  const place = useCallback(() => {
    const el = viewer.current;
    if (!el || !map) return;
    const { x, z, heading, phi } = pose.current;
    el.cameraTarget = `${x}m ${map.eye}m ${z}m`;
    el.cameraOrbit = `${heading}rad ${phi}rad 0.01m`;
  }, [map]);

  const walk = useCallback((forward: number, turn: number) => {
    const p = pose.current;
    if (!map) return;
    p.heading += (turn * WALK.turnDeg * Math.PI) / 180;
    // The camera looks from its orbit position toward the target, so
    // "forward" points away from where the orbit angle puts the camera.
    const dx = -Math.sin(p.heading) * forward * WALK.step;
    const dz = -Math.cos(p.heading) * forward * WALK.step;
    // Blocked head-on, slide along whatever is in the way rather than stop dead.
    if (map.open(p.x + dx, p.z + dz)) { p.x += dx; p.z += dz; }
    else if (map.open(p.x + dx, p.z)) p.x += dx;
    else if (map.open(p.x, p.z + dz)) p.z += dz;
    place();
  }, [place, map]);

  /* Dragging to look around changes the heading; pick it up so the next
   * step goes where the buyer is now facing. */
  useEffect(() => {
    const el = viewer.current;
    if (!el || !walking) return;
    const onChange = (e: Event) => {
      if ((e as CustomEvent<{ source: string }>).detail.source !== "user-interaction") return;
      const { theta, phi } = el.getCameraOrbit();
      pose.current.heading = theta;
      pose.current.phi = phi;
    };
    el.addEventListener("camera-change", onChange);
    return () => el.removeEventListener("camera-change", onChange);
  }, [walking]);

  const enterWalk = () => {
    if (!map) return;
    const [x, z] = map.start;
    pose.current = { x, z, heading: (map.heading * Math.PI) / 180, phi: (WALK.gaze * Math.PI) / 180 };
    setWalking(true);
  };
  // After the render that loosens the orbit limits, or the viewer clamps
  // the starting pose to the orbit view's limits.
  useEffect(() => {
    if (walking) place();
  }, [walking, place]);

  const exitWalk = useCallback(() => {
    const el = viewer.current;
    if (el) {
      el.cameraTarget = "auto auto auto";
      el.cameraOrbit = "35deg 65deg 70%";
    }
    setWalking(false);
  }, []);

  /* Capture phase, so the arrows reach us before the viewer's own orbit
   * keys and before the page scrolls. Only while walking. */
  useEffect(() => {
    if (!walking) return;
    const keys: Record<string, [number, number]> = {
      ArrowUp: [1, 0], w: [1, 0], ArrowDown: [-1, 0], s: [-1, 0],
      ArrowLeft: [0, 1], a: [0, 1], ArrowRight: [0, -1], d: [0, -1],
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return exitWalk();
      const k = keys[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (!k) return;
      e.preventDefault();
      e.stopPropagation();
      walk(...k);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [walking, walk, exitWalk]);

  return (
    <section>
      <Script type="module" src={MODEL_VIEWER_SRC} strategy="afterInteractive" />
      <StepHeading
        eyebrow="Layout"
        title={`Explore the ${plan.name}`}
        blurb="Take a closer look at the layout from every angle, then see everything that comes in it."
      />

      {/* One model the buyer turns, in place of the eight fixed views. The
          gallery stays in the catalog, unused by the storefront, until the
          shop decides it is not needed. */}
      <div className="relative aspect-[2/1] bg-offwhite rounded-lg overflow-hidden">
        <model-viewer
          ref={viewer}
          src={model}
          alt={`${plan.name} 3D layout`}
          camera-orbit="35deg 65deg 70%"
          /* Walking: head turns all the way round and tilts up and down, the
             distance is pinned at a centimetre, and scroll-zoom is off so it
             cannot pull the camera out of your head. */
          min-camera-orbit={walking ? "-Infinity 35deg 0.01m" : "auto auto auto"}
          max-camera-orbit={walking ? "Infinity 145deg 0.01m" : "auto 88deg auto"}
          field-of-view={walking ? "70deg" : "auto"}
          disable-zoom={walking ? "" : undefined}
          camera-controls=""
          touch-action="pan-y"
          shadow-intensity="1.5"
          shadow-softness="0.4"
          exposure="0.9"
          environment-image={STUDIO_LIGHT}
          style={{ width: "100%", height: "100%" }}
        />
        <span className="pointer-events-none absolute left-4 bottom-4 px-3 py-1 rounded-full bg-navy/85 text-white text-xs font-bold uppercase tracking-widest">
          {walking ? (
            <>Drag to look<span className="hidden sm:inline"> · Arrows to walk · Esc to exit</span></>
          ) : (
            "Drag to rotate · Scroll to zoom"
          )}
        </span>
        {map && <button
          type="button"
          onClick={walking ? exitWalk : enterWalk}
          className="absolute right-4 top-4 px-4 py-2 rounded-full bg-gold text-navy text-xs font-bold uppercase tracking-widest shadow hover:bg-gold-deep transition-colors"
        >
          {walking ? "Exit walk-through" : "Walk inside"}
        </button>}
        {walking && <WalkPad onStep={walk} />}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {plan.specs.map((s) => (
          <div key={s.label} className="bg-white rounded-lg p-5 text-center">
            <p className="text-2xl font-extrabold text-navy">{s.value}</p>
            <p className="text-xs uppercase tracking-widest text-steel mt-1">
              {s.label}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8 flex justify-center">
        <button
          onClick={onContinue}
          className="px-10 py-4 rounded-full bg-gold text-navy text-sm font-semibold hover:bg-gold-deep transition-colors"
        >
          See What’s Included →
        </button>
      </div>
    </section>
  );
}

/**
 * One glyph per category, drawn inline so the package comparison needs no
 * icon dependency. 24x24 stroke paths, sized by the caller.
 */
const CATEGORY_ICON_PATHS: Record<string, string> = {
  electricity: "M13 2 4 14h6l-1 8 9-12h-6l1-8Z",
  plumbing: "M12 2.7s5.5 5.6 5.5 10a5.5 5.5 0 0 1-11 0c0-4.4 5.5-10 5.5-10Z",
  climate:
    "M10 14.8V5a2 2 0 1 1 4 0v9.8a4 4 0 1 1-4 0Z M12 17.5v.01",
  kitchen: "M6 2v9a2 2 0 0 0 2 2v9 M6 6h4 M10 2v9 M18 2c-1.5 2-2 4-2 6s.5 3 2 3v11",
  aesthetic:
    "M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.6-.2-1-.6-1.4-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h1.6A4.5 4.5 0 0 0 21 9.8C21 6 16.9 3 12 3Z",
  storage: "M3 7h18v13H3z M3 7l2-4h14l2 4 M9 12h6",
  sleeping: "M3 18v-6h18v6 M3 12V7 M21 18v2 M3 18v2 M7 12V9h4v3",
  exterior: "M2 19h20 M4 19 10 7l3.5 6.5L16 10l4 9",
  misc: "M6 12h.01 M12 12h.01 M18 12h.01",
};

function CategoryIcon({
  categoryId,
  className = "",
}: {
  categoryId: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {CATEGORY_ICON_PATHS[categoryId]
        ?.split(" M")
        .map((seg, i) => (
          <path key={i} d={i === 0 ? seg : `M${seg}`} />
        ))}
    </svg>
  );
}

/** Which categories a package actually touches, for the at-a-glance comparison. */
function categoriesUpgradedBy(catalog: Catalog, defaults: string[]): Set<string> {
  const ids = new Set<string>();
  for (const optionId of defaults) {
    const option = getOption(catalog, optionId);
    if (option) ids.add(option.categoryId);
  }
  return ids;
}

function PackageIconRow({ defaults }: { defaults: string[] }) {
  const catalog = useCatalog();
  const upgraded = categoriesUpgradedBy(catalog, defaults);

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-1.5">
        {catalog.categories.map((c) => {
          const active = upgraded.has(c.id);
          return (
            <span
              key={c.id}
              title={
                active ? `${c.name}: upgraded` : `${c.name}: standard build`
              }
              className={`grid place-items-center w-8 h-8 rounded-md border transition-colors ${
                active
                  ? "bg-navy border-navy text-gold"
                  : "bg-transparent border-black/10 text-black/20"
              }`}
            >
              <CategoryIcon categoryId={c.id} className="w-4 h-4" />
              <span className="sr-only">
                {c.name}: {active ? "upgraded" : "standard"}
              </span>
            </span>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-steel">
        {upgraded.size === 0
          ? "Standard build across all 9 categories"
          : `Upgrades in ${upgraded.size} of ${catalog.categories.length} categories`}
      </p>
    </div>
  );
}

function StepPackage({
  floorPlanId,
  selectedId,
  onSelect,
}: {
  floorPlanId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const catalog = useCatalog();
  const packages = getPackages(catalog, floorPlanId);
  const plan = getFloorPlan(catalog, floorPlanId);

  return (
    <section>
      <StepHeading
        eyebrow={plan?.name ?? "Your Build"}
        title="Choose Your Trim Package"
        blurb={`Every trim package below is pre-configured to fit the ${plan?.name}. You can change any individual option afterward.`}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        {packages.map((pkg) => {
          const isSelected = pkg.id === selectedId;
          return (
            <button
              key={pkg.id}
              onClick={() => onSelect(pkg.id)}
              aria-pressed={isSelected}
              className={`text-left bg-white rounded-lg p-6 border-2 transition-all hover:shadow-lg flex flex-col ${
                isSelected ? "border-gold shadow-lg" : "border-transparent hover:border-sky/40"
              }`}
            >
              <h3 className="brand-heading text-xl">{pkg.name}</h3>
              <p className="mt-1 text-sm text-steel">{pkg.tagline}</p>
              <p className="mt-4 text-2xl font-extrabold text-navy">
                {pkg.priceDelta === 0 ? "Included" : `+${formatPrice(pkg.priceDelta)}`}
              </p>

              <PackageIconRow defaults={pkg.defaults} />

              {/* Package-only components lead the list. They are unselectable,
                  so this card is the one place in the whole wizard a buyer
                  ever sees them; letting the "+N more" swallow them would make
                  a real part of the build invisible. */}
              <ul className="mt-5 space-y-1.5 text-sm flex-1 border-t border-black/5 pt-4">
                {pkg.defaults.length === 0 && (
                  <li className="text-steel">The core build, nothing added.</li>
                )}
                {[...pkg.defaults]
                  .sort((a, b) => {
                    const rank = (id: string) =>
                      getOption(catalog, id)?.selectable === false ? 0 : 1;
                    return rank(a) - rank(b);
                  })
                  .slice(0, 6)
                  .map((id) => {
                    const option = getOption(catalog, id);
                    const packageOnly = option?.selectable === false;
                    return (
                      <li key={id} className="flex gap-2 text-charcoal">
                        <span className="text-gold font-bold">✓</span>
                        <span>
                          {option?.name}
                          {packageOnly && (
                            <span className="text-steel"> · in this package</span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                {pkg.defaults.length > 6 && (
                  <li className="text-steel pl-5">
                    + {pkg.defaults.length - 6} more
                  </li>
                )}
              </ul>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ColorSwatch({
  choice,
  active,
  onSelect,
}: {
  choice: ColorChoice;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className="group text-left w-[104px] shrink-0"
    >
      <span
        className={`block h-16 w-full rounded-md border-2 transition-all ${
          active
            ? "border-gold ring-2 ring-gold/30"
            : "border-black/10 group-hover:border-sky"
        }`}
        style={
          choice.hex2
            ? {
                backgroundImage: `repeating-linear-gradient(115deg, ${choice.hex} 0 7px, ${choice.hex2} 7px 13px)`,
              }
            : { backgroundColor: choice.hex }
        }
      />
      <span className="mt-1.5 block text-xs font-semibold text-charcoal leading-tight">
        {choice.name}
      </span>
      <span className="block text-[11px] text-steel">
        {choice.price === 0 ? "Included" : `+${formatPrice(choice.price)}`}
      </span>
    </button>
  );
}

function ColorGroupPicker({
  group,
  activeChoiceId,
  onSelect,
}: {
  group: ColorGroup;
  activeChoiceId?: string;
  onSelect: (choiceId: string) => void;
}) {
  return (
    <div className="bg-white rounded-lg p-5">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div>
          <h4 className="font-bold text-charcoal">{group.name}</h4>
          <p className="text-xs text-steel">{group.blurb}</p>
        </div>
        <p className="text-xs text-steel shrink-0">Choose one</p>
      </div>
      <div
        role="radiogroup"
        aria-label={group.name}
        className="flex gap-3 overflow-x-auto pb-1"
      >
        {group.choices.map((c) => (
          <ColorSwatch
            key={c.id}
            choice={c}
            active={c.id === activeChoiceId}
            onSelect={() => onSelect(c.id)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * One category rendered as a section, not a step.
 *
 * Six category steps meant six Next clicks through screens a buyer mostly did
 * not care about. They are sections on a single scrolling page now, which is
 * how every configurator worth copying does it: the buyer sees the whole shape
 * of the decision and jumps to the parts they have an opinion about.
 */
function CategorySection({
  category,
  floorPlanId,
  selected,
  onToggle,
  onExpand,
}: {
  category: Category;
  floorPlanId: string;
  selected: string[];
  onToggle: (id: string) => void;
  onExpand: (o: Option) => void;
}) {
  const catalog = useCatalog();
  const options = selectableOptionsFor(catalog, category.id, floorPlanId);
  if (options.length === 0) return null;

  const included = options.filter((o) => o.type === "included");
  const upgrades = options.filter((o) => o.type === "upgrade");
  const addons = options.filter((o) => o.type === "addon");

  return (
    <section id={category.id} className="scroll-mt-28 pt-10 first:pt-0">
      <div className="border-b border-black/10 pb-3 mb-6">
        <h2 className="brand-heading text-2xl">{category.name}</h2>
        <p className="mt-1 text-sm text-steel">{category.blurb}</p>
      </div>

      {included.length > 0 && (
        <OptionGroup title="Included in your build">
          {included.map((o) => (
            <OptionCard
              key={o.id}
              option={o}
              state={isSuperseded(catalog, o.id, selected) ? "superseded" : "included"}
              selected={selected}
              onToggle={onToggle}
              onExpand={onExpand}
            />
          ))}
        </OptionGroup>
      )}

      {upgrades.length > 0 && (
        <OptionGroup title="Upgrade options">
          {upgrades.map((o) => (
            <OptionCard
              key={o.id}
              option={o}
              state="choosable"
              selected={selected}
              onToggle={onToggle}
              onExpand={onExpand}
            />
          ))}
        </OptionGroup>
      )}

      {addons.length > 0 && (
        <OptionGroup title="Add-ons">
          {addons.map((o) => (
            <OptionCard
              key={o.id}
              option={o}
              state="choosable"
              selected={selected}
              onToggle={onToggle}
              onExpand={onExpand}
            />
          ))}
        </OptionGroup>
      )}
    </section>
  );
}

/** Colours get their own step, the way the reference configurator does it. */
function StepColors({
  floorPlanId,
  selected,
  colors,
  onToggle,
  onColor,
}: {
  floorPlanId: string;
  selected: string[];
  colors: Record<string, string>;
  onToggle: (id: string) => void;
  onColor: (groupId: string, choiceId: string) => void;
}) {
  const catalog = useCatalog();
  const groups = colorGroupsFor(catalog, COLOR_CATEGORY);
  const category = catalog.categories.find((c) => c.id === COLOR_CATEGORY);
  const [expanded, setExpanded] = useState<Option | null>(null);

  return (
    <section>
      <StepHeading
        eyebrow="Colors"
        title="Choose Your Finishes"
        blurb={category?.blurb ?? "Cabinetry, flooring, walls and countertops."}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((g) => (
          <ColorGroupPicker
            key={g.id}
            group={g}
            activeChoiceId={colors[g.id]}
            onSelect={(choiceId) => onColor(g.id, choiceId)}
          />
        ))}
      </div>

      {/* Finish products, the ones that are a yes or no rather than a swatch. */}
      {category && (
        <div className="mt-10">
          <CategorySection
            category={{ ...category, name: "Finish Upgrades", blurb: "" }}
            floorPlanId={floorPlanId}
            selected={selected}
            onToggle={onToggle}
            onExpand={setExpanded}
          />
        </div>
      )}

      {expanded && <Lightbox option={expanded} onClose={() => setExpanded(null)} />}
    </section>
  );
}

/** Every remaining category, on one page, with a jump nav. */
function StepOptions({
  floorPlanId,
  selected,
  onToggle,
}: {
  floorPlanId: string;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const catalog = useCatalog();
  const [expanded, setExpanded] = useState<Option | null>(null);
  const sections = catalog.categories.filter(
    (c) =>
      c.id !== COLOR_CATEGORY &&
      selectableOptionsFor(catalog, c.id, floorPlanId).length > 0,
  );

  return (
    <section>
      <StepHeading
        eyebrow="Options"
        title="Customize Your Build"
        blurb="Everything is on this page. Jump to what you care about and skip the rest; your trim package has already made a sensible choice everywhere."
      />

      {/* Jump nav rather than six separate steps. Sticky under the stepper so
          it stays reachable on a long page. */}
      <nav
        aria-label="Option categories"
        className="sticky top-[104px] z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-2 bg-white/95 backdrop-blur border-b border-black/10"
      >
        <ul className="flex gap-1 overflow-x-auto text-xs">
          {sections.map((c) => (
            <li key={c.id} className="shrink-0">
              <a
                href={`#${c.id}`}
                className="block px-3 py-1.5 rounded-full whitespace-nowrap font-semibold uppercase tracking-wide text-steel hover:bg-offwhite"
              >
                {c.name}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {sections.map((c) => (
        <CategorySection
          key={c.id}
          category={c}
          floorPlanId={floorPlanId}
          selected={selected}
          onToggle={onToggle}
          onExpand={setExpanded}
        />
      ))}

      {expanded && <Lightbox option={expanded} onClose={() => setExpanded(null)} />}
    </section>
  );
}

/**
 * Everything that ships in the build, grouped by system, one card each. Phase
 * 1 has no upgrades, so this is the whole van: a card opens the drawer with
 * the brand, model, what it is and why it is there.
 */
function IncludedNav({ floorPlanId, vanLengthId }: { floorPlanId: string; vanLengthId: string | null }) {
  const catalog = useCatalog();
  const items = includedFor(catalog, floorPlanId, vanLengthId);
  const cats = catalog.categories.filter((c) => items.some((o) => o.categoryId === c.id));
  return (
    <nav aria-label="Systems" className="bg-white/95 backdrop-blur border-b border-black/10">
      <ul className="max-w-6xl mx-auto px-4 sm:px-6 py-2 flex gap-1 overflow-x-auto text-xs">
        {cats.map((c) => (
          <li key={c.id} className="shrink-0">
            <a
              href={`#${c.id}`}
              className="block px-3 py-1.5 rounded-full whitespace-nowrap font-semibold uppercase tracking-wide text-steel hover:bg-offwhite"
            >
              {c.name}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function StepIncluded({
  floorPlanId,
  vanLengthId,
}: {
  floorPlanId: string;
  vanLengthId: string | null;
}) {
  const catalog = useCatalog();
  const [expanded, setExpanded] = useState<Option | null>(null);
  const all = includedFor(catalog, floorPlanId, vanLengthId);
  const items = topLevel(all);
  const sections = catalog.categories
    .map((c) => ({ category: c, items: items.filter((o) => o.categoryId === c.id) }))
    .filter((x) => x.items.length > 0);

  return (
    <section>
      <StepHeading
        eyebrow="Included in the price"
        title="What’s In Your Van"
        blurb={`Everything below comes in every build, on every floor plan, ${all.filter((o) => partsOf(all, o.id).length === 0).length} parts in all. Tap a system to see every part in it, with the brand, the model and why it is there.`}
      />


      {sections.map(({ category, items }) => (
        <section key={category.id} id={category.id} className="scroll-mt-[260px] pt-10">
          <div className="border-b border-black/10 pb-3 mb-6">
            <h2 className="brand-heading text-2xl">{category.name}</h2>
            <p className="mt-1 text-sm text-steel">{category.blurb}</p>
          </div>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((o) => (
              <OptionCard key={o.id} option={o} state="included" selected={[]} onToggle={() => {}} onExpand={setExpanded} partCount={partsOf(all, o.id).length} />
            ))}
          </div>
        </section>
      ))}

      {expanded && <Lightbox option={expanded} parts={partsOf(all, expanded.id)} onClose={() => setExpanded(null)} />}
    </section>
  );
}

function StepSummary({
  build,
  breakdown,
  customer,
  possessive,
  firstName,
}: {
  build: BuildState;
  breakdown: ReturnType<typeof priceBuild>;
  customer: Customer;
  possessive: string;
  firstName: string;
}) {
  const catalog = useCatalog();
  const plan = getFloorPlan(catalog, build.floorPlanId!);
  /* A modular van has no floor plan of its own; the plan behind it only
   * carries the conversion price. */
  const planName = build.layout ? "Custom Layout" : plan?.name;
  const van = build.vanLengthId ? getVanLength(catalog, build.vanLengthId) : undefined;
  const included = includedFor(catalog, build.floorPlanId!, build.vanLengthId);
  const [pdfState, setPdfState] = useState<"idle" | "working" | "error">("idle");

  async function downloadBuildSheet() {
    setPdfState("working");
    try {
      const response = await fetch("/api/build-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ b: encodeBuild(build), ...customer }),
      });
      if (!response.ok) throw new Error(await response.text());

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        response.headers
          .get("Content-Disposition")
          ?.match(/filename="(.+)"/)?.[1] ?? "Papago-Build-Sheet.pdf";
      link.click();
      URL.revokeObjectURL(url);
      setPdfState("idle");
    } catch {
      setPdfState("error");
    }
  }

  return (
    <section>
      <StepHeading
        eyebrow={firstName ? `Almost done, ${firstName}` : "Almost done"}
        title={`${possessive} Sheet`}
        blurb="Review your van below. The total is the full conversion plus an average price for the van."
      />

      <div className="bg-white rounded-lg p-6 sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2 pb-4 border-b border-black/10">
          <div>
            <h3 className="brand-heading text-2xl">{planName}</h3>
            <p className="text-sm text-steel">
              {van ? vanLabel(van) : ""}
              {build.layout ? <span className="font-mono"> \u00b7 {fullCode(build.layout)}</span> : null}
            </p>
          </div>
        </div>

        {build.layout && (
          <SummaryGroup title="Your Layout">
            {layoutLines(build.layout).map(({ label, piece }) => (
              <div key={piece.code} className="flex justify-between gap-4 py-1.5 text-sm">
                <span>
                  {label}: <span className="font-semibold">{piece.name}</span>
                </span>
                <span className="font-mono text-xs text-steel">{piece.code}</span>
              </div>
            ))}
          </SummaryGroup>
        )}

        <LineItem label={van ? `${vanLabel(van)} (average price)` : "Van"} price={breakdown.vanPrice} />
        <LineItem label={`${planName} conversion`} price={breakdown.base + breakdown.lengthDelta} />

        {breakdown.upgrades.length > 0 && (
          <SummaryGroup title="Upgrades">
            {breakdown.upgrades.map(({ option, price }) => (
              <LineItem key={option.id} label={option.name} price={price} />
            ))}
          </SummaryGroup>
        )}

        {breakdown.colors.length > 0 && (
          <SummaryGroup title="Finishes">
            {breakdown.colors.map((c) => (
              <LineItem
                key={c.group}
                label={`${c.group}: ${c.choice}`}
                price={c.price}
              />
            ))}
          </SummaryGroup>
        )}

        {breakdown.addons.length > 0 && (
          <SummaryGroup title="Add-ons">
            {breakdown.addons.map(({ option, price }) => (
              <LineItem key={option.id} label={option.name} price={price} />
            ))}
          </SummaryGroup>
        )}

        <div className="mt-6 pt-4 border-t-2 border-navy flex items-baseline justify-between">
          <span className="brand-heading text-lg">Estimated Build Total</span>
          <span className="text-3xl font-extrabold text-navy">
            {formatPrice(breakdown.total)}
          </span>
        </div>
        <p className="mt-2 text-xs text-steel">
          {VAN_NOTE} Final pricing is confirmed after a build consultation.
        </p>

        <div className="mt-8 p-6 rounded-lg bg-cream text-center">
          <p className="brand-heading text-lg">Download Your Build Sheet</p>
          <p className="mt-1 text-sm text-steel">
            An itemized PDF of this exact configuration, every system spelled
            out, ready to bring to a build consultation.
          </p>
          <button
            onClick={downloadBuildSheet}
            disabled={pdfState === "working"}
            className="mt-4 px-8 py-3 rounded-full bg-gold text-navy text-sm font-semibold hover:brightness-95 disabled:opacity-60 disabled:cursor-wait transition"
          >
            {pdfState === "working"
              ? "Building your sheet…"
              : "Get My Build Sheet (PDF)"}
          </button>
          {pdfState === "error" && (
            <p className="mt-3 text-sm text-red-700">
              That did not download. Try once more, or call (480) 761-7175.
            </p>
          )}
        </div>
        {/* Everything the price buys, by category, each system with its parts
            under it: buyers should see exactly what they are paying for. */}
        <div className="mt-8">
          <h3 className="brand-heading text-xl">What&rsquo;s Included</h3>
          <p className="mt-1 text-sm text-steel">
            Every item below comes in the price, {included.filter((o) => partsOf(included, o.id).length === 0).length} parts in all.
          </p>
          {catalog.categories.map((c) => {
            const items = topLevel(included).filter((o) => o.categoryId === c.id);
            if (items.length === 0) return null;
            return (
              <div key={c.id} className="mt-6">
                <h4 className="text-xs font-bold uppercase tracking-widest text-navy border-b border-black/10 pb-1.5">{c.name}</h4>
                <ul className="mt-2 divide-y divide-black/5">
                  {items.map((o) => {
                    const sub = partsOf(included, o.id);
                    const brand = (x: Option) => [x.manufacturer, x.model].filter(Boolean).join(" ");
                    return (
                      <li key={o.id} className="py-2">
                        <div className="flex justify-between gap-4 text-sm">
                          <span className="font-semibold text-charcoal">
                            {o.name}
                            {brand(o) && <span className="font-normal text-steel"> &middot; {brand(o)}</span>}
                          </span>
                          <span className="text-xs text-steel shrink-0">Included</span>
                        </div>
                        {sub.length > 0 && (
                          <ul className="mt-1.5 ml-4 grid gap-x-8 gap-y-1 sm:grid-cols-2 text-[13px] text-steel">
                            {sub.map((p) => (
                              <li key={p.id} className="list-disc">
                                <span className="text-charcoal">{p.name}</span>
                                {brand(p) && <span> &middot; {brand(p)}</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function StepHeading({
  eyebrow,
  title,
  blurb,
  className = "mb-8",
}: {
  eyebrow: string;
  title: string;
  blurb: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-bold uppercase tracking-widest text-sky">{eyebrow}</p>
      <h2 className="brand-heading text-3xl mt-1">{title}</h2>
      <p className="mt-2 text-steel max-w-2xl">{blurb}</p>
    </div>
  );
}

/**
 * A run of option cards under a small heading.
 *
 * Cards rather than list rows, following the reference configurator. A row
 * gives every option the same visual weight and buries the photograph at
 * thumbnail size; a card leads with the photograph, which is what someone
 * deciding between two water heaters actually wants to look at.
 */
function OptionGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-9">
      <h3 className="text-xs font-bold uppercase tracking-widest text-steel mb-3">
        {title}
      </h3>
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {children}
      </div>
    </div>
  );
}

/** 4:3 photo slot. Cover, so a card is the same height whatever it holds. */
function CardImage({
  option,
  onExpand,
}: {
  option: Option;
  onExpand: (option: Option) => void;
}) {
  if (!option.thumb) {
    return (
      <div className="aspect-[4/3] rounded-md bg-offwhite grid place-items-center">
        <span className="text-steel/30 text-3xl font-bold">
          {option.name.charAt(0)}
        </span>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onExpand(option)}
      aria-label={`More about ${option.name}`}
      className="relative aspect-[4/3] w-full rounded-md overflow-hidden bg-white cursor-zoom-in group"
    >
      <Image
        src={option.thumb}
        alt=""
        fill
        sizes="(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 20vw"
        className="object-cover transition-transform duration-300 group-hover:scale-[1.04]"
      />
    </button>
  );
}

/**
 * One option.
 *
 * Included items are cards too, not a separate list. They are part of the van
 * whether or not the buyer picked them, and showing them the same way is how
 * someone sees what their trim package already bought.
 */
function OptionCard({
  option,
  state,
  selected,
  onToggle,
  onExpand,
  partCount = 0,
}: {
  option: Option;
  /** included: ships as standard. superseded: replaced by a chosen upgrade. */
  state: "choosable" | "included" | "superseded";
  selected: string[];
  onToggle: (id: string) => void;
  onExpand: (option: Option) => void;
  /** A system's part count, shown so a buyer knows there is more behind the card. */
  partCount?: number;
}) {
  const catalog = useCatalog();
  const checked = selected.includes(option.id);
  const requirement = option.requires?.[0];
  const requirementName = requirement ? getOption(catalog, requirement)?.name : undefined;
  const blocked = Boolean(requirement && !selected.includes(requirement));

  const border = checked
    ? "border-gold"
    : state === "superseded"
      ? "border-transparent"
      : "border-transparent hover:border-sky/40";

  return (
    <div
      className={`bg-white rounded-lg border-2 p-2.5 flex flex-col transition-colors ${border} ${
        state === "superseded" ? "opacity-45" : ""
      }`}
    >
      <CardImage option={option} onExpand={onExpand} />

      <p
        className={`mt-2.5 text-[13px] font-semibold leading-snug text-charcoal ${
          state === "superseded" ? "line-through" : ""
        }`}
      >
        {option.name}
      </p>

      {state === "superseded" && (
        <p className="mt-1 text-[11px] text-sky">Replaced by your upgrade</p>
      )}
      {partCount > 0 && (
        <button type="button" onClick={() => onExpand(option)} className="mt-1 text-left text-[11px] font-semibold text-sky hover:underline">
          {partCount} parts, see all
        </button>
      )}
      {blocked && state === "choosable" && (
        <p className="mt-1 text-[11px] text-steel">Needs {requirementName}</p>
      )}

      {/* Pushed to the bottom so price and control line up across a row
          regardless of how long the names above them run. */}
      <div className="mt-auto pt-3 flex items-center justify-between gap-2">
        <span className="text-[13px] font-bold text-navy">
          {state === "choosable" ? (option.price > 0 ? formatPrice(option.price) : "$0") : ""}
        </span>

        {state === "choosable" ? (
          <button
            type="button"
            onClick={() => onToggle(option.id)}
            aria-pressed={checked}
            className={`shrink-0 rounded border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
              checked
                ? "bg-navy border-navy text-white hover:bg-navy-deep"
                : "border-navy/40 text-navy hover:border-navy"
            }`}
          >
            {checked ? "Added" : "Add"}
          </button>
        ) : (
          <span className="shrink-0 rounded border border-black/10 bg-offwhite px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-steel">
            Included
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Detail panel for one option.
 *
 * A drawer off the right edge rather than a centred modal. The grid stays
 * visible behind it, so someone comparing two water heaters can open one, read
 * it, close it and open the next without losing their place on a page that is
 * seven thousand pixels long.
 */
function Lightbox({
  option,
  parts = [],
  onClose,
}: {
  option: Option | null;
  /** When the option is a system, the parts in it. */
  parts?: Option[];
  onClose: () => void;
}) {
  useEffect(() => {
    if (!option) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [option, onClose]);

  if (!option) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={option.name}>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-navy/45 cursor-default"
      />
      <aside className="absolute right-0 top-0 h-full w-full max-w-[440px] bg-white shadow-2xl overflow-y-auto">
        <div className="sticky top-0 flex justify-end p-3 bg-white">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full bg-navy text-white text-lg leading-none hover:bg-navy-deep"
          >
            ×
          </button>
        </div>

        <div className="px-6 pb-10">
          {option.thumb && (
            <div className="relative aspect-[4/3] rounded-lg overflow-hidden bg-offwhite">
              <Image
                src={option.thumb}
                alt={option.name}
                fill
                sizes="440px"
                className="object-cover"
              />
            </div>
          )}

          <h2 className="brand-heading text-2xl mt-5">{option.name}</h2>

          {(option.manufacturer || option.model) && (
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              {option.manufacturer && (
                <>
                  <dt className="font-bold uppercase tracking-wide text-[11px] text-steel pt-0.5">Manufacturer</dt>
                  <dd className="text-charcoal">{option.manufacturer}</dd>
                </>
              )}
              {option.model && (
                <>
                  <dt className="font-bold uppercase tracking-wide text-[11px] text-steel pt-0.5">Model</dt>
                  <dd className="text-charcoal">{option.model}</dd>
                </>
              )}
            </dl>
          )}

          {option.whatItIs && (
            <div className="mt-5">
              <h3 className="text-xs font-bold uppercase tracking-widest text-navy">What it is</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-steel">{option.whatItIs}</p>
            </div>
          )}
          {option.whyYouNeedIt && (
            <div className="mt-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-navy">Why you need it</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-steel">{option.whyYouNeedIt}</p>
            </div>
          )}

          {!option.whatItIs && option.description && (
            <p className="mt-3 text-[15px] leading-relaxed text-steel">
              {option.description}
            </p>
          )}

          {parts.length > 0 && (
            <div className="mt-7">
              <h3 className="text-xs font-bold uppercase tracking-widest text-navy">What&rsquo;s in it ({parts.length})</h3>
              <ul className="mt-3 space-y-5">
                {parts.map((part) => (
                  <li key={part.id} className="flex gap-4">
                    <div className="relative w-24 h-[72px] shrink-0 rounded-md overflow-hidden bg-offwhite">
                      {part.thumb ? (
                        <Image src={part.thumb} alt={part.name} fill sizes="96px" className="object-cover" />
                      ) : (
                        <span className="absolute inset-0 grid place-items-center text-steel/30 text-2xl font-bold">{part.name.charAt(0)}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-charcoal leading-snug">{part.name}</p>
                      {(part.manufacturer || part.model) && (
                        <p className="text-xs text-steel mt-0.5">{[part.manufacturer, part.model].filter(Boolean).join(" \u00b7 ")}</p>
                      )}
                      {part.whatItIs && <p className="text-[13px] leading-relaxed text-steel mt-1.5">{part.whatItIs}</p>}
                      {part.whyYouNeedIt && (
                        <p className="text-[13px] leading-relaxed text-steel mt-1">
                          <strong className="text-charcoal">Why: </strong>
                          {part.whyYouNeedIt}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-5 text-sm font-bold text-navy">
            {option.type === "included"
              ? "Included in your build"
              : option.type === "upgrade"
                ? `${formatPrice(option.price)} to upgrade`
                : `${formatPrice(option.price)} to add`}
          </p>
        </div>
      </aside>
    </div>
  );
}

function SummaryGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5">
      <h4 className="text-xs font-bold uppercase tracking-widest text-steel mb-1">
        {title}
      </h4>
      {children}
    </div>
  );
}

function LineItem({ label, price }: { label: string; price: number }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm border-b border-black/5">
      <span className="text-charcoal">{label}</span>
      <span className="text-steel whitespace-nowrap">{formatPrice(price)}</span>
    </div>
  );
}

function SummaryBar({
  breakdown,
  planName,
  onGetBuildSheet,
  canFinish,
  atSummary,
}: {
  breakdown: ReturnType<typeof priceBuild>;
  planName?: string;
  onGetBuildSheet: () => void;
  canFinish: boolean;
  atSummary: boolean;
}) {
  // Shows from the moment a van is picked: the van alone, then van plus
  // conversion once there is a floor plan.
  if (!planName) return null;

  const extras = breakdown.upgrades.length + breakdown.addons.length;

  return (
    <div className="fixed bottom-0 inset-x-0 z-30 bg-navy text-white shadow-[0_-4px_20px_rgba(0,0,0,0.25)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-widest text-white/60 truncate">
            {planName}
            {extras > 0 && ` · ${extras} option${extras === 1 ? "" : "s"} added`}
          </p>
          <p className="text-2xl font-extrabold leading-tight">
            {formatPrice(breakdown.total)}
            <span className="ml-2 text-[11px] font-semibold uppercase tracking-widest text-gold align-middle">
              {breakdown.base > 0 ? "Van + conversion" : "Van, average price"}
            </span>
          </p>
        </div>
        {!atSummary && (
          <button
            onClick={onGetBuildSheet}
            disabled={!canFinish}
            className="shrink-0 px-5 sm:px-7 py-3 rounded-full bg-gold text-navy text-xs sm:text-sm font-semibold hover:bg-gold-deep transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Get Build Sheet
          </button>
        )}
      </div>
    </div>
  );
}
