import { OCC_TYPE_FIELD, QUIET_HOURS_END, QUIET_HOURS_TIME_SHARE, UNIQUE_ID_FIELD } from "./config";

/**
 * Occupancy model
 * ------------------------------------------------------------------------
 * Each building stores exactly one classification field, OCC_TYPE (its use
 * category — "residential", "office", "retail_food", etc.), plus its
 * existing unique id. There is no per-hour data at all: every category has
 * a single daily activity curve — one peak hour, how wide that peak is,
 * a baseline floor, and a peak intensity — and the live occupancy for any
 * simulated hour is computed entirely inside the Arcade expression below,
 * the same way Esri's own "Animate color visual variable" sample derives
 * a building's color from a single CNSTRCT_YR field and the current slider
 * value, rather than from dozens of pre-computed per-year fields.
 *
 * A building's own osm_id seeds a small deterministic jitter (via a classic
 * linear-congruential pseudo-random formula, mirrored in both this file and
 * the generated Arcade expression) so buildings in the same category don't
 * all peak at the exact same minute — without needing any extra stored
 * field beyond the id every feature already has.
 */

interface CategoryProfile {
  /** Hour (0-23) this category's activity peaks at, before per-building jitter. */
  peakHour: number;
  /** How wide the peak is — larger stays elevated longer around peakHour. */
  width: number;
  /** Baseline occupancy far from the peak. */
  floor: number;
  /** Occupancy at the peak, before per-building jitter. */
  max: number;
}

/**
 * One curve per building-use category, tuned against Lima's real OSM
 * building mix (still ~85% residential) to produce the intended citywide
 * story: residential dominant overnight and early morning, offices/schools
 * ramping up through the morning, business/retail peaking midday, and a
 * shift back toward residential/hospitality in the evening.
 */
const CATEGORY_PROFILES: Record<string, CategoryProfile> = {
  residential: { peakHour: 1, width: 4.5, floor: 18, max: 70 },
  office: { peakHour: 12.5, width: 3, floor: 8, max: 85 },
  education: { peakHour: 10, width: 2.2, floor: 4, max: 90 },
  healthcare: { peakHour: 14, width: 9, floor: 45, max: 90 },
  hospitality: { peakHour: 22, width: 5, floor: 35, max: 80 },
  industrial: { peakHour: 11, width: 3.5, floor: 10, max: 70 },
  religious: { peakHour: 9.5, width: 2, floor: 6, max: 60 },
  civic_transit: { peakHour: 8.5, width: 3, floor: 10, max: 75 },
  retail_food: { peakHour: 13.5, width: 4, floor: 12, max: 85 },
  other: { peakHour: 12, width: 8, floor: 8, max: 30 }
};

/** Used for any OCC_TYPE value that doesn't match a known category. */
const DEFAULT_PROFILE = CATEGORY_PROFILES.other;

/** Normalizes any real number of hours into the circular [0, 24) range. */
export function normalizeHour(hour: number): number {
  const wrapped = hour % 24;
  return wrapped < 0 ? wrapped + 24 : wrapped;
}

/**
 * Builds the Arcade expression that computes a building's occupancy at
 * `simulatedHour` from just its OCC_TYPE category and osm_id. This is what
 * drives the renderer's color visual variable, so all buildings are
 * colored client-side from two lightweight fields — no per-feature
 * JavaScript work, and no per-hour data to fetch or store.
 */
export function getOccupancyExpression(simulatedHour: number): string {
  const hour = normalizeHour(simulatedHour);

  const decodeCases = Object.entries(CATEGORY_PROFILES)
    .map(([type, p]) => `"${type}", {peak: ${p.peakHour}, width: ${p.width}, floor: ${p.floor}, max: ${p.max}}`)
    .join(",\n    ");

  return `
    var t = $feature.${OCC_TYPE_FIELD};
    var id = $feature.${UNIQUE_ID_FIELD};

    // Deterministic pseudo-random values in [0, 1) from the building's own
    // id (a classic linear-congruential formula), used only to jitter this
    // building's peak hour/intensity a little within its category.
    var r1 = ((id * 9301 + 49297) % 233280) / 233280;
    var r2 = (((id * 7 + 13) * 9301 + 49297) % 233280) / 233280;

    var p = Decode(t,
    ${decodeCases},
    {peak: ${DEFAULT_PROFILE.peakHour}, width: ${DEFAULT_PROFILE.width}, floor: ${DEFAULT_PROFILE.floor}, max: ${DEFAULT_PROFILE.max}}
    );

    var peak = p.peak + (r1 * 2 - 1) * 1.5;
    var maxOcc = Max(0, Min(100, p.max + (r2 * 2 - 1) * 10));

    var d = Abs(${hour} - peak);
    d = Min(d, 24 - d);

    return p.floor + (maxOcc - p.floor) * Exp(-(d * d) / (2 * p.width * p.width));
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
