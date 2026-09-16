# El Ritmo de Lima (The Rhythm of Lima)

A demonstration built with the ArcGIS Maps SDK for JavaScript that visualizes
how simulated building occupancy changes across a 24-hour day, over roughly
105,000 real OpenStreetMap building footprints in Lima, Peru. The app's UI
is in Spanish for its intended audience; this README is in English for
developers.

The building geometries are real (OpenStreetMap). The occupancy simulation
is **synthetic**, generated for this demo — see the "Datos de ocupación
sintéticos" label in the app itself, and "Data model" below for exactly how.

## What it does

- Loads all buildings from a single ArcGIS Hosted Feature Layer and lets the
  `FeatureLayer`/`MapView` handle rendering — the ~105k features are never
  queried or copied into JavaScript memory.
- Colors every building by its **current simulated occupancy** (0–100)
  using a continuous Color Visual Variable. Each building stores three
  fields — `OCC_TYPE` (its use category), `PEAK_HR` (the hour its activity
  peaks) and `OCC_MAX` (its peak intensity) — and its full 24-hour activity
  curve is computed live in an Arcade expression from those plus the
  current simulated hour — see "Data model" below.
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

**The hosted feature layer must have an `OCC_TYPE` field** (see "Data
model" below) — if you're migrating an older version of this layer that
instead had `OCC_00`..`OCC_23`, republish it with `data/LIMA_OCC_TYPE.csv`.

Other scripts:

```bash
npm run build     # type-check (tsc --noEmit) + production build
npm run preview   # preview the production build locally
```

## Project structure

```
index.html               Page shell: overlays, HUD markup, title
data/
  LIMA_OCC_TYPE.csv       osm_id -> OCC_TYPE for all ~105k buildings (see scripts/)
scripts/
  classify_occ_type.py    Regenerates LIMA_OCC_TYPE.csv from a raw OSM export
src/
  main.ts                Wires everything together (bootstraps the app)
  config.ts               Configuration constants (feature layer URL, timing)
  arcgisConfig.ts         Points @arcgis/core at locally-served SDK assets
  occupancy.ts            Category activity curves, live Arcade expression, clock formatting
  map.ts                  Map/MapView/FeatureLayer creation, renderer, bloom
  animationClock.ts       requestAnimationFrame clock driving the UI and renderer together
  ui.ts                   DOM wiring for the clock, timeline, play/pause, overlays
  style.css               Dark, presentation-oriented styling
vite.config.ts            Vite config; copies @arcgis/core's runtime assets locally
```

## Data model

The feature layer stores exactly **three** fields per building —
`OCC_TYPE` (a use category such as `"residential"`, `"office"`,
`"hospitality"`), `PEAK_HR` (the real hour, 0-24, this specific building's
activity peaks at) and `OCC_MAX` (its peak occupancy intensity, 0-100) —
plus its existing `osm_id`. There's no per-hour data at all: `PEAK_HR` and
`OCC_MAX` are real, inspectable numbers already baked into the data, and
the app computes the rest of the 24-hour curve from them live. This
mirrors how Esri's own "Animate color visual variable" sample works: it
colors buildings from a single `CNSTRCT_YR` field and the current slider
value, not from decades of precomputed per-year fields.

An earlier version of this demo instead stored 24 fields per building
(`OCC_00`..`OCC_23`, one ChatGPT-invented value per hour). That worked, but
loading 24-25 numeric fields for ~105k features is real memory/network
cost that four fields avoids entirely — see "Why this is lighter than the
old 24-field model" below.

### How `OCC_TYPE` was derived

`data/LIMA_OCC_TYPE.csv` (`osm_id, OCC_TYPE`) was generated from the raw
OSM building export (`LIMA_Footprints.csv`, not included here — it has
`osm_id`, `type`, `name`, `AREA_M2`, etc. but no occupancy data) by
`scripts/classify_occ_type.py`, in priority order per building:

1. Its OSM `type` tag, if set (~25% of buildings) — mapped to one of the
   categories below (e.g. `house`/`apartments` → `residential`, `hospital` →
   `healthcare`, `school`/`university` → `education`).
2. A keyword match against its `name`, if set (~1% of buildings) — catches
   named landmarks with no `type` tag (e.g. "JW Marriott Hotel Lima" →
   `hospitality`, "Museo de Arte de Lima" → `civic_transit`).
3. A fallback by footprint area (`AREA_M2`) for the ~74% of buildings with
   neither: small footprints default to `residential`; larger ones split
   between office/retail/industrial via a deterministic pseudo-random value
   seeded by `osm_id` (reproducible — not re-randomized on every run).

Once a building has its category, the script also writes out two real
numbers per building — **not** computed later at render time:

- `PEAK_HR` — the hour (0-24) *this specific building's* activity peaks
  at, e.g. `13.5`. This is the field the whole animation is driven by, the
  same role `CNSTRCT_YR` plays in Esri's own "Animate color visual
  variable" sample — an actual, inspectable value you can open the CSV and
  read, not something hidden inside the app's code.
- `OCC_MAX` — this building's peak occupancy intensity (0-100).

Both start from the building's category's typical value (`CATEGORY_BASE` in
the script) and add a deterministic jitter seeded by the building's own
`osm_id`, so buildings in the same category don't all peak at the exact
same minute — e.g. `31146352,healthcare,12.93,87.9` is one specific
hospital peaking at 12:56, not "healthcare in general."

`PEAK_HR_JITTER` (currently +/-5h) has to be wide, not just "a little
per-building noise": residential alone is ~84% of the city, so a narrow
jitter (an earlier version used +/-1.5h) squeezed the vast majority of the
*entire map* into peaking within the same ~3-hour band — reading as one
synchronized citywide flash instead of a living, staggered city. At +/-5h,
individual residential buildings' peaks scatter across a real window
(roughly 20h through 5h) instead of a narrow slice of it.

Every category's base `OCC_MAX` is deliberately kept at 94+, with jitter
(`OCC_MAX_JITTER`, +/-6) capped so it can't push any building below 88 —
right at the color ramp's hot-pink/cyan "shine" stop. The point of the
animation is that *every* building visibly shines once a day, not just
dims up; they only differ in *when* they peak and how high/long they idle
(`floor`/`width`, below), never in *whether*, or how brightly, they shine.

Resulting distribution across the real ~105k buildings: **84% residential**,
6% retail_food, 4% office, 2% education, and the remaining ~4% split across
industrial, other, religious, healthcare and hospitality — a plausible mix
for a real city, where most buildings are homes.

To regenerate (e.g. after tweaking the category mapping or base peak/max
values):

```bash
python3 scripts/classify_occ_type.py LIMA_Footprints.csv data/LIMA_OCC_TYPE.csv
```

Then join that CSV to the building geometries by `osm_id` and republish the
hosted feature layer with `osm_id`, `OCC_TYPE`, `PEAK_HR` and `OCC_MAX` —
no `OCC_00`..`OCC_23` or `OCC_SRC` fields are needed.

### Category activity curves

`CATEGORY_SHAPES` in `src/occupancy.ts` defines, per category, how WIDE
that category's activity peak is and its baseline floor — the only two
curve parameters *not* stored per building, since they're roughly constant
within a category (a school's activity window is sharp; a hospital's is
broad and never drops to zero). Tuned against the real category mix above
to produce the intended citywide story purely from the aggregate of many
buildings peaking at different hours: residential dominant overnight and at
dawn, offices/schools ramping up through the morning, business/retail
peaking midday, and a shift back toward residential/hospitality in the
evening. Must match `CATEGORY_BASE`'s category list in
`scripts/classify_occ_type.py`.

`getOccupancyExpression()` builds the actual Arcade expression: it reads
`PEAK_HR` and `OCC_MAX` directly (already-jittered numbers, no computation
needed), looks up `OCC_TYPE`'s width/floor via `Decode()`, and computes a
Gaussian-like falloff from the *circular* distance between the injected
current simulated hour and `PEAK_HR`. Re-tuning a category's curve *shape*
(width/floor) only needs a code change to `CATEGORY_SHAPES`; re-tuning its
typical peak hour/intensity (`CATEGORY_BASE`) means regenerating the CSV,
since those are baked into the data.

## How the animation works

The layer's renderer never gets rebuilt during playback — only the color
visual variable's `valueExpression` string is updated, the same technique
as Esri's "Animate color visual variable" sample.

`AnimationClock` (`src/animationClock.ts`) fires two callbacks together on
every `requestAnimationFrame`, using wall-clock delta time so a simulated
day always takes ~6 real seconds regardless of frame rate:

- **`onTick`** updates the clock label and timeline position (cheap DOM
  writes).
- **`onRendererUpdate`** pushes a new Arcade expression to the map's
  renderer.

Neither is throttled — this matches Esri's own sample, which updates its
slider and renderer together on every frame with no throttling either.
They're kept as two callbacks for architectural clarity (UI concerns vs.
map concerns), not because they run at different rates.

