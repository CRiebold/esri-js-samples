import "./arcgisConfig";
import "@arcgis/core/assets/esri/themes/dark/main.css";

import { createLimaView, FeatureLayerConfigError } from "./map";
import { AnimationClock } from "./animationClock";
import { Ui } from "./ui";

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
        : `Ocurrió un error inesperado al cargar el mapa: ${
            error instanceof Error ? error.message : String(error)
          }`;
    ui.showError(message);
    return;
  }

  const { applyOccupancyHour } = limaView;
  ui.hideLoading();

  // The animation clock owns the simulated time-of-day, ticking the clock,
  // timeline, and renderer together every frame (see AnimationClock).
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

  ui.onSpeedChange((multiplier) => clock.setSpeedMultiplier(multiplier));
}

main();
