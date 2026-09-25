"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
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
const PLAN_STEP = 2;
const GALLERY_STEP = 3;
const PACKAGE_STEP = 4;
const COLOR_STEP = 5;
const OPTIONS_STEP = 6;
const SUMMARY_STEP = 7;

/* The category that owns the colour swatches. It gets its own step; every
 * other category is a section on the single Options page. */
const COLOR_CATEGORY = "finishes";

const CUSTOMER_KEY = "pv_customer";

/* The marketing site the header logo returns to. Env so it can be pointed at
 * the rebuilt site the day that launches, without a code change. */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://papagovans.com";

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

  // Restore a shared build from the URL, and the customer from this session.
  // Customer details deliberately stay out of the URL so shared links carry no PII.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(CUSTOMER_KEY);
      // Merged onto the empty customer so a session saved before a field
      // existed restores as "" rather than undefined.
      if (saved) setCustomer({ ...EMPTY_CUSTOMER, ...JSON.parse(saved) });
    } catch {
      // Private mode or blocked storage. Non-fatal.
    }
    const restored = decodeBuild(
      catalog,
      new URLSearchParams(window.location.search).get("b"),
    );
    if (restored.floorPlanId) {
      setBuild(restored);
      setStep(restored.packageId ? OPTIONS_STEP : GALLERY_STEP);
    }
  }, [catalog]);

  useEffect(() => {
    try {
      if (customer.firstName || customer.email) {
        sessionStorage.setItem(CUSTOMER_KEY, JSON.stringify(customer));
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
  }, [build]);

  const plan = build.floorPlanId
    ? getFloorPlan(catalog, build.floorPlanId)
    : undefined;
  const breakdown = useMemo(() => priceBuild(catalog, build), [catalog, build]);

  const canAdvance =
    step === LENGTH_STEP
      ? Boolean(build.vanLengthId)
      : step === INTRO_STEP
        ? isValidCustomer(customer)
        : step <= GALLERY_STEP
          ? Boolean(build.floorPlanId)
          : Boolean(build.packageId);

  /** Last name drives the personalized headlines, with a neutral fallback. */
  const surname = customer.lastName.trim();
  const possessive = surname ? `The ${surname} Build` : "Your Build";

  const goTo = useCallback((next: number) => {
    setStep(Math.max(0, Math.min(SUMMARY_STEP, next)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <CatalogContext.Provider value={catalog}>
    <div className="flex flex-col min-h-screen pb-28">
      <Header />
      <Hero />

      {/* Van context and step nav travel together so neither scrolls away. */}
      {/* The stepper shows from the very first screen, because "step 1 of 8" is
          most useful to someone deciding whether to start at all. The van bar
          above it waits until there is a van to name. */}
      <div className="sticky top-0 z-30 shadow-sm">
        {step > LENGTH_STEP && (
          <VanContextBar planName={plan?.name} surname={surname} />
        )}
        <Stepper
          step={step}
          onJump={goTo}
          hasDetails={isValidCustomer(customer)}
          hasPlan={Boolean(build.floorPlanId)}
          hasPackage={Boolean(build.packageId)}
        />
      </div>

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-10">
        {step === INTRO_STEP && (
          <StepIntro
            customer={customer}
            vanLengthName={
              build.vanLengthId
                ? getVanLength(catalog, build.vanLengthId)?.name
                : undefined
            }
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
                    vanLength: build.vanLengthId
                      ? getVanLength(catalog, build.vanLengthId)?.name
                      : undefined,
                  }),
                }).catch(() => {});
              }
              goTo(PLAN_STEP);
            }}
          />
        )}

        {step === LENGTH_STEP && (
          <StepVanLength
            selectedId={build.vanLengthId}
            possessive={possessive}
            onChoose={(id) => setBuild((b) => setVanLength(catalog, b, id))}
            onContinue={() => goTo(INTRO_STEP)}
          />
        )}

        {step === PLAN_STEP && (
          <StepFloorPlan
            selectedId={build.floorPlanId}
            vanLengthId={build.vanLengthId}
            possessive={possessive}
            onSelect={(id) => {
              setBuild((b) => setFloorPlan(b, id));
              goTo(GALLERY_STEP);
            }}
          />
        )}

        {step === GALLERY_STEP && plan && (
          <StepGallery plan={plan} onContinue={() => goTo(PACKAGE_STEP)} />
        )}

        {step === PACKAGE_STEP && build.floorPlanId && (
          <StepPackage
            floorPlanId={build.floorPlanId}
            selectedId={build.packageId}
            onSelect={(pkgId) => {
              setBuild((b) => applyPackage(catalog, b, build.floorPlanId!, pkgId));
              goTo(COLOR_STEP);
            }}
          />
        )}

        {step === COLOR_STEP && build.floorPlanId && (
          <StepColors
            floorPlanId={build.floorPlanId}
            selected={build.selected}
            colors={build.colors}
            onToggle={(id) => setBuild((b) => toggleOption(catalog, b, id))}
            onColor={(groupId, choiceId) =>
              setBuild((b) => setColor(b, groupId, choiceId))
            }
          />
        )}

        {step === OPTIONS_STEP && build.floorPlanId && (
          <StepOptions
            floorPlanId={build.floorPlanId}
            selected={build.selected}
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

        {step > LENGTH_STEP && (
          <div className="flex items-center justify-between mt-12">
            <button
              onClick={() => goTo(step - 1)}
              className="px-6 py-3 text-sm font-semibold uppercase tracking-wide text-steel hover:text-navy transition-colors"
            >
              ← Back
            </button>
            {step < SUMMARY_STEP && (
              <button
                onClick={() => goTo(step + 1)}
                disabled={!canAdvance}
                className="px-8 py-3 rounded bg-navy text-white text-sm font-bold uppercase tracking-wide hover:bg-navy-deep transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {step === PACKAGE_STEP
                  ? "Next: Colors"
                  : step === COLOR_STEP
                    ? "Next: Options"
                    : step === OPTIONS_STEP
                      ? "Next: Build Sheet"
                      : "Next"}{" "}
                →
              </button>
            )}
          </div>
        )}
      </main>

      <SummaryBar
        breakdown={breakdown}
        planName={plan?.name}
        onGetBuildSheet={() => goTo(SUMMARY_STEP)}
        canFinish={Boolean(build.packageId)}
        atSummary={step === SUMMARY_STEP}
      />
    </div>
    </CatalogContext.Provider>
  );
}

