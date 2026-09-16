# El Ritmo de Lima (The Rhythm of Lima)

A demonstration built with the ArcGIS Maps SDK for JavaScript that visualizes
how simulated building occupancy changes across a 24-hour day, over roughly
105,000 real OpenStreetMap building footprints in Lima, Peru. The app's UI
is in Spanish for its intended audience; this README is in English for
developers.

The building geometries are real (OpenStreetMap). The hourly occupancy
values are **synthetic**, generated for this demo — see the "Datos de
ocupación sintéticos" label in the app itself.

## What it does

- Loads all buildings from a single ArcGIS Hosted Feature Layer and lets the
  `FeatureLayer`/`MapView` handle rendering — the ~105k features are never
  queried or copied into JavaScript memory.
- Colors every building by its **current simulated occupancy** (0–100)
  using a continuous Color Visual Variable, driven by an Arcade expression
  that linearly interpolates between the two hourly `OCC_HH` fields that
  bracket the current time (circularly, so 23:30 blends `OCC_23`/`OCC_00`).
- Plays a full simulated day in ~6 real seconds by default, looping
  continuously, with a large digital clock, a draggable 24-hour timeline,
  Play/Pause, and a speed slider (0.25×–4×) to slow it down or speed it up
  live. The base pace, the violet → magenta → cyan color ramp, and the
  strong bloom are deliberately tuned to match the energy of Esri's own
  ["Animate color visual variable"](https://developers.arcgis.com/javascript/latest/sample-code/visualization-vv-color-animate/)
  sample rather than a slow, subtle fade.
- Uses a dark, minimal basemap with a strong, high-threshold bloom effect,
  so only genuinely busy buildings flash brightly and fade rather than a
  large share of the map staying lit at once.

## Tech stack

- [Vite](https://vitejs.dev/) + TypeScript
- [`@arcgis/core`](https://www.npmjs.com/package/@arcgis/core) (current
  stable release) — ArcGIS Maps SDK for JavaScript, 2D `MapView`
- No UI framework — plain TypeScript, HTML and CSS

## Getting started

```bash
npm install
cp .env.example .env   # then fill in VITE_FEATURE_LAYER_URL if needed
npm run dev
```

`.env.example` is already pre-filled with the Lima buildings feature layer
used for this demo. `VITE_FEATURE_LAYER_URL` accepts either form:

- A FeatureServer layer URL, e.g. `https://.../FeatureServer/0`
- An ArcGIS portal **item** page URL, e.g. `https://<portal>/home/item.html?id=<32-char id>`
  (what you get from "copy link" on an item's details page). The app
  resolves the portal item to its underlying layer automatically — see
  `resolveFeatureLayerSource` in `src/map.ts`.

Other scripts:

```bash
npm run build     # type-check (tsc --noEmit) + production build
npm run preview   # preview the production build locally
```

## Project structure

```
index.html               Page shell: overlays, HUD markup, title
src/
  main.ts                Wires everything together (bootstraps the app)
  config.ts               Configuration constants (feature layer URL, timing)
  arcgisConfig.ts         Points @arcgis/core at locally-served SDK assets
  occupancy.ts            OCC_00..OCC_23 fields, interpolation + Arcade expression, clock formatting
  map.ts                  Map/MapView/FeatureLayer creation, renderer, bloom, hit-testing
  animationClock.ts       requestAnimationFrame clock: smooth UI ticks + throttled renderer updates
  ui.ts                   DOM wiring for the clock, timeline, play/pause, tooltip, overlays
  style.css               Dark, presentation-oriented styling
vite.config.ts            Vite config; copies @arcgis/core's runtime assets locally
```

## How the animation works

The layer's renderer never gets rebuilt during playback — only the color
visual variable's `valueExpression` string is updated. This is the same
technique as the ["Animate color visual variable"](https://developers.arcgis.com/javascript/latest/sample-code/visualization-vv-color-animate/)
sample, adapted to a 24-hour occupancy model instead of a single animated
value.

`AnimationClock` (`src/animationClock.ts`) separates two concerns that run
at different rates:

- **The clock tick** (`onTick`) fires every `requestAnimationFrame`, using
  wall-clock delta time so a simulated day always takes ~6 real seconds
  regardless of frame rate. It's cheap (just updates the clock label and
  timeline position), so it runs unthrottled for a perfectly smooth UI.
- **The renderer update** (`onRendererUpdate`) is throttled to roughly
  every 80ms. Pushing a new Arcade expression to a layer with ~105k
  features is comparatively expensive, and updating it 60 times a second
  would be wasted work — ~12 updates/second already reads as fully
  continuous.

Dragging the timeline calls `AnimationClock.seek()`, which bypasses the
throttle and repaints immediately. The speed slider calls
`AnimationClock.setSpeedMultiplier()`, which scales the clock's rate without
resetting or rebuilding it.

`getOccupancyExpression()` in `src/occupancy.ts` builds the actual Arcade
expression, e.g. for hour 18.5:

```
$feature.OCC_18 * (1 - 0.5) + $feature.OCC_19 * 0.5
```

### Why buildings brighten *and* dim within a single day

Unlike a sample that plays through strictly increasing values (e.g. a
building's construction year), each building's occupancy naturally rises
and falls over 24 hours — often with more than one peak (e.g. a residential
building busy both in the early morning and at night). So a building's
color legitimately climbs to cyan and back down to violet more than once
per loop; that's the data's real daily rhythm, not an inconsistency in the
color ramp.

### Why buildings don't stay lit for long

`OCCUPANCY_COLOR_STOPS` in `src/map.ts` is deliberately back-loaded: 0–70
maps to a narrow, muted violet-to-magenta range, and only 70–100 ramps
quickly through hot pink into bright cyan. Combined with a high bloom
threshold (`bloom(2.8, 0px, 65%)`, only pixels in roughly the top third of
brightness actually bloom), a building only "flashes" while genuinely near
its peak, then fades quickly — rather than staying visibly lit for a large
share of the loop.

## Notes on `arcgisConfig.ts` / local SDK assets

By default `@arcgis/core` fetches its runtime assets (worker scripts,
locale strings, basemap style resources) from Esri's `js.arcgis.com` CDN at
a version-specific path. For an npm-installed package that path isn't
guaranteed to exist, so `vite.config.ts` copies `node_modules/@arcgis/core/assets`
into the app's own output and `src/arcgisConfig.ts` points `esriConfig.assetsPath`
at that local copy. This is the standard, documented setup for bundler-based
`@arcgis/core` apps and keeps the app self-consistent with whatever SDK
version is installed.

## Language

All user-facing UI text (title, subtitle, loading/error messages, tooltip,
aria-labels) is in Spanish for the app's intended Lima audience. The one
exception is `OCC_TYPE` itself, shown verbatim in the hover tooltip — its
values come directly from the feature layer's data, so their language
depends on how that field was populated in the source service, not on this
app's code.

## Esri / ArcGIS credit

The title panel includes a text credit line ("Creado con ArcGIS Maps SDK
for JavaScript · Esri"). This is plain text, not Esri's official logo — no
Esri brand asset was available to embed in the environment this was built
in. To use the actual Esri wordmark/logo, drop the image file into
`src/` (or a new `public/` folder) and swap the `#poweredBy` text in
`index.html` for an `<img>` referencing it. The small "Powered by Esri"
attribution shown by the `MapView` itself (bottom-right of the map) is
separate and always present, as required by Esri's basemap terms of use.

## Error handling & loading state

If `VITE_FEATURE_LAYER_URL` is missing, malformed, or the layer fails to
load (network issue, invalid item, etc.), the app shows a clear full-screen
error message instead of a blank map — see `FeatureLayerConfigError` in
`src/map.ts` and the `#errorOverlay` markup in `index.html`. A loading
overlay is shown until the layer and view are ready.

## Scope

This implementation covers the first-milestone feature set: load the layer,
render all buildings by `OCC_00` initially, digital clock, hour
interpolation, a full animated 24-hour loop, Play/Pause, the draggable
timeline, and the final dark/bloom visual treatment — plus a minimal hover
tooltip (`OCC_TYPE` + current occupancy %).
