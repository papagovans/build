import {
  OPTIONS,
  getOption,
  getFloorPlan,
  getPackages,
  isAvailable,
  type Option,
} from "./catalog";

export interface Customer {
  firstName: string;
  lastName: string;
  email: string;
}

export interface BuildState {
  floorPlanId: string | null;
  packageId: string | null;
  /** Selected upgrade and add-on ids. Included items are implicit. */
  selected: string[];
}

export const EMPTY_BUILD: BuildState = {
  floorPlanId: null,
  packageId: null,
  selected: [],
};

export const EMPTY_CUSTOMER: Customer = {
  firstName: "",
  lastName: "",
  email: "",
};

/** Basic shape check only. Real validation happens server-side at submit. */
export function isValidCustomer(c: Customer): boolean {
  return (
    c.firstName.trim().length > 0 &&
    c.lastName.trim().length > 0 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.email.trim())
  );
}

export interface PriceBreakdown {
  base: number;
  packageDelta: number;
  upgrades: { option: Option; price: number }[];
  addons: { option: Option; price: number }[];
  total: number;
}

export function priceBuild(state: BuildState): PriceBreakdown {
  const plan = state.floorPlanId ? getFloorPlan(state.floorPlanId) : undefined;
  const base = plan?.basePrice ?? 0;

  const pkg = state.floorPlanId && state.packageId
    ? getPackages(state.floorPlanId).find((p) => p.id === state.packageId)
    : undefined;
  const packageDelta = pkg?.priceDelta ?? 0;

  const upgrades: PriceBreakdown["upgrades"] = [];
  const addons: PriceBreakdown["addons"] = [];

  for (const id of state.selected) {
    const option = getOption(id);
    if (!option) continue;
    if (option.type === "upgrade") upgrades.push({ option, price: option.price });
    else if (option.type === "addon") addons.push({ option, price: option.price });
  }

  const extras = [...upgrades, ...addons].reduce((sum, e) => sum + e.price, 0);

  return { base, packageDelta, upgrades, addons, total: base + packageDelta + extras };
}

/**
 * Toggle an option, enforcing the compatibility rules.
 *
 * Selecting pulls in anything it `requires`, and drops anything it
 * `conflictsWith` or shares a `replaces` target with. Deselecting cascades to
 * options that required it, so you can never end up with a winch and no bumper.
 */
export function toggleOption(
  state: BuildState,
  optionId: string,
): BuildState {
  const option = getOption(optionId);
  if (!option || !state.floorPlanId) return state;

  const selected = new Set(state.selected);

  if (selected.has(optionId)) {
    selected.delete(optionId);
    // Cascade: drop anything that depended on this.
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of [...selected]) {
        const dependent = getOption(id);
        if (dependent?.requires?.some((req) => !selected.has(req))) {
          selected.delete(id);
          changed = true;
        }
      }
    }
  } else {
    selected.add(optionId);

    for (const conflictId of option.conflictsWith ?? []) {
      selected.delete(conflictId);
    }

    // Two upgrades replacing the same base item are mutually exclusive.
    if (option.replaces) {
      for (const other of OPTIONS) {
        if (
          other.id !== option.id &&
          other.replaces === option.replaces &&
          selected.has(other.id)
        ) {
          selected.delete(other.id);
        }
      }
    }

    for (const requiredId of option.requires ?? []) {
      const required = getOption(requiredId);
      if (required && isAvailable(required, state.floorPlanId)) {
        selected.add(requiredId);
      }
    }
  }

  return { ...state, selected: [...selected] };
}

/** Applying a package replaces the current selections with its defaults. */
export function applyPackage(
  state: BuildState,
  floorPlanId: string,
  packageId: string,
): BuildState {
  const pkg = getPackages(floorPlanId).find((p) => p.id === packageId);
  return {
    floorPlanId,
    packageId,
    selected: pkg ? [...pkg.defaults] : [],
  };
}

/** Changing the floor plan drops selections that no longer fit. */
export function setFloorPlan(state: BuildState, floorPlanId: string): BuildState {
  if (state.floorPlanId === floorPlanId) return state;
  return { floorPlanId, packageId: null, selected: [] };
}

/** An included item is superseded when an upgrade replacing it is selected. */
export function isSuperseded(optionId: string, selected: string[]): boolean {
  return selected.some((id) => getOption(id)?.replaces === optionId);
}

export function formatPrice(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

// ---------------------------------------------------------------------------
// URL state. Keeps builds shareable and resumable with no database.
// ---------------------------------------------------------------------------

export function encodeBuild(state: BuildState): string {
  if (!state.floorPlanId) return "";
  return [state.floorPlanId, state.packageId ?? "", state.selected.join(".")]
    .join("~");
}

export function decodeBuild(raw: string | null): BuildState {
  if (!raw) return EMPTY_BUILD;
  const [floorPlanId, packageId, selectedRaw] = raw.split("~");
  if (!floorPlanId || !getFloorPlan(floorPlanId)) return EMPTY_BUILD;

  const selected = (selectedRaw ?? "")
    .split(".")
    .filter(Boolean)
    .filter((id) => {
      const option = getOption(id);
      return option && isAvailable(option, floorPlanId);
    });

  return { floorPlanId, packageId: packageId || null, selected };
}