// ---------------------------------------------------------------------------

function Header() {
  return (
    <header className="bg-navy">
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://papagovans.com/wp-content/uploads/2023/06/papagovans.png"
            alt="Papago Vans"
            className="h-12 w-auto transition-opacity hover:opacity-80"
          />
        </a>
        <a href="tel:+14807248372" className="text-right leading-tight">
          <span className="block text-[11px] font-bold uppercase tracking-widest text-gold">
            Got Questions?
          </span>
          <span className="block text-lg font-bold text-white">(480) 724-8372</span>
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
    value: "Van Included",
    label: "Mercedes-Benz Sprinter",
    detail: "Every price covers the chassis and the full conversion",
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
    detail: "Through our partner, Hearth",
  },
];

function Hero() {
  return (
    <section className="bg-navy-deep">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <div className="text-center max-w-2xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-extrabold uppercase tracking-tight text-white leading-none">
            Build Your Van
          </h1>
          <p className="mt-3 text-white/75">
            Three van lengths, five floor plans and three trim packages, then
            customize from there. Your estimated total updates as you go.
          </p>
        </div>

        <dl className="mt-7 grid grid-cols-2 lg:grid-cols-4 gap-3">
          {BUILD_FACTS.map((f) => (
            <div
              key={f.value}
              className="rounded-lg bg-white/5 border border-white/10 p-4"
            >
              <dt className="text-gold font-bold uppercase tracking-wide text-sm leading-tight">
                {f.value}
              </dt>
              <dd className="text-white text-sm font-semibold mt-0.5">
                {f.label}
              </dd>
              <dd className="text-white/55 text-xs mt-1.5 leading-snug">
                {f.detail}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/**
 * Persistent context strip. Keeps three facts on screen at all times: whose
 * build this is, that it is a Mercedes Sprinter, and which layout it is on.
 */
function VanContextBar({
  planName,
  surname,
}: {
  planName?: string;
  surname: string;
}) {
  return (
    <div className="bg-cream border-b border-black/10">
      {/*
        The van overhangs a navy shelf that belongs to this bar rather than to
        the hero above it. Flush under the hero it reads as one header, and the
        overlap survives the bar going sticky instead of clipping at the
        viewport edge.
      */}
      <div className="bg-navy-deep h-[29px] sm:h-[37px]" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {/*
            Twice the old render. The box holds the lower two thirds and the
            image, bottom-anchored, spills its top third onto the shelf.
          */}
          <div className="relative w-[132px] sm:w-[168px] h-[59px] sm:h-[75px] shrink-0">
            <Image
              src="/sprinter.webp"
              alt="Mercedes-Benz Sprinter"
              width={168}
              height={112}
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
              Mercedes-Benz Sprinter
            </p>
          </div>
        </div>

        {planName && (
          <div className="text-right min-w-0 shrink-0">
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
          className="w-full px-8 py-4 rounded bg-gold text-navy text-sm font-bold uppercase tracking-wide hover:bg-gold-deep transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
  hasDetails,
  hasPlan,
  hasPackage,
}: {
  step: number;
  onJump: (n: number) => void;
  hasDetails: boolean;
  hasPlan: boolean;
  hasPackage: boolean;
}) {
  const catalog = useCatalog();
  const labels = [
    "Van Length",
    "Your Info",
    "Floor Plan",
    "Layout",
    "Trim Package",
    "Colors",
    "Options",
    "Build Sheet",
  ];

  /* A progress count beats a row of pills on its own: a buyer scanning a
   * configurator wants to know how much is left, not what the stages are
   * called. The nudges start where the finish is genuinely in sight, which is
   * also where people abandon. Nothing before step 6 gets one, because
   * cheerleading at step 2 is a lie about how far along you are. */
  const total = labels.length;
  const nudge: Record<number, string> = {
    [COLOR_STEP]: "almost there",
    [OPTIONS_STEP]: "just one more!",
    [SUMMARY_STEP]: "that\u2019s the whole van",
  };

  return (
    <nav
      aria-label="Build steps"
      className="bg-white border-b border-black/10"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center gap-5">
        <p className="shrink-0 py-3 leading-tight">
          <span className="brand-heading block text-base sm:text-lg text-navy whitespace-nowrap">
            Step {step + 1} of {total}
          </span>
          {nudge[step] && (
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-steel">
              {nudge[step]}
            </span>
          )}
        </p>
        <ol className="flex gap-1 overflow-x-auto py-3 text-xs">
          {labels.map((label, i) => {
            const isCurrent = i === step;
            const reachable =
              i <= INTRO_STEP
                ? true
                : i === PLAN_STEP
                  ? hasDetails
                  : i <= PACKAGE_STEP
                    ? hasPlan
                    : hasPackage;
            return (
              <li key={label} className="shrink-0">
                <button
                  onClick={() => reachable && onJump(i)}
                  disabled={!reachable}
                  aria-current={isCurrent ? "step" : undefined}
                  className={`px-3 py-1.5 rounded-full whitespace-nowrap font-semibold uppercase tracking-wide transition-colors ${
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
 * Step one after the intro: which Sprinter.
 *
 * Cards lead with what the length gets you and carry the wheelbase underneath,
 * because nobody arrives at a van site having already decided they want 170
 * inches. The price shown is what the chassis adds, not a total, since no floor
 * plan has been chosen yet and a total here would be a number we cannot stand
 * behind.
 */
/*
 * Choosing sets the van; Continue advances. Those are deliberately separate.
 * If a card advanced on click, a buyer could never click between the three to
 * watch the van grow, which is the entire reason there is one large render
 * instead of three small ones.
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
  const active = selectedId ?? catalog.vanLengths[0]?.id ?? null;

  return (
    <section>
      <StepHeading
        eyebrow={possessive}
        title="Choose Your Van"
        blurb="Every build starts with a high-roof Mercedes-Benz Sprinter. The only question here is how long it is."
      />

      {/*
        All three renders come from the same Mercedes camera and are cropped to
        one shared frame, so the nose and the ground line sit in the same place
        in every file. Stacking them and cross-fading is what makes switching
        read as the same van growing backwards rather than as three unrelated
        photographs. A grid of three side-by-side cards cannot do that: each van
        fills its own card and they all look the same size.
      */}
      {/* Capped rather than full-bleed. The Mercedes render is 903px of real
          pixels and no more exists, so stretching the stage past that only
          spreads the same detail thinner and reads as soft. */}
      <div className="relative w-full max-w-[720px] mx-auto aspect-[903/576] bg-offwhite rounded-lg overflow-hidden">
        {catalog.vanLengths.map((length) => (
          <Image
            key={length.id}
            src={length.image}
            alt={`Mercedes-Benz Sprinter, ${length.tagline}`}
            fill
            priority={length.id === active}
            sizes="(max-width: 1024px) 100vw, 900px"
            /* Inline rather than a Tailwind opacity utility: next/image writes
             * its own style attribute for `fill`, and that inline style wins
             * over the class, so the wrong van stayed visible. */
            style={{ opacity: length.id === active ? 1 : 0 }}
            className="object-contain transition-opacity duration-500"
          />
        ))}
      </div>

      {/*
        Mercedes' own configurator colours the added body section to show what
        a longer wheelbase buys. Same idea, done as a to-scale bar rather than
        by tinting the render: the navy is the shortest van every build starts
        from, and the gold is the extra length this chassis adds. It is drawn
        from real published inches, so the proportions are the vehicles'
        proportions and not an illustrator's guess.
      */}
      <div className="mt-6 space-y-2">
        {catalog.vanLengths.map((length) => {
          const base = catalog.vanLengths[0]?.overallInches ?? length.overallInches;
          const longest = Math.max(...catalog.vanLengths.map((v) => v.overallInches));
          const basePct = (base / longest) * 100;
          const extraPct = ((length.overallInches - base) / longest) * 100;
          const isActive = length.id === active;
          return (
            <div key={length.id} className={`flex items-center gap-3 transition-opacity ${isActive ? "opacity-100" : "opacity-45"}`}>
              <span className="w-24 shrink-0 text-xs font-bold uppercase tracking-wide text-steel">
                {length.tagline.split(",")[0]}
              </span>
              <div className="flex-1 flex h-5 rounded-sm overflow-hidden bg-offwhite" aria-hidden="true">
                <div className="bg-navy" style={{ width: `${basePct}%` }} />
                <div className="bg-gold" style={{ width: `${extraPct}%` }} />
              </div>
              <span className="w-28 shrink-0 text-xs text-steel text-right tabular-nums">
                {length.overallInches}&quot; overall
                {extraPct > 0 && (
                  <strong className="block text-navy">
                    +{Math.round(length.overallInches - base)}&quot; longer
                  </strong>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-3 mt-8">
        {catalog.vanLengths.map((length) => {
          const isSelected = length.id === active;
          return (
            <button
              key={length.id}
              onClick={() => onChoose(length.id)}
              aria-pressed={isSelected}
              className={`text-left bg-white rounded-lg p-5 border-2 transition-all hover:shadow-lg ${
                isSelected
                  ? "border-gold shadow-lg"
                  : "border-black/10 hover:border-sky/40"
              }`}
            >
              <h3 className="brand-heading text-lg">{length.name}</h3>
              <p className="mt-1 text-sm text-steel min-h-10">{length.tagline}</p>
              <p className="mt-3 text-sm font-bold text-navy">
                {length.priceDelta === 0
                  ? "Included in the base price"
                  : `${formatPrice(length.priceDelta)} more van`}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-8 flex justify-end">
        <button
          onClick={onContinue}
          disabled={!selectedId}
          className="px-8 py-3 rounded bg-navy text-white text-sm font-bold uppercase tracking-wide hover:bg-navy-deep transition-colors disabled:opacity-40"
        >
          Continue →
        </button>
      </div>
    </section>
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
  const lengthDelta = vanLengthId
    ? (getVanLength(catalog, vanLengthId)?.priceDelta ?? 0)
    : 0;
  return (
    <section>
      <StepHeading
        eyebrow={possessive}
        title="Choose Your Floor Plan"
        blurb="Every plan is built to order on a Mercedes Sprinter, and every price includes the van. Pick the layout that fits how you travel."
      />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const isSelected = plan.id === selectedId;
          return (
            <button
              key={plan.id}
              onClick={() => onSelect(plan.id)}
              aria-pressed={isSelected}
              className={`group text-left bg-white rounded-lg overflow-hidden border-2 transition-all hover:shadow-lg ${
                isSelected
                  ? "border-gold shadow-lg"
                  : "border-transparent hover:border-sky/40"
              }`}
            >
              <div className="relative aspect-[2/1] bg-offwhite">
                {/* A plan added in the admin has no gallery until someone
                    uploads one. Rendering <Image src=""> makes the browser
                    refetch the whole page, so show the empty state instead. */}
                {plan.image ? (
                  <Image
                    src={plan.image}
                    alt={`${plan.name} layout`}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 grid place-content-center text-xs uppercase tracking-widest text-steel">
                    No layout image yet
                  </div>
                )}
              </div>
              <div className="p-5">
                <h3 className="brand-heading text-xl">{plan.name}</h3>
                <p className="mt-1 text-sm text-steel min-h-10">{plan.tagline}</p>
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-steel">
                  {plan.specs.map((s) => (
                    <span key={s.label}>
                      <strong className="text-charcoal">{s.value}</strong> {s.label}
                    </span>
                  ))}
                </div>
                {/* basePrice is the price on the shortest van, so the chosen
                    chassis has to be added back or this card undercuts the
                    total the buyer sees on the next screen. */}
                <p className="mt-4 text-sm font-bold text-navy">
                  Starts at {formatPrice(plan.basePrice + lengthDelta)}
                </p>
                <p className="text-xs text-steel">Van included</p>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function StepGallery({
  plan,
  onContinue,
}: {
  plan: FloorPlan;
  onContinue: () => void;
}) {
  const [activeId, setActiveId] = useState(plan.gallery[0]?.id);

  // Reset to the first view whenever the selected plan changes.
  useEffect(() => {
    setActiveId(plan.gallery[0]?.id);
  }, [plan.id, plan.gallery]);

  const active = plan.gallery.find((g) => g.id === activeId) ?? plan.gallery[0];

  return (
    <section>
      <StepHeading
        eyebrow="Step 3"
        title={`Explore the ${plan.name}`}
        blurb="Take a closer look at the layout from every angle before you choose a trim package."
      />

      <div className="bg-white rounded-lg overflow-hidden">
        <div className="relative aspect-[2/1] bg-offwhite">
          <Image
            key={active.id}
            src={active.src}
            alt={`${plan.name} ${active.label}`}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 1024px"
            className="object-contain animate-[fadeIn_200ms_ease-out]"
          />
          <span className="absolute left-4 bottom-4 px-3 py-1 rounded-full bg-navy/85 text-white text-xs font-bold uppercase tracking-widest">
            {active.label}
          </span>
        </div>

        <div
          role="tablist"
          aria-label={`${plan.name} views`}
          className="flex gap-2 overflow-x-auto p-3 border-t border-black/10"
        >
          {plan.gallery.map((img) => {
            const isActive = img.id === active.id;
            return (
              <button
                key={img.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveId(img.id)}
                title={img.label}
                className={`relative shrink-0 w-28 aspect-[2/1] rounded overflow-hidden border-2 transition-all ${
                  isActive
                    ? "border-gold ring-2 ring-gold/30"
                    : "border-transparent opacity-60 hover:opacity-100"
                }`}
              >
                <Image
                  src={img.src}
                  alt={img.label}
                  fill
                  sizes="112px"
                  className="object-cover"
                />
              </button>
            );
          })}
        </div>
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
          className="px-10 py-4 rounded bg-gold text-navy text-sm font-bold uppercase tracking-wide hover:bg-gold-deep transition-colors"
        >
          Choose Your Trim Package →
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
  const pkg = getPackages(catalog, build.floorPlanId!).find(
    (p) => p.id === build.packageId,
  );
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
        blurb="Review your configuration below. Every price includes the Mercedes Sprinter van itself."
      />

      <div className="bg-white rounded-lg p-6 sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2 pb-4 border-b border-black/10">
          <div>
            <h3 className="brand-heading text-2xl">{plan?.name}</h3>
            <p className="text-sm text-steel">{pkg?.name} trim package</p>
          </div>
          <p className="text-sm text-steel">Base {formatPrice(breakdown.base)}</p>
        </div>

        {breakdown.packageDelta > 0 && (
          <LineItem
            label={`${pkg?.name} trim package`}
            price={breakdown.packageDelta}
          />
        )}

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
          <strong className="text-charcoal">Van included.</strong> This estimate
          covers the Mercedes Sprinter and the full conversion. Final pricing is
          confirmed after a build consultation.
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
            className="mt-4 px-8 py-3 rounded bg-gold text-navy text-sm font-bold uppercase tracking-wide hover:brightness-95 disabled:opacity-60 disabled:cursor-wait transition"
          >
            {pdfState === "working"
              ? "Building your sheet…"
              : "Get My Build Sheet (PDF)"}
          </button>
          {pdfState === "error" && (
            <p className="mt-3 text-sm text-red-700">
              That did not download. Try once more, or call (480) 724-8372.
            </p>
          )}
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
}: {
  eyebrow: string;
  title: string;
  blurb: string;
}) {
  return (
    <div className="mb-8">
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
}: {
  option: Option;
  /** included: ships as standard. superseded: replaced by a chosen upgrade. */
  state: "choosable" | "included" | "superseded";
  selected: string[];
  onToggle: (id: string) => void;
  onExpand: (option: Option) => void;
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
      {blocked && state === "choosable" && (
        <p className="mt-1 text-[11px] text-steel">Needs {requirementName}</p>
      )}

      {/* Pushed to the bottom so price and control line up across a row
          regardless of how long the names above them run. */}
      <div className="mt-auto pt-3 flex items-center justify-between gap-2">
        <span className="text-[13px] font-bold text-navy">
          {state === "choosable" && option.price > 0 ? formatPrice(option.price) : "$0"}
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
  onClose,
}: {
  option: Option | null;
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

          {option.description && (
            <p className="mt-3 text-[15px] leading-relaxed text-steel">
              {option.description}
            </p>
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
              Van included
            </span>
          </p>
        </div>
        {!atSummary && (
          <button
            onClick={onGetBuildSheet}
            disabled={!canFinish}
            className="shrink-0 px-5 sm:px-7 py-3 rounded bg-gold text-navy text-xs sm:text-sm font-bold uppercase tracking-wide hover:bg-gold-deep transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Get Build Sheet
          </button>
        )}
      </div>
    </div>
  );
}
