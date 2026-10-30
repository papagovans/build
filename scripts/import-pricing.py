"""Copies the van placeholder prices out of the master pricing workbook.

    python3 scripts/import-pricing.py "<Dropbox>/Papago Vans/van build pricing/papago-master-pricing.xlsx"

The workbook (owner, 2026-10-30) is the single source of truth for every
advertised price. This writes lib/pricing-data.json, which the builder reads.
Retail numbers only: costs and markup never leave the workbook, because this
repo is public. It carries the van prices and AWD (Chassis tab), every base
option and its retail (Base Options), every upgrade at what the buyer pays on
top (Upgrades), and the four packages (Packages, plus their columns on
Upgrades and Chassis).

Retail is worked out here from the workbook's inputs (qty, unit cost, install
hours, markup, Settings) with the same arithmetic as its formulas, because a
workbook saved by a script holds no calculated values until Excel saves it.

Needs openpyxl (pip3 install openpyxl).
"""
import json
import sys
from pathlib import Path

from openpyxl import load_workbook

# Workbook chassis code -> the builder's van id (the ?b= links use these).
VAN_IDS = {
    "S144": "sprinter-144",
    "S170": "sprinter-170",
    "S170X": "sprinter-170x",
    "T148": "transit-148",
    "T148X": "transit-148x",
    "P136": "promaster-136",
    "P159": "promaster-159",
    "P159X": "promaster-159x",
}

wb = load_workbook(sys.argv[1], data_only=True)
ws = wb["Chassis"]
head = {c.value: c.column for c in ws[4] if c.value}
code_col, price_col = head["Code"], head["Placeholder Price"]

vans = {}
for row in ws.iter_rows(min_row=5):
    code = row[code_col - 1].value
    if code in ("Van Options", "Code"):
        break  # the Van Options table starts here
    if not code:
        continue
    price = row[price_col - 1].value
    if code not in VAN_IDS:
        sys.exit(f"{code}: no builder id in VAN_IDS; add one")
    if not isinstance(price, (int, float)):
        sys.exit(f"{code}: Placeholder Price is not a number ({price!r})")
    vans[VAN_IDS[code]] = {"code": code, "price": round(price)}

missing = set(VAN_IDS.values()) - set(vans)
if missing:
    sys.exit(f"workbook has no row for {', '.join(sorted(missing))}")

# Base options retail: qty x (unit cost + install hrs x labor) x (1 + markup),
# summed over every row that fits All, plus the rows for that size.
st = wb["Settings"]
markup, labor = st["B4"].value or 0, st["B5"].value or 0
bo = wb["Base Options"]
cols = {c.value: c.column - 1 for c in bo[4] if c.value}
def retail_of(qty, unit, hrs, m):
    return (qty or 0) * ((unit or 0) + (hrs or 0) * labor) * (1 + (markup if m is None else m))


base = {"short": 0.0, "long": 0.0}
base_items, base_retail = [], {}
for row in bo.iter_rows(min_row=5, values_only=True):
    code = row[cols["Code"]]
    if not code:
        continue
    retail = retail_of(row[cols["Qty"]], row[cols["Unit Cost"]], row[cols["Install Hrs"]], row[cols["Markup %"]])
    fits = row[cols["Fits"]]
    base_retail[code] = retail
    for size in base:
        if fits in ("All", size.capitalize()):
            base[size] += retail
    base_items.append({
        "code": code, "category": row[cols["Category"]], "name": row[cols["Description"]],
        "manufacturer": row[cols["Manufacturer"]] or "", "model": row[cols["Model #"]] or "",
        "fits": fits, "qty": row[cols["Qty"]], "retail": round(retail),
    })
base = {k: round(v) for k, v in base.items()}

# Upgrades: what the buyer pays on top, i.e. retail less the base line it
# replaces, and how many of each the four packages carry.
TIERS = ["McKinley", "Zion", "Olympus", "El Capitan"]
up = wb["Upgrades"]
ucols = {c.value: c.column - 1 for c in up[4] if c.value}
upgrades, package_upgrades = [], {t: [] for t in TIERS}
for row in up.iter_rows(min_row=5, values_only=True):
    code = row[ucols["Code"]]
    if not code:
        continue
    replaces = row[ucols["Replaces"]] or None
    pays = retail_of(1, row[ucols["Unit Cost"]], row[ucols["Install Hrs"]], row[ucols["Markup %"]]) - (base_retail.get(replaces, 0) if replaces else 0)
    upgrades.append({
        "code": code, "category": row[ucols["Category"]], "name": row[ucols["Description"]],
        "manufacturer": row[ucols["Manufacturer"]] or "", "model": row[ucols["Model #"]] or "",
        "replaces": replaces, "fits": row[ucols["Fits"]], "price": round(pays),
    })
    for t in TIERS:
        if row[ucols[t]]:
            package_upgrades[t].append(code)

# Van options (AWD) and which packages carry them.
vo_head = next(r for r in ws.iter_rows(min_row=5) if r[0].value == "Code")
vcols = {c.value: c.column - 1 for c in vo_head if c.value}
van_options, package_vo = [], {t: [] for t in TIERS}
for row in ws.iter_rows(min_row=vo_head[0].row + 1, values_only=True):
    if not row[vcols["Code"]]:
        continue
    van_options.append({"code": row[vcols["Code"]], "name": row[vcols["Option"]], "fits": row[vcols["Fits"]], "price": round(row[vcols["Placeholder Price"]] or 0)})
    for t in TIERS:
        if row[vcols[t]]:
            package_vo[t].append(row[vcols["Code"]])

pk = wb["Packages"]
labels = {r[0].value: r for r in pk.iter_rows(min_row=5) if r[0].value}
packages = []
for i, t in enumerate(TIERS):
    chassis = labels["Chassis"][1 + i].value
    if chassis not in VAN_IDS:
        sys.exit(f"{t}: chassis {chassis!r} has no builder id")
    packages.append({
        "slug": t.lower().replace(" ", "-"), "name": t, "tagline": labels["Tagline"][1 + i].value,
        "van": VAN_IDS[chassis], "vanOptions": package_vo[t], "upgrades": package_upgrades[t],
        "layout": labels["Builder layout code"][1 + i].value or None,
    })
if not base["short"]:
    sys.exit("Base Options retail came to $0: fill in the costs first")

out = Path(__file__).resolve().parent.parent / "lib" / "pricing-data.json"
out.write_text(json.dumps({
    "source": Path(sys.argv[1]).name, "vans": vans, "vanOptions": van_options, "base": base,
    "baseItems": base_items, "upgrades": upgrades, "packages": packages,
}, indent=2) + "\n")
for vid, v in vans.items():
    print(f"{v['code']:6} {vid:15} ${v['price']:,}")
print(f"base options retail: short ${base['short']:,}, long ${base['long']:,} ({len(base_items)} items)")
print(f"{len(upgrades)} upgrades, {len(van_options)} van options")
for p in packages:
    print(f"{p['name']:11} {p['van']:15} {len(p['upgrades'])} upgrades, van options {p['vanOptions']}, layout {p['layout']}")
print(f"wrote {out}")
