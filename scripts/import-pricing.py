"""Copies the van placeholder prices out of the master pricing workbook.

    python3 scripts/import-pricing.py "<Dropbox>/Papago Vans/van build pricing/papago-master-pricing.xlsx"

The workbook (owner, 2026-10-30) is the single source of truth for every
advertised price. This writes lib/pricing-data.json, which the builder reads.
Retail numbers only: costs and markup never leave the workbook, because this
repo is public. Today it carries the Chassis tab; base options and upgrades
join once management signs off their costs.

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

ws = load_workbook(sys.argv[1], data_only=True)["Chassis"]
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

out = Path(__file__).resolve().parent.parent / "lib" / "pricing-data.json"
out.write_text(json.dumps({"source": Path(sys.argv[1]).name, "vans": vans}, indent=2) + "\n")
for vid, v in vans.items():
    print(f"{v['code']:6} {vid:15} ${v['price']:,}")
print(f"wrote {out}")