Dragging the timeline calls `AnimationClock.seek()`, which updates both
immediately. The speed slider calls `AnimationClock.setSpeedMultiplier()`,
which scales the clock's rate without resetting or rebuilding it.

`AnimationClock` advances a normalized loop position (0-1) at constant
wall-clock speed and maps it *linearly* to a simulated hour via
`mapLoopPositionToHour()` (`src/occupancy.ts`) — every real-time second
always advances the clock by the same number of simulated hours, day or
night. `mapHourToLoopPosition()` is the inverse, used by `seek()` so
dragging the timeline always jumps to the exact hour requested.

An earlier version of this could compress "quiet" hours into a smaller
slice of real playback time, stretching the livelier rest of the day to
fill the remainder. It was tuned once against the old 24-field data, which
had one obvious dead stretch — but every model since (the category-curve
model, then the twinkle/shine/spread tuning above) already spreads
liveliness across the whole loop on its own, so that time-warp had become
inert (mathematically identical to a plain linear mapping, not just
visually) and was removed. If a stretch of the loop ever feels dead again,
tune the occupancy model itself (`CATEGORY_SHAPES`/`CATEGORY_BASE`,
`RIPPLE_*`) rather than reintroducing a variable-speed clock — a building
looking dim because the *clock* is briefly sprinting through its hour is a
much easier thing to misread as "nothing happening there" than an actually
dim building.

