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

/** Classification fields available on the layer, used for popups. */
export const OCC_TYPE_FIELD = "OCC_TYPE";

/**
 * How long a full simulated 24-hour day takes to play, in seconds.
 * Esri's own "Animate color visual variable" sample steps its value by 0.5
 * per animation frame over a 137-unit range — at ~60fps that's a full cycle
 * in ~4.5s. This matches that pace so the day/night pulse feels equally
 * energetic instead of slow and static.
 */
export const DAY_DURATION_SECONDS = 6;

/**
 * Minimum time between renderer updates, in milliseconds. The animation
 * clock itself runs every frame (for a smooth clock/timeline), but pushing
 * a new Arcade expression to the layer's renderer requires it to be
 * re-evaluated across every rendered building — at ~105k features citywide,
 * that's real CPU cost, so it's throttled well below frame rate. ~6-7
 * updates/second is still visually smooth for a color transition (unlike
 * motion, which needs much higher fps to read as continuous).
 */
export const RENDERER_UPDATE_INTERVAL_MS = 150;

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
