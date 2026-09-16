import { QUIET_HOURS_END, QUIET_HOURS_TIME_SHARE } from "./config";

/**
 * Occupancy interpolation
 * ------------------------------------------------------------------------
 * The feature layer stores one occupancy value per hour (OCC_00 .. OCC_23),
 * each a 0-100 relative activity level for that building. To animate a
 * smooth 24-hour day we linearly interpolate between the two hourly fields
 * that bracket the current simulated time, e.g. at 18.5h we blend OCC_18
 * and OCC_19 50/50.
 *
 * The day wraps at midnight (circularly): the hour after OCC_23 is OCC_00.
 */

/** The 24 hourly occupancy field names, OCC_00 through OCC_23, in order. */
export const OCC_FIELDS: readonly string[] = Array.from(
  { length: 24 },
  (_, hour) => `OCC_${String(hour).padStart(2, "0")}`
);

/** Normalizes any real number of hours into the circular [0, 24) range. */
export function normalizeHour(hour: number): number {
  const wrapped = hour % 24;
  return wrapped < 0 ? wrapped + 24 : wrapped;
}

/**
 * Builds the Arcade expression that linearly interpolates a building's
 * occupancy at `simulatedHour` (a real number in [0, 24)) between the two
 * bracketing hourly fields, e.g. for simulatedHour = 18.5:
 *
 *   $feature.OCC_18 * (1 - 0.5) + $feature.OCC_19 * 0.5
 *
 * At the 23h -> 0h boundary, the "next" field circles back to OCC_00.
 * This expression is what drives the renderer's color visual variable, so
 * the 105k buildings are colored entirely server/GPU-side — no per-feature
 * JavaScript work is done for the animation.
 */
export function getOccupancyExpression(simulatedHour: number): string {
  const hour = normalizeHour(simulatedHour);
  const currentHour = Math.floor(hour);
  const nextHour = (currentHour + 1) % 24;
  const fraction = hour - currentHour;

  const currentField = OCC_FIELDS[currentHour];
  const nextField = OCC_FIELDS[nextHour];

  return `$feature.${currentField} * (1 - ${fraction}) + $feature.${nextField} * ${fraction}`;
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