## Visual design

`OCCUPANCY_COLOR_STOPS` in `src/map.ts` is deliberately back-loaded: idle
buildings (0) sit at a dim, dark purple — glowing faintly as city fabric,
never a flat gray/white that reads as "off" — staying muted through 0–70,
and only 70–100 ramps quickly through hot pink into bright cyan. Combined
with a high bloom threshold (`bloom(2.8, 0px, 65%)`, only pixels in
roughly the top third of brightness actually bloom), a building "flashes"
while genuinely near its peak, then fades — rather than staying visibly
lit for a large share of the loop, while never looking fully dark
in between.

Every building's `CATEGORY_BASE` intensity in `scripts/classify_occ_type.py`
is high enough (94+, jittered) that its true peak always clears the "88"
hot-pink/cyan stop — every single building actually *shines* once a day,
not just crosses into a duller mid-tone.

Because each category has a single main peak (not an arbitrary multi-peak
curve), a building's color rises and falls smoothly once per loop around
its category's peak hour, circularly (so a residential building peaking at
1am is already brightening again late in the evening) — but that alone
made the whole city read as *one* synchronized wave (quiet mornings, one
big midday-to-evening swell, quiet again), since most buildings share a
category-typical peak. `getOccupancyExpression()` in `src/occupancy.ts`
layers a faster "twinkle" on top (`RIPPLE_CYCLES_PER_DAY`/
`RIPPLE_AMPLITUDE` in `src/config.ts`): a small, capped brightness boost
that cycles several times a day, phase-shifted per building by its own
`osm_id`, so buildings flicker up and down individually — some in step
with nearby-id neighbors (often literally nearby buildings, since OSM
export order tends to cluster by location), most not — instead of the
whole city moving in lockstep. It only ever adds brightness on top of the
main curve, so each building's true `PEAK_HR` flash is always its
brightest moment of the day.

