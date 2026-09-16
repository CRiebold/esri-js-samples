/**
 * Application-wide configuration constants.
 *
 * The feature layer URL is intentionally read from an environment variable
 * rather than hardcoded, so the demo can point at a different portal item
 * or feature service without touching source code.
 */

export const FEATURE_LAYER_URL: string = import.meta.env.VITE_FEATURE_LAYER_URL ?? "";

/** Unique identifier field for each building footprint. */
export const UNIQUE_ID_FIELD = "osm_id";

/**
 * The three classification fields the renderer reads per building (see
 * scripts/classify_occ_type.py and CATEGORY_SHAPES in src/occupancy.ts):
 *
 *   OCC_TYPE  use category, e.g. "residential", "office", "hospitality"
 *   PEAK_HR   the hour (0-24) this building's activity peaks at
 *   OCC_MAX   this building's peak occupancy intensity (0-100)
 *
 * PEAK_HR and OCC_MAX are real per-building numbers already baked into the
 * data — the whole 24-hour curve is computed live from these three fields,
 * not from any stored per-hour data.
 */
export const OCC_TYPE_FIELD = "OCC_TYPE";
export const PEAK_HR_FIELD = "PEAK_HR";
export const OCC_MAX_FIELD = "OCC_MAX";

/**
 * How long a full simulated 24-hour day takes to play, in seconds.
 * Esri's own "Animate color visual variable" sample steps its value by 0.5
 * per animation frame over a 137-unit range — at ~60fps that's a full cycle
 * in ~4.5s. This matches that pace so the day/night pulse feels equally
 * energetic instead of slow and static.
 */
export const DAY_DURATION_SECONDS = 6;

/**
 * A secondary, faster "twinkle" layered on top of each building's main
 * daily curve (see getOccupancyExpression in src/occupancy.ts). Without
 * it, the whole city moves as one wave — quiet in the morning, one big
 * midday-to-evening swell, quiet again — because most buildings share a
 * category-typical peak hour. RIPPLE_CYCLES_PER_DAY gives every building
 * that many extra little pulses across the day, each at a phase derived
 * from its own UNIQUE_ID_FIELD, so — instead of one synchronized wave —
 * buildings flicker up and down individually (with some incidental
 * clustering, since nearby buildings often have nearby ids in the OSM
 * export). RIPPLE_AMPLITUDE caps how much brightness that twinkle can add
 * on its own, so a building's true PEAK_HR flash is still always its
 * brightest moment of the day.
 */
export const RIPPLE_CYCLES_PER_DAY = 8;
export const RIPPLE_AMPLITUDE = 18;

/**
 * Lima, Peru — the fallback center/scale if the layer's extent can't be
 * read, AND the view's hard `minScale` cap (see src/map.ts). Esri's own
 * "Animate color visual variable" sample bounds how far you can zoom out
 * for the same reason: past a certain scale, every building ends up on
 * screen — and being re-colored — simultaneously, which is real CPU cost
 * at ~105k features. Panning/zooming in stays completely free; this only
 * stops zooming OUT past a "recognizable city" view.
 */
export const LIMA_CENTER: [number, number] = [-77.0428, -12.0464];
export const LIMA_FALLBACK_SCALE = 300000;
