import esriConfig from "@arcgis/core/config.js";

/**
 * By default @arcgis/core fetches its runtime assets (web worker scripts,
 * locale strings, basemap style JSON) from Esri's js.arcgis.com CDN at a
 * version-specific path. For an npm/bundler-based app that's an
 * unnecessary external dependency — and can go stale if the CDN path ever
 * drifts from the installed package version. Pointing assetsPath at the
 * copy of node_modules/@arcgis/core/assets served by this app (see
 * vite.config.ts) keeps everything self-consistent with the installed SDK.
 *
 * This must run before any other @arcgis/core module creates a Map/View.
 */
esriConfig.assetsPath = new URL("arcgis-assets", document.baseURI).href;