### UI chrome

The title card (top-left) and clock/timeline HUD (bottom-left, shrunk down
so the map — not the chrome — stays the focal point) both load "Space
Grotesk" for headings and "Inter" for body copy from Google Fonts
(`index.html`), falling back to the system sans-serif stack if that fetch
ever fails. The title uses a warm yellow (`--accent-warm` in
`src/style.css`) against the map's cool cyan/purple palette for contrast,
with a left accent bar tying it to the same color; body/credit text uses
higher-contrast, non-uppercase copy so it's actually legible at a glance.
The clock is labeled "Hora simulada" since it's a 24h simulated readout,
not a real AM/PM clock.

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

## Performance notes

**Why this is lighter than the old 24-field model.** The layer's
`outFields` is now `[osm_id, OCC_TYPE, PEAK_HR, OCC_MAX]` — four fields per
building instead of twenty-five — which is the single biggest lever
available here: less data to fetch, decode and hold in memory for ~105k
features, independent of anything about the renderer itself. `PEAK_HR`/
`OCC_MAX` as numeric fields and `OCC_TYPE` as a short text field are all
cheap; if `OCC_TYPE` ends up stored as a much longer text field than the
category names actually need on the hosted layer, that's worth checking
with whoever manages it, though it matters far less than the old 24-field
payload did.

**Why Arcade is still used, not a plain `field` reference.** Esri's sample
animates by changing color-stop *values* against a static `field`
(`CNSTRCT_YR`), which is cheaper than evaluating an expression because a
field lookup is close to free for the GPU-based rendering pipeline, while
Arcade evaluation runs per-feature on the CPU. This app can't quite do the
same thing: `CNSTRCT_YR` is linear (years only increase) and its distance
to the slider value is a simple subtraction, but each building's distance
from `PEAK_HR` to the current hour is *circular* (23:00 is close to 00:00),
which a plain field+stops model can't express — so computing that distance
still needs an expression. The expression itself is now cheap regardless:
it reads `PEAK_HR`/`OCC_MAX` directly (no jitter math anymore — that's
baked into the stored values) and only does a small `Decode` for
`OCC_TYPE`'s width/floor, versus the old model's 2-of-24 field reads plus
rebuilding a brand-new expression string every update.

**The other factor: zoomed-out feature count.** Esri's sample opens at a
fixed `zoom="12"` on one NYC neighborhood and caps `minScale` so you can
never zoom out far enough to render its full 1M+ building dataset at once
— you still have complete freedom to pan and zoom, just not *out past* that
point. This app does the same: `view.constraints.minScale` is capped at
`LIMA_FALLBACK_SCALE` (`src/config.ts`), so the initial fit to the real
buildings extent (`layer.fullExtent`) is automatically clamped to it if the
real data spans a wider area, and the user can't zoom out past it either.
Panning and zooming in remain completely unrestricted.

Renderer updates aren't throttled (see "How the animation works" above) —
if animation still feels sluggish on real hardware with the real
~105k-feature layer, reintroducing a throttle on `onRendererUpdate` in
`src/animationClock.ts` (e.g. capping it to every 60-100ms) is the next
thing to try.

## Scope

This implementation covers the first-milestone feature set: load the layer,
render all buildings from their `OCC_TYPE` category, digital clock, a full
animated 24-hour loop, Play/Pause, a speed slider, and the final dark/bloom
visual treatment. An earlier version also included a hover tooltip
(`OCC_TYPE` + current occupancy %), but it was removed — the hit-test
attributes it read weren't reliably matching the live layer's data
(frequently showing 0%/unknown), it added a per-frame async hit-test on
`pointer-move`, and it wasn't adding value the demo needed.
