import esriConfig from "@arcgis/core/config.js";
import Map from "@arcgis/core/Map.js";
import MapView from "@arcgis/core/views/MapView.js";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import SimpleRenderer from "@arcgis/core/renderers/SimpleRenderer.js";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol.js";
import ColorVariable from "@arcgis/core/renderers/visualVariables/ColorVariable.js";

import {
  FEATURE_LAYER_URL,
  LIMA_CENTER,
  LIMA_FALLBACK_SCALE,
  OCC_TYPE_FIELD,
  UNIQUE_ID_FIELD
} from "./config";
import { OCC_FIELDS, getOccupancyExpression } from "./occupancy";

/**
 * The color ramp that gives Lima its "living city" feel: buildings sit
 * nearly invisible against the dark basemap when idle, then climb through
 * deep violet and hot magenta into a glowing cyan at peak occupancy —
 * a punchier, more electric progression (closer to Esri's own
 * "Animate color visual variable" sample) than a plain dark-to-light blue
 * ramp, which read as flat/washed-out on a live screen.
 */
const OCCUPANCY_COLOR_STOPS = [
  { value: 0, color: "#0a0512" },
  { value: 25, color: "#4a0d6b" },
  { value: 50, color: "#c81fb0" },
  { value: 75, color: "#ff4ed6" },
  { value: 100, color: "#22ffe6" }
];

export class FeatureLayerConfigError extends Error {}

/**
 * VITE_FEATURE_LAYER_URL can point directly at a FeatureServer layer
 * (".../FeatureServer/0"), or at an ArcGIS portal *item* page — which is
 * what you get when you copy a link from the portal's item details view
 * (".../home/item.html?id=<32-char-id>"), as provided for this demo's
 * Lima buildings item.
 *
 * A portal item page isn't a REST endpoint by itself, so it can't be
 * passed as FeatureLayer.url. Instead, we point the SDK at the item's
 * portal and load the layer by portal item id — the SDK resolves the
 * actual service URL itself, so nothing here is fabricated.
 */
function resolveFeatureLayerSource(
  rawUrl: string
): { url: string } | { portalItem: { id: string } } {
  const trimmed = rawUrl.trim();

  const itemPageMatch = trimmed.match(
    /^(https?:\/\/[^/]+(?:\/[^/]+)*?)\/home\/item\.html\?.*\bid=([0-9a-f]{32})\b/i
  );
  if (itemPageMatch) {
    const [, portalRoot, itemId] = itemPageMatch;
    esriConfig.portalUrl = portalRoot;
    return { portalItem: { id: itemId } };
  }

  if (/\/FeatureServer(\/\d+)?\/?$/i.test(trimmed)) {
    return { url: trimmed };
  }

  throw new FeatureLayerConfigError(
    `VITE_FEATURE_LAYER_URL no tiene un formato reconocible: "${rawUrl}". ` +
      `Debe ser una URL de capa de FeatureServer (p. ej. ".../FeatureServer/0") o la URL ` +
      `de la página de un elemento del portal (p. ej. ".../home/item.html?id=<id de 32 caracteres>").`
  );
}

export interface LimaView {
  view: MapView;
  layer: FeatureLayer;
  /** Updates the renderer to reflect occupancy at the given simulated hour (0-24). */
  applyOccupancyHour(simulatedHour: number): void;
  /** Reads a building's OCC_TYPE + osm_id from a screen point, for the hover tooltip. */
  hitTestBuilding(screenPoint: { x: number; y: number }): Promise<Record<string, unknown> | null>;
}

/**
 * Creates the Map, MapView and the Lima buildings FeatureLayer, wires up a
 * continuous color visual variable driven by the occupancy Arcade
 * expression, and returns a small handle used to drive the animation.
 *
 * Throws FeatureLayerConfigError if the URL is missing/invalid or the
 * layer fails to load, so the caller can show a clear error state.
 */
export async function createLimaView(container: HTMLDivElement): Promise<LimaView> {
  if (!FEATURE_LAYER_URL) {
    throw new FeatureLayerConfigError(
      "No se configuró ninguna URL de capa de datos. Define VITE_FEATURE_LAYER_URL en tu " +
        "archivo .env con la URL de la capa de edificios de Lima (ver .env.example)."
    );
  }

  const colorVariable = new ColorVariable({
    valueExpression: getOccupancyExpression(0),
    valueExpressionTitle: "Simulated occupancy",
    stops: OCCUPANCY_COLOR_STOPS
  });

  const renderer = new SimpleRenderer({
    symbol: new SimpleFillSymbol({
      outline: { color: [0, 0, 0, 0], width: 0 }
    }),
    visualVariables: [colorVariable]
  });

  const layer = new FeatureLayer({
    ...resolveFeatureLayerSource(FEATURE_LAYER_URL),
    outFields: [UNIQUE_ID_FIELD, OCC_TYPE_FIELD, ...OCC_FIELDS],
    popupEnabled: false,
    renderer,
    // A strong, tight bloom (matching the intensity of Esri's own
    // "Animate color visual variable" sample) so the brightest, busiest
    // buildings genuinely glow rather than just looking like a slightly
    // lighter fill color.
    effect: "bloom(2.5, 0px, 50%)"
  });

  try {
    await layer.load();
  } catch (error) {
    throw new FeatureLayerConfigError(
      `No se pudo cargar la capa de datos desde la fuente configurada. Verifica que ` +
        `VITE_FEATURE_LAYER_URL apunte a una capa de datos válida y accesible públicamente. ` +
        `Error original: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const map = new Map({
    basemap: "dark-gray-vector",
    layers: [layer]
  });

  const view = new MapView({
    container,
    map,
    center: LIMA_CENTER,
    scale: LIMA_FALLBACK_SCALE,
    ui: { components: [] }, // keep the map free of default widgets; the map is the star
    constraints: { snapToZoom: false }
  });

  await view.when();

  // Prefer the real extent of the buildings once known, falling back to the
  // hardcoded Lima city view if the service doesn't report one.
  if (layer.fullExtent) {
    await view.goTo(layer.fullExtent.expand(1.08));
  }

  function applyOccupancyHour(simulatedHour: number): void {
    colorVariable.valueExpression = getOccupancyExpression(simulatedHour);
  }

  async function hitTestBuilding(
    screenPoint: { x: number; y: number }
  ): Promise<Record<string, unknown> | null> {
    const result = await view.hitTest(screenPoint, { include: layer });
    const graphic = result.results[0]?.type === "graphic" ? result.results[0].graphic : undefined;
    return graphic ? (graphic.attributes as Record<string, unknown>) : null;
  }

  return { view, layer, applyOccupancyHour, hitTestBuilding };
}
