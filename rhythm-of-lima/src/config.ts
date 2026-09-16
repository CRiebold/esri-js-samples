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

/** How long a full simulated 24-hour day takes to play, in seconds. */
export const DAY_DURATION_SECONDS = 30;

/**
 * Minimum time between renderer updates, in milliseconds. The animation
 * clock itself runs every frame (for a smooth clock/timeline), but pushing
 * a new Arcade expression to the layer's renderer on every frame is wasted
 * work — the map only needs to look continuous, not literally repaint at
 * 60 fps. ~12 updates/second is imperceptible from a smooth animation.
 */
export const RENDERER_UPDATE_INTERVAL_MS = 80;

/** Lima, Peru — used as a fallback center if the layer's extent can't be read. */
export const LIMA_CENTER: [number, number] = [-77.0428, -12.0464];
export const LIMA_FALLBACK_SCALE = 300000;
