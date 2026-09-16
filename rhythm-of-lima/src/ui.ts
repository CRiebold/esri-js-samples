import { formatClock } from "./occupancy";

const MINUTES_PER_DAY = 24 * 60;

/**
 * Thin wrapper around the static HUD elements declared in index.html
 * (clock, timeline, play/pause, tooltip, loading/error overlays). Keeping
 * DOM wiring in one place lets main.ts stay focused on orchestration.
 */
export class Ui {
  private readonly clockEl = requireEl<HTMLDivElement>("clock");
  private readonly timelineEl = requireEl<HTMLInputElement>("timeline");
  private readonly speedSliderEl = requireEl<HTMLInputElement>("speedSlider");
  private readonly speedValueEl = requireEl<HTMLSpanElement>("speedValue");
  private readonly playPauseBtn = requireEl<HTMLButtonElement>("playPauseBtn");
  private readonly iconPlay = requireEl<SVGElement>("iconPlay");
  private readonly iconPause = requireEl<SVGElement>("iconPause");
  private readonly tooltipEl = requireEl<HTMLDivElement>("tooltip");
  private readonly loadingOverlay = requireEl<HTMLDivElement>("loadingOverlay");
  private readonly errorOverlay = requireEl<HTMLDivElement>("errorOverlay");
  private readonly errorMessageEl = requireEl<HTMLParagraphElement>("errorMessage");

  private draggingTimeline = false;

  onPlayPauseToggle(handler: () => void): void {
    this.playPauseBtn.addEventListener("click", handler);
  }

  /** Fires while the user drags the slider, with hours in [0, 24). */
  onTimelineScrub(handler: (simulatedHour: number) => void): void {
    const emit = () => handler((Number(this.timelineEl.value) / MINUTES_PER_DAY) * 24);
    this.timelineEl.addEventListener("pointerdown", () => (this.draggingTimeline = true));
    this.timelineEl.addEventListener("input", emit);
    window.addEventListener("pointerup", () => (this.draggingTimeline = false));
  }

  /** Fires while the user drags the speed slider, with a multiplier (0.25 - 4). */
  onSpeedChange(handler: (multiplier: number) => void): void {
    this.speedSliderEl.addEventListener("input", () => {
      const multiplier = Number(this.speedSliderEl.value);
      const label = Number.isInteger(multiplier) ? `${multiplier}.0` : `${multiplier}`;
      this.speedValueEl.textContent = `${label}×`;
      handler(multiplier);
    });
  }

  /** Updates the clock readout and timeline position. Skipped for the timeline while the user is actively dragging it. */
  setSimulatedHour(simulatedHour: number): void {
    this.clockEl.textContent = formatClock(simulatedHour);

    if (!this.draggingTimeline) {
      const minutes = Math.round((simulatedHour / 24) * MINUTES_PER_DAY);
      this.timelineEl.value = String(minutes);
    }

    const fillPercent = (Number(this.timelineEl.value) / MINUTES_PER_DAY) * 100;
    this.timelineEl.style.setProperty("--fill", `${fillPercent}%`);
  }

  setPlaying(isPlaying: boolean): void {
    setHidden(this.iconPlay, isPlaying);
    setHidden(this.iconPause, !isPlaying);
    this.playPauseBtn.setAttribute("aria-label", isPlaying ? "Pausar" : "Reproducir");
  }

  showTooltip(screenX: number, screenY: number, occType: string, occupancyPercent: number): void {
    this.tooltipEl.innerHTML = `<strong>${Math.round(occupancyPercent)}%</strong> ocupado &middot; ${occType}`;
    this.tooltipEl.style.left = `${screenX}px`;
    this.tooltipEl.style.top = `${screenY - 12}px`;
    this.tooltipEl.classList.remove("tooltip--hidden");
  }

  hideTooltip(): void {
    this.tooltipEl.classList.add("tooltip--hidden");
  }

  hideLoading(): void {
    this.loadingOverlay.classList.add("overlay--hidden");
  }

  showError(message: string): void {
    this.loadingOverlay.classList.add("overlay--hidden");
    this.errorMessageEl.textContent = message;
    this.errorOverlay.classList.remove("overlay--hidden");
  }
}

function requireEl<T extends Element>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Expected #${id} to exist in index.html`);
  }
  return el as unknown as T;
}

function setHidden(el: Element, hidden: boolean): void {
  if (hidden) {
    el.setAttribute("hidden", "");
  } else {
    el.removeAttribute("hidden");
  }
}
