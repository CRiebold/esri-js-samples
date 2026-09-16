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
  OCC_MAX_FIELD,
  OCC_TYPE_FIELD,
  PEAK_HR_FIELD,
  UNIQUE_ID_FIELD
} from "./config";
import { getOccupancyExpression } from "./occupancy";

/**
 * The color ramp that gives Lima its "living city" feel. Idle buildings
 * sit at a dim, dark purple — present and glowing faintly as city fabric,
 * rather than a flat gray/white that reads as "off" — and climb through
 * that same purple family, warming fast through hot magenta into a
 * glowing cyan flash for genuinely busy buildings (roughly the top third
 * of the range). That asymmetry, paired with a high bloom threshold
 * below, is what makes buildings visibly "light up and fade" as their
 * occupancy peaks and passes, rather than sitting brightly lit for a
 * large share of the loop — while never looking fully dark in between.
 */
const OCCUPANCY_COLOR_STOPS = [
  { value: 0, color: "rgba(76, 20, 92, 0.45)" },
  { value: 40, color: "rgba(124, 26, 145, 0.65)" },
  { value: 70, color: "#9c14a8" },
  { value: 88, color: "#ff36d0" },
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

/**
 * Sanity-checks that the published layer actually carries OCC_TYPE/
 * PEAK_HR/OCC_MAX for its features, and warns loudly in the console if a
 * meaningful share are missing. If a CSV-to-polygon join (e.g. by osm_id)
 * silently failed to match some or all records — a common cause being a
 * data-type mismatch between the two sides' join field — those buildings
 * come back with null values for all three fields. The Arcade expression
 * in getOccupancyExpression() then evaluates to null for them (any
 * arithmetic on a null operand is null in Arcade), so ColorVariable falls
 * back to the renderer's plain default symbol instead of animating them —
 * which is exactly what "all buildings appear, but they're all dark"
 * looks like. This check can't fix a bad join, but it turns a silent,
 * confusing symptom into an explicit, actionable message.
 */
async function warnIfOccupancyDataMissing(layer: FeatureLayer): Promise<void> {
  try {
    const [total, missing] = await Promise.all([
      layer.queryFeatureCount(),
      layer.queryFeatureCount({
        where: `${OCC_TYPE_FIELD} IS NULL OR ${PEAK_HR_FIELD} IS NULL OR ${OCC_MAX_FIELD} IS NULL`
      })
    ]);

    if (total > 0 && missing > 0) {
      const pct = ((missing / total) * 100).toFixed(1);
      console.warn(
        `[Rhythm of Lima] ${missing} de ${total} edificios (${pct}%) no tienen valores en ` +
          `${OCC_TYPE_FIELD}/${PEAK_HR_FIELD}/${OCC_MAX_FIELD}. Es muy probable que el join por ` +
          `${UNIQUE_ID_FIELD} no haya emparejado esos registros — revisa que el campo ${UNIQUE_ID_FIELD} ` +
          `tenga el mismo tipo de dato (numérico vs. texto) en la capa de polígonos y en el CSV antes ` +
          `de unirlos. Esos edificios se dibujan con el color por defecto del símbolo, sin animación de ocupación.`
      );
    }
  } catch (error) {
    // Diagnostic only — a failed check should never block the map from rendering.
    console.warn("[Rhythm of Lima] No se pudo verificar la integridad de los datos de ocupación.", error);
  }
}

export interface LimaView {
  view: MapView;
  layer: FeatureLayer;
  /** Updates the renderer to reflect occupancy at the given simulated hour (0-24). */
  applyOccupancyHour(simulatedHour: number): void;
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
    outFields: [UNIQUE_ID_FIELD, OCC_TYPE_FIELD, PEAK_HR_FIELD, OCC_MAX_FIELD],
    popupEnabled: false,
    renderer,
    // A strong bloom with a high threshold: only pixels that are already
    // near-peak-bright cross it, so the glow reads as a brief flash on the
    // busiest buildings rather than a haze sitting over half the map.
    effect: "bloom(2.8, 0px, 65%)"
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

  await warnIfOccupancyDataMissing(layer);

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
    // Esri's own "Animate color visual variable" sample caps how far you
    // can zoom out (`minScale`) so its 1M+ buildings are never all on
    // screen — and being re-colored — at once. We do the same, bounded at
    // roughly the curated city-wide fallback view, so panning/zooming stays
    // fully free without letting the worst case (every building visible
    // and animating simultaneously) become the default or even reachable.
    constraints: { snapToZoom: false, minScale: LIMA_FALLBACK_SCALE }
  });

  await view.when();

  // Prefer centering on the real extent of the buildings once known.
  // view.goTo() automatically respects constraints.minScale above, so this
  // can never zoom out further than the curated city-wide fallback view —
  // a citywide dataset's true extent can easily be larger than what's
  // comfortable to animate all at once.
  if (layer.fullExtent) {
    await view.goTo(layer.fullExtent.expand(1.08));
  }

  function applyOccupancyHour(simulatedHour: number): void {
    colorVariable.valueExpression = getOccupancyExpression(simulatedHour);
  }

  return { view, layer, applyOccupancyHour };
}
