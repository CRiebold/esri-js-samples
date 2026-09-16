import { DAY_DURATION_SECONDS, RENDERER_UPDATE_INTERVAL_MS } from "./config";
import { normalizeHour } from "./occupancy";

export type ClockTickHandler = (simulatedHour: number) => void;

/**
 * Drives the 24-hour simulation clock.
 *
 * This is deliberately split into two callbacks that fire at different
 * rates:
 *
 *  - `onTick` fires on every animation frame. It's cheap (updating a clock
 *    label and a slider position) so there's no reason to throttle it — the
 *    UI stays perfectly smooth.
 *
 *  - `onRendererUpdate` fires at most every `RENDERER_UPDATE_INTERVAL_MS`.
 *    This is the callback that pushes a new Arcade expression to the map's
 *    renderer, which is comparatively expensive across ~105k features, so
 *    it's throttled rather than called 60 times a second. At ~12
 *    updates/second the color transition still reads as fully continuous.
 *
 * The clock advances using wall-clock delta time (not frame count), so the
 * simulated day takes the same DAY_DURATION_SECONDS regardless of frame
 * rate. `speedMultiplier` scales that base rate at runtime (e.g. for a
 * speed slider) without needing to reconstruct the clock.
 */
export class AnimationClock {
  private hour = 0;
  private playing = true;
  private speedMultiplier = 1;
  private lastFrameTime: number | null = null;
  private lastRendererUpdateTime = 0;
  private rafHandle = 0;

  constructor(
    private readonly onTick: ClockTickHandler,
    private readonly onRendererUpdate: ClockTickHandler
  ) {}

  get simulatedHour(): number {
    return this.hour;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  start(): void {
    this.lastFrameTime = null;
    this.rafHandle = requestAnimationFrame(this.frame);
  }

  stop(): void {
    cancelAnimationFrame(this.rafHandle);
  }

  play(): void {
    this.playing = true;
  }

  pause(): void {
    this.playing = false;
  }

  /** Scales playback speed at runtime, e.g. from a speed slider. 1 = normal speed. */
  setSpeedMultiplier(multiplier: number): void {
    this.speedMultiplier = multiplier;
  }

  /** Jumps directly to a simulated hour (e.g. from dragging the timeline) and repaints immediately. */
  seek(simulatedHour: number): void {
    this.hour = normalizeHour(simulatedHour);
    this.onTick(this.hour);
    this.pushRendererUpdate(true);
  }

  private frame = (now: number): void => {
    const last = this.lastFrameTime ?? now;
    const deltaSeconds = (now - last) / 1000;
    this.lastFrameTime = now;

    if (this.playing) {
      const hoursPerSecond = (24 / DAY_DURATION_SECONDS) * this.speedMultiplier;
      this.hour = normalizeHour(this.hour + deltaSeconds * hoursPerSecond);
      this.onTick(this.hour);
      this.pushRendererUpdate(false);
    }

    this.rafHandle = requestAnimationFrame(this.frame);
  };

  private pushRendererUpdate(force: boolean): void {
    const now = performance.now();
    if (force || now - this.lastRendererUpdateTime >= RENDERER_UPDATE_INTERVAL_MS) {
      this.lastRendererUpdateTime = now;
      this.onRendererUpdate(this.hour);
    }
  }
}
