import {
  OCC_TYPE_FIELD,
  PEAK_HR_FIELD,
  OCC_MAX_FIELD,
  UNIQUE_ID_FIELD,
  QUIET_HOURS_END,
  QUIET_HOURS_TIME_SHARE,
  RIPPLE_CYCLES_PER_DAY,
  RIPPLE_AMPLITUDE
} from "./config";

/**
 * Occupancy model
 * ------------------------------------------------------------------------
 * Each building stores three fields — the same classification fields the
 * original brief described:
 *
 *   OCC_TYPE  its use category ("residential", "office", "hospitality"...)
 *   PEAK_HR   the real number (0-24) this specific building's activity
 *             peaks at — an actual, inspectable value per building, e.g.
 *             13.5. This plays the same role CNSTRCT_YR plays in Esri's
 *             own "Animate color visual variable" sample: it's the one
 *             number the whole animation is driven by.
 *   OCC_MAX   this building's peak occupancy intensity (0-100)
 *
 * There is no per-hour data at all — PEAK_HR and OCC_MAX already bake in a
 * small per-building jitter (see scripts/classify_occ_type.py), computed
 * once when the data was generated, not live. Only OCC_TYPE is looked up
 * at render time, in CATEGORY_SHAPES below, for how WIDE this building's
 * activity peak is and its baseline floor — those two shape parameters
 * are roughly constant within a category, so they aren't stored per
 * building.
 */

interface CategoryShape {
  /** How wide the peak is — larger stays elevated longer around PEAK_HR. */
  width: number;
  /** Baseline occupancy far from the peak. */
  floor: number;
}

/**
 * One curve shape per building-use category, tuned against Lima's real OSM
 * building mix (still ~85% residential) to produce the intended citywide
 * story: residential dominant overnight and early morning, offices/schools
 * ramping up through the morning, business/retail peaking midday, and a
 * shift back toward residential/hospitality in the evening. Must match
 * CATEGORY_BASE's category list in scripts/classify_occ_type.py.
 */
const CATEGORY_SHAPES: Record<string, CategoryShape> = {
  residential: { width: 4.5, floor: 18 },
  office: { width: 3, floor: 8 },
  education: { width: 2.2, floor: 4 },
  healthcare: { width: 9, floor: 45 },
  hospitality: { width: 5, floor: 35 },
  industrial: { width: 3.5, floor: 10 },
  religious: { width: 2, floor: 6 },
  civic_transit: { width: 3, floor: 10 },
  retail_food: { width: 4, floor: 12 },
  other: { width: 8, floor: 8 }
};

/** Used for any OCC_TYPE value that doesn't match a known category. */
const DEFAULT_SHAPE = CATEGORY_SHAPES.other;

/** Normalizes any real number of hours into the circular [0, 24) range. */
export function normalizeHour(hour: number): number {
  const wrapped = hour % 24;
  return wrapped < 0 ? wrapped + 24 : wrapped;
}

/**
 * Builds the Arcade expression that computes a building's occupancy at
 * `simulatedHour` from its PEAK_HR and OCC_MAX fields (real numbers,
 * already jittered per building — see scripts/classify_occ_type.py) and
 * its OCC_TYPE category (looked up here only for how wide the peak is and
 * its baseline floor). This drives the renderer's color visual variable,
 * so all buildings are colored client-side from three lightweight fields
 * — no per-feature JavaScript work, and no per-hour data to fetch or store.
 *
 * On top of that main curve, a faster "twinkle" (see RIPPLE_CYCLES_PER_DAY
 * in src/config.ts) adds a modest, capped boost derived from the
 * building's own id and the current hour — so instead of one synchronized
 * citywide wave (everything dim, then one big midday-to-evening swell),
 * buildings flicker up and down individually throughout the day. Only the
 * "up" half of that ripple is added (never subtracted), so it can only
 * ever brighten a building above its main curve, never dim it below.
 */
export function getOccupancyExpression(simulatedHour: number): string {
  const hour = normalizeHour(simulatedHour);

  const decodeCases = Object.entries(CATEGORY_SHAPES)
    .map(([type, s]) => `"${type}", {width: ${s.width}, floor: ${s.floor}}`)
    .join(",\n    ");

  return `
    var peak = $feature.${PEAK_HR_FIELD};
    var maxOcc = $feature.${OCC_MAX_FIELD};

    var shape = Decode($feature.${OCC_TYPE_FIELD},
    ${decodeCases},
    {width: ${DEFAULT_SHAPE.width}, floor: ${DEFAULT_SHAPE.floor}}
    );

    var d = Abs(${hour} - peak);
    d = Min(d, 24 - d);

    var base = shape.floor + (maxOcc - shape.floor) * Exp(-(d * d) / (2 * shape.width * shape.width));

    var ripplePhase = (Mod($feature.${UNIQUE_ID_FIELD}, 997) / 997) * 6.283185;
    var rippleWave = Sin(${hour} * (6.283185 * ${RIPPLE_CYCLES_PER_DAY} / 24) + ripplePhase);
    var rippleBoost = Max(0, rippleWave) * ${RIPPLE_AMPLITUDE};

    return Min(100, base + rippleBoost);
  `;
}

/** Formats a simulated hour (real number in [0, 24)) as an "HH:MM" clock string. */
export function formatClock(simulatedHour: number): string {
  const hour = normalizeHour(simulatedHour);
  const totalMinutes = Math.floor(hour * 60);
  const hh = Math.floor(totalMinutes / 60) % 24;
  const mm = totalMinutes % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * Maps a normalized position in the playback loop (`loopT`, in [0, 1),
 * advancing at constant real-time speed) to a simulated hour (0-24),
 * per the QUIET_HOURS_* time-warp described in src/config.ts: the quiet
 * pre-dawn stretch is compressed into a smaller slice of real playback
 * time, and the livelier rest of the day is stretched to fill the rest.
 */
export function mapLoopPositionToHour(loopT: number): number {
  const t = ((loopT % 1) + 1) % 1;
  if (t < QUIET_HOURS_TIME_SHARE) {
    return (t / QUIET_HOURS_TIME_SHARE) * QUIET_HOURS_END;
  }
  const liveT = (t - QUIET_HOURS_TIME_SHARE) / (1 - QUIET_HOURS_TIME_SHARE);
  return QUIET_HOURS_END + liveT * (24 - QUIET_HOURS_END);
}

/**
 * The inverse of mapLoopPositionToHour — which loop position corresponds
 * to a given simulated hour. Used when jumping to a specific hour (e.g.
 * dragging the timeline) so autoplay can resume from the right place in
 * the warped loop without jumping or skipping hours.
 */
export function mapHourToLoopPosition(simulatedHour: number): number {
  const hour = normalizeHour(simulatedHour);
  if (hour < QUIET_HOURS_END) {
    return (hour / QUIET_HOURS_END) * QUIET_HOURS_TIME_SHARE;
  }
  const liveFraction = (hour - QUIET_HOURS_END) / (24 - QUIET_HOURS_END);
  return QUIET_HOURS_TIME_SHARE + liveFraction * (1 - QUIET_HOURS_TIME_SHARE);
}
