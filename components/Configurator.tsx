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
  type Option,
} from "@/lib/catalog";
import {
  EMPTY_BUILD,
  applyPackage,
  decodeBuild,
  encodeBuild,
  formatPrice,
  isSuperseded,
  priceBuild,
  setFloorPlan,
  toggleOption,
  type BuildState,
} from "@/lib/pricing";

/** Step 0 = floor plan, 1 = package, 2..10 = categories, 11 = summary. */
const CATEGORY_STEP_OFFSET = 2;
const TOTAL_STEPS = CATEGORY_STEP_OFFSET + CATEGORIES.length + 1;
const SUMMARY_STEP = TOTAL_STEPS - 1;

export default function Configurator() {
  const [build, setBuild] = useState<BuildState>(EMPTY_BUILD);
  const [step, setStep] = useState(0);

  // Restore a shared build from the URL on first paint.
  useEffect(() => {
    const restored = decodeBuild(
      new URLSearchParams(window.location.search).get("b"),
    );
    if (restored.floorPlanId) {
      setBuild(restored);
      setStep(restored.packageId ? CATEGORY_STEP_OFFSET : 1);
    }
  }, []);

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

  const canAdvance = step === 0 ? Boolean(build.floorPlanId) : Boolean(build.packageId);

  const goTo = useCallback((next: number) => {
    setStep(Math.max(0, Math.min(SUMMARY_STEP, next)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <div className="flex flex-col min-h-screen pb-28">
      <Header />
      <Hero />

      {build.floorPlanId && (
        <Stepper step={step} onJump={goTo} hasPackage={Boolean(build.packageId)} />
      )}

      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-10">
        {step === 0 && (
          <StepFloorPlan
            selectedId={build.floorPlanId}
            onSelect={(id) => {
              setBuild((b) => setFloorPlan(b, id));
              goTo(1);
            }}
          />
        )}

        {step === 1 && build.floorPlanId && (
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
          <StepSummary build={build} breakdown={breakdown} />
        )}

        {step > 0 && (
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
                {step === 1 ? "Customize Your Build" : "Next"} →
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

function Stepper({
  step,
  onJump,
  hasPackage,
}: {
  step: number;
  onJump: (n: number) => void;
  hasPackage: boolean;
}) {
  const labels = [
    "Floor Plan",
    "Package",
    ...CATEGORIES.map((c) => c.name),
    "Build Sheet",
  ];

  return (
    <nav
      aria-label="Build steps"
      className="bg-white border-b border-black/10 sticky top-0 z-20"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <ol className="flex gap-1 overflow-x-auto py-3 text-xs">
          {labels.map((label, i) => {
            const isCurrent = i === step;
            const reachable = i <= 1 || hasPackage;
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
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section>
      <StepHeading
        eyebrow="Step 1"
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
        eyebrow="Step 2"
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
            />
          ))}
        </OptionGroup>
      )}
    </section>
  );
}

function StepSummary({
  build,
  breakdown,
}: {
  build: BuildState;
  breakdown: ReturnType<typeof priceBuild>;
}) {
  const plan = getFloorPlan(build.floorPlanId!);
  const pkg = getPackages(build.floorPlanId!).find((p) => p.id === build.packageId);

  return (
    <section>
      <StepHeading
        eyebrow="Almost done"
        title="Your Build Sheet"
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

function IncludedRow({
  option,
  superseded,
}: {
  option: Option;
  superseded: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-3 bg-white rounded-lg p-4 ${
        superseded ? "opacity-45" : ""
      }`}
    >
      <span className="text-gold font-bold mt-0.5">✓</span>
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
}: {
  option: Option;
  checked: boolean;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const requirement = option.requires?.[0];
  const requirementName = requirement ? getOption(requirement)?.name : undefined;
  const requirementMissing = Boolean(requirement && !selected.includes(requirement));

  return (
    <label
      className={`flex items-start gap-3 bg-white rounded-lg p-4 cursor-pointer border-2 transition-colors ${
        checked ? "border-gold" : "border-transparent hover:border-sky/40"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(option.id)}
        className="mt-1 h-4 w-4 accent-[#303c47]"
      />
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
