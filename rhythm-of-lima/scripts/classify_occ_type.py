#!/usr/bin/env python3
"""
Derives each Lima building footprint's occupancy classification from the
raw OpenStreetMap export (LIMA_Footprints.csv: osm_id, code, fclass, name,
type, Shape_Length, Shape_Area, AREA_M2), which has no occupancy data at
all — only geometry and OSM tags.

Output columns, one row per building:
  osm_id    unique building id (already present in the source data)
  OCC_TYPE  use category, e.g. "residential", "office", "hospitality"
  PEAK_HR   the hour (0-24, real number) this specific building's activity
            peaks at — a real, inspectable number per building, the same
            role CNSTRCT_YR plays in Esri's own "Animate color visual
            variable" sample
  OCC_MAX   this building's peak occupancy intensity (0-100)

PEAK_HR and OCC_MAX are each category's typical value (CATEGORY_PROFILES
below) plus a small deterministic jitter seeded by the building's own
osm_id, so buildings in the same category don't all peak at the exact same
minute — computed once here and stored, not recomputed at render time.
OCC_TYPE is still carried along because the app's Arcade expression uses it
to look up how WIDE this building's activity peak is and its baseline
floor (see CATEGORY_PROFILES in src/occupancy.ts, which must match the
table below) — those two shape parameters aren't stored per-building since
they're roughly constant within a category.

Classification (OCC_TYPE) priority per building:
  1. Its OSM `type` tag, if set (~25% of buildings).
  2. A keyword match against its `name`, if set (~1% of buildings) — catches
     named landmarks (hotels, hospitals, markets, churches...) that have no
     `type` tag.
  3. A fallback based on footprint area (AREA_M2), for the ~74% of
     buildings with neither: small footprints default to residential;
     larger ones are split between office/retail/industrial using a
     deterministic pseudo-random value seeded by osm_id (reproducible, not
     random noise redrawn on every run).

Usage:
    python3 classify_occ_type.py LIMA_Footprints.csv LIMA_OCC_TYPE.csv
"""
import csv
import re
import sys
from collections import Counter

TYPE_MAP = {
    "house": "residential", "residential": "residential", "detached": "residential",
    "terrace": "residential", "apartments": "residential",
    "office": "office",
    "school": "education", "university": "education", "college": "education", "kindergarten": "education",
    "hospital": "healthcare", "clinic": "healthcare",
    "hotel": "hospitality",
    "industrial": "industrial", "warehouse": "industrial", "hangar": "industrial",
    "garage": "industrial", "construction": "industrial", "service": "industrial",
    "church": "religious", "chapel": "religious",
    "public": "civic_transit", "civic": "civic_transit", "train_station": "civic_transit",
    "grandstand": "civic_transit", "museum": "civic_transit", "historic": "civic_transit",
    "commercial": "retail_food", "retail": "retail_food", "restaurant": "retail_food", "kiosk": "retail_food",
    "roof": "other", "ruins": "other", "hut": "other", "shed": "other", "carport": "other",
    "barn": "other", "stable": "other", "farm_auxiliary": "other",
}

# Name keyword -> category (checked case-insensitively, Spanish + English).
NAME_KEYWORDS = [
    (r"hotel|hostal|resort", "hospitality"),
    (r"hospital|cl[ií]nica|posta m[eé]dica|centro m[eé]dico", "healthcare"),
    (r"museo|monumento|catedral hist[oó]rica", "civic_transit"),
    (r"colegio|escuela|universidad|instituto|academia|jard[ií]n de ni[ñn]os", "education"),
    (r"mercado|supermercado|plaza vea|tottus|metro\b|centro comercial|\bmall\b|tienda|open plaza|real plaza", "retail_food"),
    (r"restaurante|cevicher[ií]a|poller[ií]a|caf[eé]\b", "retail_food"),
    (r"iglesia|parroquia|capilla|catedral", "religious"),
    (r"banco\b|financiera", "office"),
    (r"estaci[oó]n|terminal|aeropuerto", "civic_transit"),
    (r"f[aá]brica|planta industrial|almac[eé]n", "industrial"),
    (r"municipalidad|ministerio|comisar[ií]a|gobierno", "civic_transit"),
    (r"estadio|coliseo", "civic_transit"),
]
NAME_PATTERNS = [(re.compile(p, re.IGNORECASE), cat) for p, cat in NAME_KEYWORDS]

# Base (peakHour, peakOccMax) per category — must match CATEGORY_PROFILES'
# peak/max in src/occupancy.ts. width/floor stay there since they're
# looked up by OCC_TYPE at render time, not stored per building.
CATEGORY_BASE = {
    "residential": (1, 70),
    "office": (12.5, 85),
    "education": (10, 90),
    "healthcare": (14, 90),
    "hospitality": (22, 80),
    "industrial": (11, 70),
    "religious": (9.5, 60),
    "civic_transit": (8.5, 75),
    "retail_food": (13.5, 85),
    "other": (12, 30),
}


def det_rand(seed: int) -> float:
    """Deterministic pseudo-random value in [0, 1) from an integer seed
    (classic linear-congruential formula) — same building always gets the
    same jitter across re-runs, without storing an RNG seed anywhere."""
    x = (seed * 9301 + 49297) % 233280
    return x / 233280


def classify_type(osm_id: int, osm_type: str, name: str, area: float) -> str:
    if osm_type in TYPE_MAP:
        return TYPE_MAP[osm_type]
    if name:
        for pattern, category in NAME_PATTERNS:
            if pattern.search(name):
                return category
    r = det_rand(osm_id)
    if area <= 300:
        return "residential"
    if area <= 800:
        return "residential" if r < 0.7 else ("office" if r < 0.85 else "retail_food")
    return "office" if r < 0.45 else ("retail_food" if r < 0.8 else "industrial")


def peak_hour_and_max(osm_id: int, occ_type: str) -> tuple[float, float]:
    base_peak, base_max = CATEGORY_BASE[occ_type]
    r1 = det_rand(osm_id)
    r2 = det_rand(osm_id * 7 + 13)
    peak_hr = (base_peak + (r1 * 2 - 1) * 1.5) % 24
    occ_max = max(0.0, min(100.0, base_max + (r2 * 2 - 1) * 10))
    return round(peak_hr, 2), round(occ_max, 1)


def main() -> None:
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <input LIMA_Footprints.csv> <output CSV>", file=sys.stderr)
        sys.exit(1)

    in_path, out_path = sys.argv[1], sys.argv[2]
    counts: Counter = Counter()

    with open(in_path, encoding="utf-8-sig") as f_in, open(out_path, "w", newline="", encoding="utf-8") as f_out:
        reader = csv.DictReader(f_in)
        writer = csv.writer(f_out)
        writer.writerow(["osm_id", "OCC_TYPE", "PEAK_HR", "OCC_MAX"])

        n = 0
        for row in reader:
            osm_id = int(row["osm_id"])
            occ_type = classify_type(
                osm_id,
                row.get("type", "").strip(),
                row.get("name", "").strip(),
                float(row.get("AREA_M2", 0) or 0),
            )
            peak_hr, occ_max = peak_hour_and_max(osm_id, occ_type)
            writer.writerow([osm_id, occ_type, peak_hr, occ_max])
            counts[occ_type] += 1
            n += 1

    print(f"Classified {n} buildings -> {out_path}")
    for category, count in counts.most_common():
        print(f"  {category:15s} {count:7d} ({count / n * 100:.1f}%)")


if __name__ == "__main__":
    main()
