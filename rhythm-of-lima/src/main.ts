import "./arcgisConfig";
import "@arcgis/core/assets/esri/themes/dark/main.css";

import { createLimaView, FeatureLayerConfigError } from "./map";
import { AnimationClock } from "./animationClock";
import { Ui } from "./ui";
import { interpolateOccupancy } from "./occupancy";
import { OCC_TYPE_FIELD } from "./config";

async function main(): Promise<void> {
  const ui = new Ui();
  const container = document.getElementById("viewDiv") as HTMLDivElement;

  let limaView;
  try {
    limaView = await createLimaView(container);
  } catch (error) {
    const message =
      error instanceof FeatureLayerConfigError
        ? error.message
        : `An unexpected error occurred while loading the map: ${
            error instanceof Error ? error.message : String(error)
          }`;
    ui.showError(message);
    return;
  }

  const { view, applyOccupancyHour, hitTestBuilding } = limaView;
  ui.hideLoading();

  // The animation clock owns the simulated time-of-day. It ticks the clock
  // and timeline every frame, and throttles pushes into the renderer's
  // Arcade expression (see AnimationClock) so we're not rebuilding the
  // visualization 60 times a second.
  const clock = new AnimationClock(
    (hour) => ui.setSimulatedHour(hour),
    (hour) => applyOccupancyHour(hour)
  );

  ui.setPlaying(clock.isPlaying);
  clock.start();

  ui.onPlayPauseToggle(() => {
    if (clock.isPlaying) {
      clock.pause();
    } else {
      clock.play();
    }
    ui.setPlaying(clock.isPlaying);
  });

  ui.onTimelineScrub((hour) => {
    clock.pause();
    ui.setPlaying(false);
    clock.seek(hour);
  });

  // Minimal hover tooltip: OCC_TYPE + the current interpolated occupancy.
  // Popups are intentionally not used — the animation is the focal point.
  let hitTestInFlight = false;
  view.on("pointer-move", async (event) => {
    if (hitTestInFlight) return;
    hitTestInFlight = true;
    try {
      const attributes = await hitTestBuilding({ x: event.x, y: event.y });
      if (attributes) {
        const occType = String(attributes[OCC_TYPE_FIELD] ?? "Unknown");
        const occupancy = interpolateOccupancy(clock.simulatedHour, attributes);
        ui.showTooltip(event.x, event.y, occType, occupancy);
      } else {
        ui.hideTooltip();
      }
    } finally {
      hitTestInFlight = false;
    }
  });

  view.container?.addEventListener("pointerleave", () => ui.hideTooltip());
}

main();
