/**
 * Build Sheet PDF.
 *
 * Rendered server-side only, from `app/api/build-sheet/route.ts`. Keeping it
 * off the client means @react-pdf/renderer never ships in the browser bundle.
 *
 * The sheet is organized by system (Electricity, Plumbing, ...) rather than by
 * option type, because that is how a buyer and a shop foreman both read it.
 * The pricing math still comes from `priceBuild()`, so the PDF total and the
 * on-screen total can never drift.
 */
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import {
  getColorChoice,
  getFloorPlan,
  getPackages,
  optionsFor,
  type Catalog,
} from "./catalog";
import {
  formatPrice,
  isSuperseded,
  priceBuild,
  type BuildState,
  type Customer,
} from "./pricing";

const NAVY = "#303C47";
const GOLD = "#F4D969";
const STEEL = "#53687B";
const CREAM = "#FCFAF3";

const s = StyleSheet.create({
  page: { paddingTop: 0, paddingBottom: 56, fontSize: 9, color: NAVY },
  band: { backgroundColor: NAVY, paddingHorizontal: 40, paddingVertical: 22 },
  wordmark: { fontSize: 18, letterSpacing: 3, color: "#FFFFFF" },
  wordmarkGold: { color: GOLD },
  bandSub: { marginTop: 4, fontSize: 8, letterSpacing: 2, color: GOLD },
  rule: { height: 3, backgroundColor: GOLD },

  body: { paddingHorizontal: 40, paddingTop: 20 },

  metaRow: { flexDirection: "row", justifyContent: "space-between" },
  metaLabel: { fontSize: 7, letterSpacing: 1, color: STEEL, marginBottom: 2 },
  metaValue: { fontSize: 10 },

  planBox: {
    marginTop: 18,
    padding: 14,
    backgroundColor: CREAM,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  planName: { fontSize: 15, letterSpacing: 1 },
  planTag: { marginTop: 3, fontSize: 8, color: STEEL, maxWidth: 300 },
  planPrice: { fontSize: 13 },
  planPriceNote: { fontSize: 7, color: STEEL, textAlign: "right", marginTop: 2 },

  section: { marginTop: 16 },
  sectionTitle: {
    fontSize: 9,
    letterSpacing: 1.5,
    color: NAVY,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: NAVY,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#E2E0DA",
  },
  rowName: { flex: 1, paddingRight: 16 },
  rowNote: { fontSize: 7, color: STEEL, marginTop: 1 },
  rowPrice: { width: 80, textAlign: "right" },
  included: { color: STEEL, fontSize: 8 },

  totals: { marginTop: 22, borderTopWidth: 2, borderTopColor: NAVY, paddingTop: 10 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grand: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  grandLabel: { fontSize: 11, letterSpacing: 1 },
  grandValue: { fontSize: 18 },
  vanNote: {
    marginTop: 10,
    padding: 10,
    backgroundColor: CREAM,
    fontSize: 8,
    color: STEEL,
    lineHeight: 1.5,
  },

  next: { marginTop: 26 },
  nextRow: { flexDirection: "row", paddingVertical: 4 },
  nextNum: { width: 18, color: STEEL },
  callout: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: NAVY,
    color: GOLD,
    fontSize: 10,
    letterSpacing: 0.5,
  },

  footer: {
    position: "absolute",
    bottom: 22,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: "#D8D6D0",
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: STEEL,
  },
});

interface Line {
  name: string;
  note?: string;
  price: number | null; // null renders as "Included"
}

/** Everything in one category: included items still in force, then what was added. */
function linesFor(
  catalog: Catalog,
  categoryId: string,
  build: BuildState,
): Line[] {
  const planId = build.floorPlanId!;
  const lines: Line[] = [];

  for (const option of optionsFor(catalog, categoryId, planId)) {
    const picked = build.selected.includes(option.id);
    if (option.type === "included") {
      if (!isSuperseded(catalog, option.id, build.selected)) {
        lines.push({ name: option.name, note: option.description, price: null });
      }
    } else if (picked) {
      lines.push({
        name: option.name,
        note: option.description,
        price: option.price,
      });
    }
  }

  for (const group of catalog.colorGroups.filter(
    (g) => g.categoryId === categoryId,
  )) {
    const choice = getColorChoice(
      catalog,
      group.id,
      build.colors?.[group.id] ?? "",
    );
    if (choice) {
      lines.push({
        name: `${group.name}: ${choice.name}`,
        price: choice.price || null,
      });
    }
  }

  return lines;
}

function BuildSheet({
  catalog,
  build,
  customer,
}: {
  catalog: Catalog;
  build: BuildState;
  customer: Customer;
}) {
  const plan = getFloorPlan(catalog, build.floorPlanId!)!;
  const pkg = getPackages(catalog, build.floorPlanId!).find(
    (p) => p.id === build.packageId,
  );
  const breakdown = priceBuild(catalog, build);
  const optionsTotal =
    breakdown.total - breakdown.base - breakdown.packageDelta;

  const name = [customer.firstName, customer.lastName]
    .map((v) => v.trim())
    .filter(Boolean)
    .join(" ");
  const dated = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Document
      title={`Papago Vans Build Sheet - ${plan.name}`}
      author="Papago Vans"
    >
      <Page size="LETTER" style={s.page}>
        <View style={s.band} fixed>
          <Text style={s.wordmark}>
            PAPAGO <Text style={s.wordmarkGold}>VANS</Text>
          </Text>
          <Text style={s.bandSub}>CUSTOM BUILD SHEET / MESA, ARIZONA</Text>
        </View>
        <View style={s.rule} fixed />

        <View style={s.body}>
          <View style={s.metaRow}>
            <View>
              <Text style={s.metaLabel}>PREPARED FOR</Text>
              <Text style={s.metaValue}>{name || "Guest build"}</Text>
              {[customer.email, customer.phone]
                .map((v) => v.trim())
                .filter(Boolean)
                .map((v) => (
                  <Text key={v} style={[s.metaValue, { fontSize: 8, color: STEEL }]}>
                    {v}
                  </Text>
                ))}
            </View>
            <View>
              <Text style={[s.metaLabel, { textAlign: "right" }]}>DATE</Text>
              <Text style={[s.metaValue, { textAlign: "right" }]}>{dated}</Text>
            </View>
          </View>

          <View style={s.planBox}>
            <View>
              <Text style={s.planName}>{plan.name.toUpperCase()}</Text>
              <Text style={s.planTag}>{plan.tagline}</Text>
              {pkg ? (
                <Text style={[s.planTag, { marginTop: 6 }]}>
                  {pkg.name} trim package: {pkg.tagline}
                </Text>
              ) : null}
            </View>
            <View>
              <Text style={s.planPrice}>{formatPrice(breakdown.total)}</Text>
              <Text style={s.planPriceNote}>estimated, van included</Text>
            </View>
          </View>

          {catalog.categories.map((category) => {
            const lines = linesFor(catalog, category.id, build);
            if (lines.length === 0) return null;
            return (
              <View key={category.id} style={s.section} wrap={false}>
                <Text style={s.sectionTitle}>{category.name.toUpperCase()}</Text>
                {lines.map((line, i) => (
                  <View key={`${line.name}-${i}`} style={s.row}>
                    <View style={s.rowName}>
                      <Text>{line.name}</Text>
                      {line.note ? <Text style={s.rowNote}>{line.note}</Text> : null}
                    </View>
                    <Text style={s.rowPrice}>
                      {line.price === null ? (
                        <Text style={s.included}>Included</Text>
                      ) : (
                        formatPrice(line.price)
                      )}
                    </Text>
                  </View>
                ))}
              </View>
            );
          })}

          <View style={s.totals} wrap={false}>
            <View style={s.totalRow}>
              <Text>{plan.name} base, Mercedes Sprinter van included</Text>
              <Text>{formatPrice(breakdown.base)}</Text>
            </View>
            {pkg && breakdown.packageDelta > 0 ? (
              <View style={s.totalRow}>
                <Text>{pkg.name} trim package</Text>
                <Text>{formatPrice(breakdown.packageDelta)}</Text>
              </View>
            ) : null}
            <View style={s.totalRow}>
              <Text>Upgrades and add-ons</Text>
              <Text>{formatPrice(optionsTotal)}</Text>
            </View>
            <View style={s.grand}>
              <Text style={s.grandLabel}>ESTIMATED BUILD TOTAL</Text>
              <Text style={s.grandValue}>{formatPrice(breakdown.total)}</Text>
            </View>
            <Text style={s.vanNote}>
              Van included. This estimate covers the Mercedes-Benz Sprinter
              chassis and the full conversion. Final pricing is confirmed after
              a build consultation. Prices and availability are subject to
              change.
            </Text>
          </View>

          {/* The totals land on their own page often enough that it is worth
              giving that page a job. */}
          <View style={s.next} wrap={false}>
            <Text style={s.sectionTitle}>WHAT HAPPENS NEXT</Text>
            {[
              "Bring this sheet to a build consultation, in the shop or over a call.",
              "We confirm the layout against your gear, your dog, and your height.",
              "Deposit reserves a build slot and locks this pricing.",
              "Build updates with photos, start to finish, all in-house in Mesa.",
            ].map((line, i) => (
              <View key={i} style={s.nextRow}>
                <Text style={s.nextNum}>{i + 1}</Text>
                <Text style={{ flex: 1 }}>{line}</Text>
              </View>
            ))}
            <Text style={s.callout}>
              Questions on anything here? Call (480) 724-8372.
            </Text>
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text>papagovans.com / Mesa, AZ / RVIA certified / veteran owned</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

export function renderBuildSheet(
  catalog: Catalog,
  build: BuildState,
  customer: Customer,
) {
  return renderToBuffer(
    <BuildSheet catalog={catalog} build={build} customer={customer} />,
  );
}

/** `Papago-Build-Sheet-El-Capitan-Suhrstedt.pdf` */
export function buildSheetFilename(
  catalog: Catalog,
  build: BuildState,
  customer: Customer,
) {
  const parts = [
    "Papago-Build-Sheet",
    getFloorPlan(catalog, build.floorPlanId!)?.name,
    customer.lastName,
  ];
  return `${parts
    .filter(Boolean)
    .join("-")
    .replace(/[^a-zA-Z0-9-]+/g, "-")}.pdf`;
}
