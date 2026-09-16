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
  live. The base pace, the pale-white → magenta → cyan color ramp, and the
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
  animationClock.ts       requestAnimationFrame clock driving the UI and renderer together
  ui.ts                   DOM wiring for the clock, timeline, play/pause, overlays
  style.css               Dark, presentation-oriented styling
vite.config.ts            Vite config; copies @arcgis/core's runtime assets locally
```

## How the animation works

The layer's renderer never gets rebuilt during playback — only the color
visual variable's `valueExpression` string is updated. This is the same
technique as the ["Animate color visual variable"](https://developers.arcgis.com/javascript/latest/sample-code/visualization-vv-color-animate/)
sample, adapted to a 24-hour occupancy model instead of a single animated
value.

`AnimationClock` (`src/animationClock.ts`) fires two callbacks together on
every `requestAnimationFrame`, using wall-clock delta time so a simulated
day always takes ~6 real seconds regardless of frame rate:

- **`onTick`** updates the clock label and timeline position (cheap DOM
  writes).
- **`onRendererUpdate`** pushes a new Arcade expression to the map's
  renderer.

Neither is throttled — this matches Esri's own "Animate color visual
variable" sample, which updates its slider and renderer together on every
frame with no throttling either. They're kept as two callbacks for
architectural clarity (UI concerns vs. map concerns), not because they run
at different rates.

Dragging the timeline calls `AnimationClock.seek()`, which updates both
immediately. The speed slider calls `AnimationClock.setSpeedMultiplier()`,
which scales the clock's rate without resetting or rebuilding it.

### Quiet-hours time-warp

Autoplay doesn't move through the 24 simulated hours at a constant rate.
`AnimationClock` advances a normalized loop position (0-1) at constant
wall-clock speed and maps it to an hour via `mapLoopPositionToHour()`
(`src/occupancy.ts`), which compresses hours before `QUIET_HOURS_END`
(`src/config.ts`) into just `QUIET_HOURS_TIME_SHARE` of the loop's real
playback time, stretching the livelier rest of the day to fill the
remainder. With the real Lima data, little visibly changes before ~8am, so
by default that whole stretch is compressed into the first ~15% of each
loop instead of taking its "fair" linear third — the loop stays the same
length, but far more of it is spent where buildings are actually lighting
up. `mapHourToLoopPosition()` is the inverse, used by `seek()` so dragging
the timeline still jumps to the exact hour requested and autoplay resumes
from the right point in the warped loop. **Re-tune `QUIET_HOURS_END` and
`QUIET_HOURS_TIME_SHARE`** after watching the real data — if the livelier
stretch starts at a different hour, or needs more/less of the loop, those
two constants are the only thing to change.

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

`OCCUPANCY_COLOR_STOPS` in `src/map.ts` is deliberately back-loaded: idle
buildings (0) are a faint, translucent white — present as city fabric
without drawing the eye — staying muted through 0–70, and only 70–100
ramps quickly through hot pink into bright cyan. Combined with a high
bloom threshold (`bloom(2.8, 0px, 65%)`, only pixels in roughly the top
third of brightness actually bloom), a building only "flashes" while
genuinely near its peak, then fades quickly — rather than staying visibly
lit for a large share of the loop.

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

All user-facing UI text (title, subtitle, loading/error messages,
aria-labels) is in Spanish for the app's intended Lima audience.

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

## A note on performance vs. Esri's sample

Esri's "Animate color visual variable" sample uses a plain `field` reference
for its color/opacity visual variables — animating by changing numeric stop
*values* only, never the field itself. That's cheaper than this app's
approach, which re-evaluates an Arcade `valueExpression` on every renderer
update, because a per-feature Arcade evaluation runs on the CPU while a
field lookup is close to free for the GPU-based rendering pipeline.
This app needs Arcade because it blends *two different fields*
(`OCC_18`/`OCC_19`) by a live fraction — something a field-based visual
variable can't express — so that cost is inherent to smooth half-hour
interpolation, not a bug.

The other factor: that sample's map opens at a fixed `zoom="12"` on one
neighborhood and caps `minScale` so you can never zoom out far enough to
render its full 1M+ building dataset at once — you still have complete
freedom to pan and zoom, just not *out past* that point. This app now does
the same: `view.constraints.minScale` is capped at `LIMA_FALLBACK_SCALE`
(`src/config.ts`), so the initial fit to the real buildings extent
(`layer.fullExtent`) is automatically clamped to that scale if the real
data spans a wider area, and the user can't zoom out past it either.
Panning and zooming in remain completely unrestricted.

Renderer updates aren't throttled (see "How the animation works" above) —
if animation feels sluggish on real hardware with the real ~105k-feature
layer, reintroducing a throttle on `onRendererUpdate` in
`src/animationClock.ts` (e.g. capping it to every 60-100ms) is the first
thing to try.

## Scope

This implementation covers the first-milestone feature set: load the layer,
render all buildings by `OCC_00` initially, digital clock, hour
interpolation, a full animated 24-hour loop, Play/Pause, a speed slider,
and the final dark/bloom visual treatment. An earlier version also
included a hover tooltip (`OCC_TYPE` + current occupancy %), but it was
removed — the hit-test attributes it read weren't reliably matching the
live layer's data (frequently showing 0%/unknown), it added a per-frame
async hit-test on `pointer-move`, and it wasn't adding value the demo
needed.
