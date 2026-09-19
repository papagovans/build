import {
  defaultColors,
  getColorChoice,
  getOption,
  getFloorPlan,
  getPackages,
  isAvailable,
  type Catalog,
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
  /** groupId -> choiceId. Exactly one choice per colour group, always. */
  colors: Record<string, string>;
}

/**
 * An empty build for a given catalog. This used to be a module constant, but
 * the colour defaults now come from whatever the shop has published, so it has
 * to be built per catalog.
 */
export function emptyBuild(catalog: Catalog): BuildState {
  return {
    floorPlanId: null,
    packageId: null,
    selected: [],
    colors: defaultColors(catalog),
  };
}

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
  colors: { group: string; choice: string; price: number }[];
  total: number;
}

export function priceBuild(catalog: Catalog, state: BuildState): PriceBreakdown {
  const plan = state.floorPlanId ? getFloorPlan(catalog, state.floorPlanId) : undefined;
  const base = plan?.basePrice ?? 0;

  const pkg =
    state.floorPlanId && state.packageId
      ? getPackages(catalog, state.floorPlanId).find((p) => p.id === state.packageId)
      : undefined;
  const packageDelta = pkg?.priceDelta ?? 0;

  const upgrades: PriceBreakdown["upgrades"] = [];
  const addons: PriceBreakdown["addons"] = [];

  for (const id of state.selected) {
    const option = getOption(catalog, id);
    if (!option) continue;
    if (option.type === "upgrade") upgrades.push({ option, price: option.price });
    else if (option.type === "addon") addons.push({ option, price: option.price });
  }

  const colors: PriceBreakdown["colors"] = [];
  for (const group of catalog.colorGroups) {
    const choiceId = state.colors?.[group.id];
    const choice = choiceId ? getColorChoice(catalog, group.id, choiceId) : undefined;
    if (choice) {
      colors.push({ group: group.name, choice: choice.name, price: choice.price });
    }
  }

  const extras = [...upgrades, ...addons, ...colors].reduce(
    (sum, e) => sum + e.price,
    0,
  );

  return {
    base,
    packageDelta,
    upgrades,
    addons,
    colors,
    total: base + packageDelta + extras,
  };
}

/**
 * Toggle an option, enforcing the compatibility rules.
 *
 * Selecting pulls in anything it `requires`, and drops anything it
 * `conflictsWith` or shares a `replaces` target with. Deselecting cascades to
 * options that required it, so you can never end up with a winch and no bumper.
 */
export function toggleOption(
  catalog: Catalog,
  state: BuildState,
  optionId: string,
): BuildState {
  const option = getOption(catalog, optionId);
  if (!option || !state.floorPlanId) return state;

  const selected = new Set(state.selected);

  if (selected.has(optionId)) {
    selected.delete(optionId);
    // Cascade: drop anything that depended on this.
    let changed = true;
    while (changed) {
      changed = false;
      for (const id of [...selected]) {
        const dependent = getOption(catalog, id);
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
      for (const other of catalog.options) {
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
      const required = getOption(catalog, requiredId);
      if (required && isAvailable(required, state.floorPlanId)) {
        selected.add(requiredId);
      }
    }
  }

  return { ...state, selected: [...selected] };
}

export function setColor(
  state: BuildState,
  groupId: string,
  choiceId: string,
): BuildState {
  return { ...state, colors: { ...state.colors, [groupId]: choiceId } };
}

/** Applying a package replaces the current selections with its defaults. */
export function applyPackage(
  catalog: Catalog,
  state: BuildState,
  floorPlanId: string,
  packageId: string,
): BuildState {
  const pkg = getPackages(catalog, floorPlanId).find((p) => p.id === packageId);
  return {
    floorPlanId,
    packageId,
    selected: pkg ? [...pkg.defaults] : [],
    colors: state.colors,
  };
}

/** Changing the floor plan drops selections that no longer fit. */
export function setFloorPlan(state: BuildState, floorPlanId: string): BuildState {
  if (state.floorPlanId === floorPlanId) return state;
  return { floorPlanId, packageId: null, selected: [], colors: state.colors };
}

/** An included item is superseded when an upgrade replacing it is selected. */
export function isSuperseded(
  catalog: Catalog,
  optionId: string,
  selected: string[],
): boolean {
  return selected.some((id) => getOption(catalog, id)?.replaces === optionId);
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
  const colors = Object.entries(state.colors ?? {})
    .map(([g, c]) => `${g}:${c}`)
    .join(",");
  return [
    state.floorPlanId,
    state.packageId ?? "",
    state.selected.join("."),
    colors,
  ].join("~");
}

export function decodeBuild(catalog: Catalog, raw: string | null): BuildState {
  if (!raw) return emptyBuild(catalog);
  const [floorPlanId, packageId, selectedRaw, colorsRaw] = raw.split("~");
  if (!floorPlanId || !getFloorPlan(catalog, floorPlanId)) return emptyBuild(catalog);

  const selected = (selectedRaw ?? "")
    .split(".")
    .filter(Boolean)
    .filter((id) => {
      const option = getOption(catalog, id);
      return option && isAvailable(option, floorPlanId);
    });

  const colors = defaultColors(catalog);
  for (const pair of (colorsRaw ?? "").split(",").filter(Boolean)) {
    const [groupId, choiceId] = pair.split(":");
    if (groupId && choiceId && getColorChoice(catalog, groupId, choiceId)) {
      colors[groupId] = choiceId;
    }
  }

  return { floorPlanId, packageId: packageId || null, selected, colors };
}
