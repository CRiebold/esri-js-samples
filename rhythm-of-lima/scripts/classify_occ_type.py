#!/usr/bin/env python3
"""
Classifies each Lima building footprint into one OCC_TYPE use category,
from the raw OpenStreetMap export (LIMA_Footprints.csv: osm_id, code,
fclass, name, type, Shape_Length, Shape_Area, AREA_M2).

This replaces the app's old per-building 24-hour occupancy fields
(OCC_00..OCC_23) with a single classification field. The full daily
occupancy curve for each category is computed live in the app's Arcade
expression (see CATEGORY_PROFILES in src/occupancy.ts) — this script only
needs to decide which of the ~10 categories each building belongs to.

Priority order per building:
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

Output columns: osm_id, OCC_TYPE
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


def det_rand(seed: int) -> float:
    """Deterministic pseudo-random value in [0, 1) from an integer seed
    (classic linear-congruential formula) — same building always gets the
    same fallback category across re-runs, without storing extra data."""
    x = (seed * 9301 + 49297) % 233280
    return x / 233280


def classify(osm_id: int, osm_type: str, name: str, area: float) -> str:
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


def main() -> None:
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} <input LIMA_Footprints.csv> <output CSV>", file=sys.stderr)
        sys.exit(1)

    in_path, out_path = sys.argv[1], sys.argv[2]
    counts: Counter = Counter()

    with open(in_path, encoding="utf-8-sig") as f_in, open(out_path, "w", newline="", encoding="utf-8") as f_out:
        reader = csv.DictReader(f_in)
        writer = csv.writer(f_out)
        writer.writerow(["osm_id", "OCC_TYPE"])

        n = 0
        for row in reader:
            osm_id = int(row["osm_id"])
            occ_type = classify(
                osm_id,
                row.get("type", "").strip(),
                row.get("name", "").strip(),
                float(row.get("AREA_M2", 0) or 0),
            )
            writer.writerow([osm_id, occ_type])
            counts[occ_type] += 1
            n += 1

    print(f"Classified {n} buildings -> {out_path}")
    for category, count in counts.most_common():
        print(f"  {category:15s} {count:7d} ({count / n * 100:.1f}%)")


if __name__ == "__main__":
    main()
