"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  CATEGORIES,
  FLOOR_PLANS,
  getFloorPlan,
  getOption,
  getPackages,
  optionsFor,
  type FloorPlan,
  type Option,
} from "@/lib/catalog";
import {
  EMPTY_BUILD,
  EMPTY_CUSTOMER,
  applyPackage,
  decodeBuild,
  encodeBuild,
  formatPrice,
  isSuperseded,
  priceBuild,
  setFloorPlan,
  isValidCustomer,
  toggleOption,
  type BuildState,
  type Customer,
} from "@/lib/pricing";

/** 0 = intro, 1 = floor plan, 2 = gallery, 3 = package, 4..12 = categories, 13 = summary. */
const INTRO_STEP = 0;
const PLAN_STEP = 1;
const GALLERY_STEP = 2;
const PACKAGE_STEP = 3;
const CATEGORY_STEP_OFFSET = 4;
const TOTAL_STEPS = CATEGORY_STEP_OFFSET + CATEGORIES.length + 1;
const SUMMARY_STEP = TOTAL_STEPS - 1;

const CUSTOMER_KEY = "pv_customer";

export default function Configurator() {
  const [build, setBuild] = useState<BuildState>(EMPTY_BUILD);
  const [customer, setCustomer] = useState<Customer>(EMPTY_CUSTOMER);
  const [step, setStep] = useState(INTRO_STEP);

  // Restore a shared build from the URL, and the customer from this session.
  // Customer details deliberately stay out of the URL so shared links carry no PII.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(CUSTOMER_KEY);
      if (saved) setCustomer(JSON.parse(saved));
    } catch {
      // Private mode or blocked storage. Non-fatal.
    }
    const restored = decodeBuild(
      new URLSearchParams(window.location.search).get("b"),
    );
    if (restored.floorPlanId) {
      setBuild(restored);
      setStep(restored.packageId ? CATEGORY_STEP_OFFSET : GALLERY_STEP);
    }
  }, []);

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

  const plan = build.floorPlanId ? getFloorPlan(build.floorPlanId) : undefined;
  const breakdown = useMemo(() => priceBuild(build), [build]);

  const canAdvance =
    step <= GALLERY_STEP ? Boolean(build.floorPlanId) : Boolean(build.packageId);

  /** Last name drives the personalized headlines, with a neutral fallback. */
  const surname = customer.lastName.trim();
  const possessive = surname ? `The ${surname} Build` : "Your Build";

  const goTo = useCallback((next: number) => {
    setStep(Math.max(0, Math.min(SUMMARY_STEP, next)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <div className="flex flex-col min-h-screen pb-28">
      <Header />
      <Hero />

      {/* Van context and step nav travel together so neither scrolls away. */}
      {step > INTRO_STEP && (
        <div className="sticky top-0 z-30 shadow-sm">
          <VanContextBar planName={plan?.name} surname={surname} />
          {build.floorPlanId && (
            <Stepper
              step={step}
              onJump={goTo}
              hasPlan={Boolean(build.floorPlanId)}
              hasPackage={Boolean(build.packageId)}
            />
          )}
        </div>
      )}

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-10">
        {step === INTRO_STEP && (
          <StepIntro
            customer={customer}
            onChange={setCustomer}
            onContinue={() => goTo(PLAN_STEP)}
          />
        )}

        {step === PLAN_STEP && (
          <StepFloorPlan
            selectedId={build.floorPlanId}
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
              setBuild((b) => applyPackage(b, build.floorPlanId!, pkgId));
              goTo(CATEGORY_STEP_OFFSET);
            }}
          />
        )}

        {step >= CATEGORY_STEP_OFFSET && step < SUMMARY_STEP && build.floorPlanId && (
          <StepCategory
            category={CATEGORIES[step - CATEGORY_STEP_OFFSET]}
            floorPlanId={build.floorPlanId}
            selected={build.selected}
            onToggle={(id) => setBuild((b) => toggleOption(b, id))}
          />
        )}

        {step === SUMMARY_STEP && plan && (
          <StepSummary
            build={build}
            breakdown={breakdown}
            possessive={possessive}
            firstName={customer.firstName.trim()}
          />
        )}

        {step > PLAN_STEP && (
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
                {step === PACKAGE_STEP ? "Customize Your Build" : "Next"} →
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
  );
}

// ---------------------------------------------------------------------------

function Header() {
  return (
    <header className="bg-navy">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://papagovans.com/wp-content/uploads/2023/06/papagovans.png"
          alt="Papago Vans"
          className="h-12 w-auto"
        />
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

function Hero() {
  return (
    <section className="relative bg-navy-deep">
      {/* TODO: swap for the stock un-converted Sprinter photo once supplied. */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-40"
        style={{
          backgroundImage:
            "url(https://papagovans.com/wp-content/uploads/2025/07/papago_vans.webp)",
        }}
      />
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20 text-center">
        <h1 className="text-4xl sm:text-5xl font-extrabold uppercase tracking-tight text-white leading-none">
          Build Your Van
        </h1>
        <p className="mt-4 text-lg text-white/80 max-w-2xl mx-auto">
          Start with a floor plan, pick a package, then make it yours. Your
          estimated total updates as you go.
        </p>
      </div>
    </section>
  );
}

/**
 * Persistent context strip. Keeps two facts on screen at all times: this is a
 * Mercedes Sprinter, and this is the layout you picked.
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
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative w-20 sm:w-28 h-11 sm:h-14 shrink-0">
            <Image
              src="/sprinter.webp"
              alt="Mercedes-Benz Sprinter"
              fill
              sizes="112px"
              className="object-contain"
              priority
            />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-steel">
              Building on
            </p>
            <p className="text-sm sm:text-base font-bold text-navy leading-tight truncate">
              Mercedes-Benz Sprinter
            </p>
          </div>
        </div>

        {planName && (
          <div className="text-right min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-steel">
              {surname ? `${surname} Build` : "Floor Plan"}
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

function StepIntro({
  customer,
  onChange,
  onContinue,
}: {
  customer: Customer;
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
        autoComplete={
          key === "firstName" ? "given-name" : key === "lastName" ? "family-name" : "email"
        }
        onChange={(e) => onChange({ ...customer, [key]: e.target.value })}
        className="w-full rounded-md border border-black/15 bg-white px-4 py-3 text-charcoal outline-none focus:border-sky focus:ring-2 focus:ring-sky/30"
      />
    </div>
  );

  return (
    <section className="max-w-xl mx-auto">
      <div className="text-center mb-8">
        <p className="text-xs font-bold uppercase tracking-widest text-sky">
          Let&apos;s get started
        </p>
        <h2 className="brand-heading text-3xl mt-1">Build Your Sprinter</h2>
        <p className="mt-2 text-steel">
          Tell us who we&apos;re building for. We&apos;ll personalize your build
          and save your Build Sheet.
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
  hasPlan,
  hasPackage,
}: {
  step: number;
  onJump: (n: number) => void;
  hasPlan: boolean;
  hasPackage: boolean;
}) {
  const labels = [
    "Your Info",
    "Floor Plan",
    "Layout",
    "Package",
    ...CATEGORIES.map((c) => c.name),
    "Build Sheet",
  ];

  return (
    <nav
      aria-label="Build steps"
      className="bg-white border-b border-black/10"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <ol className="flex gap-1 overflow-x-auto py-3 text-xs">
          {labels.map((label, i) => {
            const isCurrent = i === step;
            const reachable = i <= PLAN_STEP || (i <= PACKAGE_STEP ? hasPlan : hasPackage);
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

function StepFloorPlan({
  selectedId,
  possessive,
  onSelect,
}: {
  selectedId: string | null;
  possessive: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section>
      <StepHeading
        eyebrow={possessive}
        title="Choose Your Floor Plan"
        blurb="Every plan is built to order on a Mercedes Sprinter, and every price includes the van. Pick the layout that fits how you travel."
      />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {FLOOR_PLANS.map((plan) => {
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
                <Image
                  src={plan.image}
                  alt={`${plan.name} layout`}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="object-cover"
                />
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
                <p className="mt-4 text-sm font-bold text-navy">
                  Starts at {formatPrice(plan.basePrice)}
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
        blurb="Take a closer look at the layout from every angle before you choose a package."
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
          Choose Your Package →
        </button>
      </div>
    </section>
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
  const packages = getPackages(floorPlanId);
  const plan = getFloorPlan(floorPlanId);

  return (
    <section>
      <StepHeading
        eyebrow="Step 4"
        title="Choose Your Package"
        blurb={`Every package below is pre-configured to fit the ${plan?.name}. You can change any individual option afterward.`}
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
              <ul className="mt-5 space-y-1.5 text-sm flex-1">
                {pkg.defaults.length === 0 && (
                  <li className="text-steel">The core build, nothing added.</li>
                )}
                {pkg.defaults.slice(0, 6).map((id) => (
                  <li key={id} className="flex gap-2 text-charcoal">
                    <span className="text-gold font-bold">✓</span>
                    <span>{getOption(id)?.name}</span>
                  </li>
                ))}
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

function StepCategory({
  category,
  floorPlanId,
  selected,
  onToggle,
}: {
  category: (typeof CATEGORIES)[number];
  floorPlanId: string;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Option | null>(null);

  const options = optionsFor(category.id, floorPlanId);
  const included = options.filter((o) => o.type === "included");
  const upgrades = options.filter((o) => o.type === "upgrade");
  const addons = options.filter((o) => o.type === "addon");

  return (
    <section>
      <StepHeading eyebrow={category.name} title={category.name} blurb={category.blurb} />

      {included.length > 0 && (
        <OptionGroup title="Included in your build">
          {included.map((o) => (
            <IncludedRow
              key={o.id}
              option={o}
              superseded={isSuperseded(o.id, selected)}
              onExpand={setExpanded}
            />
          ))}
        </OptionGroup>
      )}

      {upgrades.length > 0 && (
        <OptionGroup title="Upgrade options">
          {upgrades.map((o) => (
            <OptionRow
              key={o.id}
              option={o}
              checked={selected.includes(o.id)}
              selected={selected}
              onToggle={onToggle}
              onExpand={setExpanded}
            />
          ))}
        </OptionGroup>
      )}

      {addons.length > 0 && (
        <OptionGroup title="A la carte add-ons">
          {addons.map((o) => (
            <OptionRow
              key={o.id}
              option={o}
              checked={selected.includes(o.id)}
              selected={selected}
              onToggle={onToggle}
              onExpand={setExpanded}
            />
          ))}
        </OptionGroup>
      )}

      <Lightbox option={expanded} onClose={() => setExpanded(null)} />
    </section>
  );
}

function StepSummary({
  build,
  breakdown,
  possessive,
  firstName,
}: {
  build: BuildState;
  breakdown: ReturnType<typeof priceBuild>;
  possessive: string;
  firstName: string;
}) {
  const plan = getFloorPlan(build.floorPlanId!);
  const pkg = getPackages(build.floorPlanId!).find((p) => p.id === build.packageId);

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
            <p className="text-sm text-steel">{pkg?.name} package</p>
          </div>
          <p className="text-sm text-steel">Base {formatPrice(breakdown.base)}</p>
        </div>

        {breakdown.packageDelta > 0 && (
          <LineItem
            label={`${pkg?.name} package`}
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
            PDF generation and HubSpot lead capture land in the next phase.
          </p>
          <button
            disabled
            className="mt-4 px-8 py-3 rounded bg-gold text-navy text-sm font-bold uppercase tracking-wide opacity-50 cursor-not-allowed"
          >
            Get My Build Sheet (PDF)
          </button>
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

function OptionGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <h3 className="text-xs font-bold uppercase tracking-widest text-steel mb-3">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

/**
 * Square 1:1 slot so rows stay aligned whether or not an image exists yet.
 * Clicking expands into the lightbox. Because these sit inside the option's
 * <label>, the click must be stopped from toggling the checkbox.
 */
function OptionThumb({
  option,
  onExpand,
}: {
  option: Option;
  onExpand?: (option: Option) => void;
}) {
  const base =
    "shrink-0 w-20 h-20 rounded-md overflow-hidden bg-white border border-black/10 relative";

  if (!option.thumb) {
    return (
      <div className={`${base} grid place-items-center`}>
        <span className="text-steel/40 text-2xl font-bold">
          {option.name.charAt(0)}
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onExpand?.(option);
      }}
      aria-label={`Expand photo of ${option.name}`}
      className={`${base} group cursor-zoom-in hover:border-sky transition-colors`}
    >
      <Image src={option.thumb} alt="" fill sizes="80px" className="object-contain p-1" />
      <span className="absolute inset-0 bg-navy/0 group-hover:bg-navy/10 transition-colors" />
      <span className="absolute bottom-1 right-1 w-5 h-5 rounded bg-navy/75 text-white text-[11px] leading-5 text-center opacity-0 group-hover:opacity-100 transition-opacity">
        ⤢
      </span>
    </button>
  );
}

function Lightbox({
  option,
  onClose,
}: {
  option: Option | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!option) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [option, onClose]);

  if (!option?.thumb) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={option.name}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-navy/80 backdrop-blur-sm grid place-items-center p-4 animate-[fadeIn_150ms_ease-out]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg max-w-2xl w-full overflow-hidden"
      >
        <div className="relative aspect-square max-h-[60vh] bg-white">
          <Image
            src={option.thumb}
            alt={option.name}
            fill
            sizes="(max-width: 768px) 100vw, 672px"
            className="object-contain p-6"
          />
        </div>
        <div className="flex items-start gap-4 p-5 border-t border-black/10">
          <div className="flex-1">
            <p className="brand-heading text-lg">{option.name}</p>
            {option.description && (
              <p className="text-sm text-steel mt-1">{option.description}</p>
            )}
            <p className="text-xs text-steel/70 mt-2">
              Representative product photo. Final components confirmed at build
              consultation.
            </p>
          </div>
          <button
            onClick={onClose}
            autoFocus
            aria-label="Close"
            className="shrink-0 px-4 py-2 rounded bg-navy text-white text-xs font-bold uppercase tracking-wide hover:bg-navy-deep transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function IncludedRow({
  option,
  superseded,
  onExpand,
}: {
  option: Option;
  superseded: boolean;
  onExpand: (option: Option) => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 bg-white rounded-lg p-4 ${
        superseded ? "opacity-45" : ""
      }`}
    >
      <span className="text-gold font-bold">✓</span>
      <OptionThumb option={option} onExpand={onExpand} />
      <div className="flex-1">
        <p
          className={`font-semibold text-charcoal ${superseded ? "line-through" : ""}`}
        >
          {option.name}
        </p>
        {option.description && (
          <p className="text-sm text-steel">{option.description}</p>
        )}
        {superseded && (
          <p className="text-xs text-sky mt-1">Replaced by your selected upgrade</p>
        )}
      </div>
      <span className="text-sm text-steel whitespace-nowrap">Included</span>
    </div>
  );
}

function OptionRow({
  option,
  checked,
  selected,
  onToggle,
  onExpand,
}: {
  option: Option;
  checked: boolean;
  selected: string[];
  onToggle: (id: string) => void;
  onExpand: (option: Option) => void;
}) {
  const requirement = option.requires?.[0];
  const requirementName = requirement ? getOption(requirement)?.name : undefined;
  const requirementMissing = Boolean(requirement && !selected.includes(requirement));

  return (
    <label
      className={`flex items-center gap-3 bg-white rounded-lg p-4 cursor-pointer border-2 transition-colors ${
        checked ? "border-gold" : "border-transparent hover:border-sky/40"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(option.id)}
        className="h-4 w-4 accent-[#303c47]"
      />
      <OptionThumb option={option} onExpand={onExpand} />
      <div className="flex-1">
        <p className="font-semibold text-charcoal">{option.name}</p>
        {option.description && (
          <p className="text-sm text-steel">{option.description}</p>
        )}
        {requirementName && requirementMissing && (
          <p className="text-xs text-sky mt-1">
            Selecting this will also add {requirementName}
          </p>
        )}
      </div>
      <span className="text-sm font-bold text-navy whitespace-nowrap">
        +{formatPrice(option.price)}
      </span>
    </label>
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
