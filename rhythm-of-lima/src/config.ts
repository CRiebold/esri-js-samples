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
 * How long a full simulated 24-hour day takes to play, in seconds.
 * Esri's own "Animate color visual variable" sample steps its value by 0.5
 * per animation frame over a 137-unit range — at ~60fps that's a full cycle
 * in ~4.5s. This matches that pace so the day/night pulse feels equally
 * energetic instead of slow and static.
 */
export const DAY_DURATION_SECONDS = 6;

/**
 * Time-warping for the playback loop. Real occupancy data isn't uniformly
 * "interesting" across 24 hours — the pre-dawn stretch in Lima's dataset
 * stays quiet until around 8am, then a lot happens the rest of the day. A
 * constant-speed clock spends a third of every loop on that quiet stretch
 * with visibly nothing changing. Instead, hours before QUIET_HOURS_END are
 * compressed into just QUIET_HOURS_TIME_SHARE of the loop's real playback
 * time, and the livelier remaining hours are stretched to fill the rest —
 * same total loop length, but far more of it spent where buildings are
 * actually lighting up. This only affects autoplay pacing: dragging the
 * timeline still jumps straight to the exact hour requested (see
 * mapLoopPositionToHour/mapHourToLoopPosition in src/occupancy.ts).
 *
 * Re-tune these after watching the real data — if the lively stretch
 * actually starts earlier/later than 8am, move QUIET_HOURS_END to match.
 */
export const QUIET_HOURS_END = 8;
export const QUIET_HOURS_TIME_SHARE = 0.15;

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
