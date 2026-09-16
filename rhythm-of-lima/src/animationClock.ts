import { DAY_DURATION_SECONDS } from "./config";
import { normalizeHour } from "./occupancy";

export type ClockTickHandler = (simulatedHour: number) => void;

/**
 * Drives the 24-hour simulation clock.
 *
 * `onTick` and `onRendererUpdate` both fire on every animation frame —
 * matching Esri's own "Animate color visual variable" sample, which
 * updates its slider and its renderer together on every `requestAnimationFrame`
 * with no throttling. They're kept as separate callbacks because they do
 * different jobs (cheap DOM updates for the clock/timeline vs. pushing a
 * new Arcade expression to the map's renderer), not because they run at
 * different rates.
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
    this.onRendererUpdate(this.hour);
  }

  private frame = (now: number): void => {
    const last = this.lastFrameTime ?? now;
    const deltaSeconds = (now - last) / 1000;
    this.lastFrameTime = now;

    if (this.playing) {
      const hoursPerSecond = (24 / DAY_DURATION_SECONDS) * this.speedMultiplier;
      this.hour = normalizeHour(this.hour + deltaSeconds * hoursPerSecond);
      this.onTick(this.hour);
      this.onRendererUpdate(this.hour);
    }

    this.rafHandle = requestAnimationFrame(this.frame);
  };
}
