import { DAY_DURATION_SECONDS } from "./config";
import { mapHourToLoopPosition, mapLoopPositionToHour } from "./occupancy";

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
 * Internally the clock advances a normalized *loop position* (0-1) at
 * constant wall-clock speed — using delta time, not frame count, so a full
 * loop always takes DAY_DURATION_SECONDS regardless of frame rate — and
 * maps that to a simulated hour via mapLoopPositionToHour(), which is
 * where the quiet-hours time-warp (see src/config.ts) is applied. Autoplay
 * therefore doesn't move through simulated hours at a constant rate, but
 * `simulatedHour` and everything callers see is a plain 0-24 value either
 * way. `speedMultiplier` scales loop speed at runtime (e.g. for a speed
 * slider) without needing to reconstruct the clock.
 */
export class AnimationClock {
  private loopPosition = 0;
  private playing = true;
  private speedMultiplier = 1;
  private lastFrameTime: number | null = null;
  private rafHandle = 0;

  constructor(
    private readonly onTick: ClockTickHandler,
    private readonly onRendererUpdate: ClockTickHandler
  ) {}

  get simulatedHour(): number {
    return mapLoopPositionToHour(this.loopPosition);
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
    this.loopPosition = mapHourToLoopPosition(simulatedHour);
    const hour = this.simulatedHour;
    this.onTick(hour);
    this.onRendererUpdate(hour);
  }

  private frame = (now: number): void => {
    const last = this.lastFrameTime ?? now;
    const deltaSeconds = (now - last) / 1000;
    this.lastFrameTime = now;

    if (this.playing) {
      const loopsPerSecond = (1 / DAY_DURATION_SECONDS) * this.speedMultiplier;
      this.loopPosition = (this.loopPosition + deltaSeconds * loopsPerSecond) % 1;
      const hour = this.simulatedHour;
      this.onTick(hour);
      this.onRendererUpdate(hour);
    }

    this.rafHandle = requestAnimationFrame(this.frame);
  };
}
