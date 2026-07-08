# Plan: point DWC's GCodeViewer at the `jaysuk/gcodeviewer` fork

Branch: `gcodeviewer-fork-integration` (created off `v3.7-dev`).

## Progress log

- **Babylon 7→9 upgrade**: done and verified (`npm run build` clean, `HeightMap` plugin
  typechecks with no `@ts-ignore` masking anything, single consolidated Babylon chunk in the
  output). Not yet visually confirmed in a browser by a human - do that before merging.
- **Phase 1 (prove the pipe works)**: done and verified. `@duet3d/gcodeviewer` wired in as
  `"file:../gcodeviewer"` in `package.json`. Built a throwaway, isolated smoke-test harness at
  `src/plugins/GCodeViewerForkTest/` (does **not** touch the real `GCodeViewer.vue`) and drove it
  with a real Edge browser via Playwright. Confirmed: the package resolves through DWC's own Vite
  bundling, the Web Worker + `OffscreenCanvas` spin up correctly under DWC's origin (`BJS -
  Babylon.js v9.15.0 - WebGL2` logged from inside the worker), `enableWasmProcessing()` fails
  cleanly with the expected "not built" message and falls back to the TypeScript parser exactly as
  designed, and a full load → mesh-build → `fileloaded` cycle completes with zero console errors
  and zero failed network requests. **The single biggest open risk from this plan (worker/WASM
  asset delivery inside a real consumer bundle) is resolved for the worker path.** WASM specifically
  was only exercised via its fallback stub here (no Rust toolchain in this environment) - a real
  `wasm-pack`-built `.wasm` loading through the inlined worker under DWC's origin still needs
  testing on a machine that has the toolchain.
  - **Note found along the way**: built-in DWC plugins (including the pre-existing `GCodeViewer`)
    only get their routes registered *after a successful machine connection* (`loadDwcPlugins()` is
    called from inside `machine.ts`'s connect flow, not on app boot) - there is no offline/demo
    connector. The smoke-test harness works around this by importing the fork directly via its
    Vite dev URL (`page.evaluate(() => import('/src/.../standalone-test.ts'))`), bypassing routing
    entirely. Real end-to-end testing of the actual `GCodeViewer.vue` (Phase 3+) will need either a
    reachable Duet board/simulator or the same page.evaluate-style bypass.
- **Phase 2 (lifecycle correctness)**: done in the fork and verified via the same smoke-test
  harness. `loadFile()` now returns `Promise<{start, end, failed}>` (resolves rather than rejects on
  a bad file); added `reload()` and `clear()`, wired identically through `Processor`, `Viewer`, the
  worker protocol, `ViewerProxy`, and `ViewerDirect`, with the shared `ViewerApi` interface updated
  so both stay in sync. Verified a load → reload → clear → load-again → empty-file cycle, all
  resolving correctly, no console errors. Committed to the fork repo (`fc18494`).
  - Still open from Phase 2's scope: the fork itself doesn't yet do anything wrong regarding
    `unload()` - that fix belongs in `GCodeViewer.vue`'s `onBeforeUnmount` (Phase 3), which
    currently just does `viewer = null` with no `unload()` call.
- **Phase 3 (direct-match settings) + Phase 4 (camera framing): done, `GCodeViewer.vue` now
  imports `@duet3d/gcodeviewer` instead of `@sindarius/gcodeviewer`.** `vue-tsc --noEmit` passes
  clean across the whole app. Verified end-to-end in a real DWC build (not just the smoke-test
  harness): force-loaded the actual plugin via `loadDwcPlugin('GCodeViewer')` + `router.push`
  (bypassing the "must connect to a machine first" gate noted under Phase 1), and the real
  component mounted with the bed grid, RGB axes, and orientation viewbox all rendering correctly,
  zero console errors. Screenshot confirms it. Camera framing (`frameToContent`, ported from this
  file's old `applyDefaultOrientation`/`getPrintBounds`/`framingCorners`/`frameToViewport`) ran
  during mount without error.
  - Also fixed the missing `viewer.unload()` call in `onBeforeUnmount` (was just `viewer = null`,
    leaking the worker/Babylon/WASM instance on every unmount).
  - `setGCodeValues()` is now driven by the `LoadFileResult` returned from `loadFile()`/`reload()`
    rather than reading properties back off the viewer (which doesn't expose any).
  - `updateColor`/`updateTools` now build the full tool-color array and call `setTools()` once
    (bulk), matching the fork's design, instead of the old reset+add-per-tool loop.
  - Mesh-mode/render-mode/progress-mode changes (`forceWireMode`, `useHQRendering`, `colorMode`,
    `progressMode`) no longer trigger a full `reloadviewer()` - the fork's `setMeshMode`/
    `setRenderMode`/`setProgressMode` are instant uniform switches, unlike the old package. `zBelt`/
    `zBeltAngle` changes still trigger `reloadviewer()`, since those are genuinely parse-time
    settings in the fork.
  - **Newly discovered gaps this rewrite surfaced** (not in the original Phase 6 question set,
    not yet decided): `g1AsExtrusion` (treat every G1 as extrusion, a travel-heavy-file
    troubleshooting aid), `transparencyPercent` (continuous 0-100 alpha, distinct from
    `vertexAlpha`'s boolean ghosting toggle which *does* map cleanly to `setAlphaMode`),
    `useSpecularColor`, and `toggleTravels` (show/hide travel moves entirely, distinct from
    `persistTravels`). All currently stubbed as no-ops with `// TODO` comments in the component.
  - `setCursorVisiblity` was mapped to `toggleNozzle()` as the closest analog, per the plan's
    original flag that this mapping is a guess, unverified against the old package's actual
    source.
- **Also fixed along the way, in the fork (not DWC-specific, but surfaced by this work):** the
  worker's faked `window`/`document` objects had no `removeEventListener`, so
  `Engine.dispose()` (called from `unload()`) threw partway through its own cleanup and aborted
  the rest of it. Real bug, unrelated to DWC integration specifically, would have hit any consumer
  eventually.
- **Uncommitted in this repo right now**: `package.json`/`package-lock.json` (Babylon bump + the
  fork's `file:` dependency), `src/stores/settings.ts` (added `"GCodeViewerForkTest"` to the default
  `enabledPlugins` list so the smoke-test plugin can load - **temporary, remove alongside the
  plugin folder once no longer needed**), `src/plugins/GCodeViewerForkTest/` (the smoke-test
  harness itself, still useful for further Phase 5 iteration - not required for the app to work),
  `src/plugins/GCodeViewer/GCodeViewer.vue` (the actual rewrite), and this plan file. Nothing
  committed yet in this repo pending your review.
- **Phase 6 decisions - settled, not open anymore:**
  - **Nozzle tracking**: build live-machine-position tracking (new `setNozzlePosition({x,y,z})`
    passthrough) *in addition to* the fork's existing file-position tracking - not a replacement.
  - **Render quality**: simplify DWC's settings panel to the fork's actual knobs (mesh mode, max
    FPS) instead of porting the old 1-6 preset system.
  - **Build all four "minor feature" gaps** (none dropped): live workplace-offset sync
    (G54-G59.3), a travel-line persistence toggle, a workplace-offset visibility gizmo, and
    cancel-in-progress-load.
  - **Feed-rate legend**: build the configurable version (min/max colors + numeric range), not the
    fork's fixed gradient.
  - Net effect: Phase 5's scope is larger than originally sketched - almost everything gets built
    rather than simplified away. See also the `dwc-integration-scope-decisions` memory entry.

## Bottom line up front

**This is not a dependency swap.** `src/plugins/GCodeViewer/GCodeViewer.vue` (1642 lines) is built
against `@sindarius/gcodeviewer@3.7.17` — a synchronous, main-thread library that hands the
component direct references to live Babylon objects (`viewer.scene`, `viewer.bed`,
`viewer.gcodeProcessor`, `viewer.buildObjects`, `viewer.scene.activeCamera`, …) and lets it read
and mutate their internals freely, plus a `processFile()` the component `await`s to completion.

The fork at `c:\Users\live\Documents\Github\gcodeviewer` (`@duet3d/gcodeviewer`) is a from-scratch
rewrite: the whole scene lives in a Web Worker behind an `OffscreenCanvas`, and the only surface a
consumer ever touches is `Viewer_Proxy`, a fire-and-forget `postMessage` facade plus a `passThru`
event callback. No internal object is ever exposed. `loadFile()` returns `void`, not a `Promise`.

Those two facts alone mean **every** camera-framing calculation, every "read the current value to
seed a UI control" pattern, and the load-then-continue control flow in `GCodeViewer.vue` has to be
rebuilt, not just re-pointed. Below is the actual gap inventory, then a phased plan.

## Also: dependency and build compatibility

- **Babylon.js major-version gap.** DWC depends on `@babylonjs/core@^7.54.3` (also `gui`,
  `materials`). The fork depends on `@babylonjs/core@^9.15.0`. That's two majors apart. Either DWC
  upgrades its own Babylon dependency to 9.x (blast radius: `src/plugins/HeightMap/3dbjs.ts` and
  `axes.ts` are the only other Babylon consumers in DWC — worth a regression pass but likely
  survivable), or the app ships two copies of Babylon (large bundle bloat, real risk of runtime
  conflicts from Babylon's side-effect imports registering things like mesh builders/loaders
  globally). **Recommend upgrading DWC's Babylon to 9.x** rather than carrying two copies.
- **Worker/WASM asset delivery is the single biggest unknown.** The fork's `vite.config.mjs`
  resolves `viewer.worker?worker&inline` at the fork's *own* build time, so by the time DWC imports
  `@duet3d/gcodeviewer`, the worker is already inlined as a blob string inside `dist/index.es.js` —
  DWC needs no worker-specific bundler config for that part (good; DWC's `vite.config.mts` already
  has its own worker handling for Monaco, so the tooling is exercised, just not for this). The real
  risk is the WASM module: `wasm-bindgen`'s `init()` resolves `gcode_file_processor_bg.wasm`
  relative to `import.meta.url`, and inside a blob-URL-constructed worker running under DWC's
  origin/CSP, that resolution has never been tested (this was flagged as an open risk in the fork's
  own audit, item 31, and never verified because the fork was never actually loaded inside a real
  consumer app until now). **This must be the first thing verified** — if it fails, either the WASM
  fast path degrades silently to the TypeScript parser fallback (acceptable) or it hard-fails
  (needs a fix in the fork). Test in Phase 1 before writing any adapter code.
- **Packaging for local development**: point DWC's `package.json` at the fork via a `file:` or
  `link:` dependency (e.g. `"@duet3d/gcodeviewer": "file:../gcodeviewer"`, adjusting the relative
  path), and run `npm run build` in the fork repo first — DWC consumes `dist/`, not `src/`. `npm
  link` works too but `file:`/`link:` in `package.json` is more reproducible for a team. Longer
  term this needs either a real npm publish (scope: `@duet3d`, matching the fork's current
  `package.json` name — is that scope owned by the actual Duet3D org, or does the package need
  renaming before publishing?) or a git-URL dependency pinned to a commit/tag.

## API gap inventory

Legend: **✅ direct match** (fork already has an equivalent async call) · **🟡 adapter needed**
(fork has the pieces, DWC-side logic needs restructuring) · **🔴 missing in fork** (net-new work in
the fork itself, not just DWC-side glue) · **⚠️ needs a decision** (conceptual mismatch, not a bug)

### Lifecycle & loading

| DWC calls today | Fork today | Status |
|---|---|---|
| `new gcodeViewer(canvas)`, `await viewer.init()` | `new Viewer_Proxy(canvas)`, `.init()` | ✅ |
| `await viewer.processFile(blob)` (blocks until fully loaded) | `loadFile(file): void` (fire-and-forget; completion signalled later via `passThru({type:'fileloaded', ...})`) | 🔴 **fork needs a Promise-returning `loadFile`**, or DWC restructures every call site to move post-load logic (`setGCodeValues()`, `applyDefaultOrientation()`, `buildObjects.loadObjectBoundaries()`) into the `'fileloaded'` event handler. Recommend adding the Promise wrapper to the fork (mirrors the existing `enableWasmProcessing()`/`getProcessingStats()` pattern already in `viewer-proxy.ts`) so `GCodeViewer.vue`'s control flow barely changes. |
| `viewer.lastLoadFailed()` / `viewer.clearLoadFlag()` | nothing | 🔴 fork swallows a failed parse into an empty-but-valid state (post-audit fix) with no flag consumers can check. Needs a `loadFailed` field on the `'fileloaded'`/a new event. |
| `viewer.clearScene(true)` | nothing public (`cleanup()` is private, only runs at the top of `loadFile`) | 🔴 need a public `clear()`/`unloadModel()` on `Viewer_Proxy`. |
| `await viewer.reload()` (re-parses the same file after a setting change) | nothing public (`setPerimeterOnly()` does this internally) | 🔴 need a public `reload()` that re-triggers `processor.loadFile(originalFile)`. |
| `viewer.fileData` / `viewer.fileSize` (read) | nothing (worker never sends the raw text back) | 🔴 `fileData` feeds the raw-text "code view" panel (`viewGCode`/`CodeStream.vue`) — needs the file text (or per-line ranges via the existing `getGCodes`) piped back, or that panel is re-architected to pull ranges on demand (`getGCodes` already exists and is a better fit than holding the whole file in memory twice). `fileSize` maps to the existing `'fileloaded'` event's `start`/`end`. |
| on unmount: `viewer = null` (no explicit dispose call) | `unload()` must be called to terminate the worker | ⚠️ **this is a latent bug waiting to happen**, not a feature gap: if `GCodeViewer.vue`'s `onBeforeUnmount` isn't changed to call `viewer.unload()` first, every mount of this component leaks a worker + its whole Babylon/WASM instance. Must fix in the same change that swaps the import. |

### Camera / framing

| DWC calls today | Fork today | Status |
|---|---|---|
| `viewer.scene.activeCamera.{target,alpha,beta,radius}`, `.getViewMatrix()`, `.getProjectionMatrix()`, `viewer.scene.getEngine().getRenderWidth/Height()`, `viewer.scene.render(true)` — ~230 lines of custom viewport-fitting math (`applyDefaultOrientation`, `framingCorners`, `frameToViewport`) that iteratively reprojects bounding-box corners each frame | `resetCamera()`, `setCameraDirection(direction)` — fixed, non-adaptive framing | 🔴 **biggest single gap.** None of this math can run against a worker-hosted camera without either (a) a message round trip per iteration (too slow/chatty for an 8-14-pass convergence loop), or (b) porting the whole algorithm into the fork so it runs where the camera actually lives, exposed as one new async call (e.g. `frameToPrintBounds()` / `resetCameraForCurrentFile()`). **Recommend (b)** — port `getPrintBounds`/`framingCorners`/`frameToViewport` into `Viewer`/`Processor` almost verbatim (the math is coordinate-system-agnostic and doesn't reference anything DWC-specific), fire it automatically after load and on `resetCamera()`, and drop the DWC-side copies. |
| `viewer.gcodeProcessor.renderedLines` (read, used only to compute the print bounding box above) | nothing (no `renderedLines` equivalent is exposed, nor should it be — pulling the whole geometry array across a worker boundary defeats the point of the worker) | 🔴 covered by the point above — once bounds-fitting moves into the fork, this read disappears entirely rather than needing a replacement. |

### Bed / axes / build objects

| DWC calls today | Fork today | Status |
|---|---|---|
| `viewer.bed.buildVolume[x/y/z].min/max` (direct mutation) + `.commitBedSize()` | `setBuildVolume(volume)` | ✅ (combine into one call) |
| `viewer.bed.setDelta(bool)` | `setDeltaBed(bool)` | ✅ |
| `viewer.bed.setRenderMode(n)` | `setBedRenderMode(n)` | ✅ |
| `viewer.bed.setBedColor(v)` | `setBedColor(v)` | ✅ |
| `viewer.bed.getBedColor()`, `.renderMode`, `viewer.axes.visible` (all read, only used once at mount to seed UI state) | no getters anywhere (one-way `set*` messages only, by design of the worker architecture) | 🟡 **not a fork gap** — DWC currently seeds its UI from the viewer's live defaults; the adapter should instead own these as DWC-side defaults (`Bed`'s default color is `#0000FF`, mode `0` — hardcode those as the initial `ref()` values) rather than requesting them back. Simpler and removes a whole class of request/response messages this doesn't need. |
| `viewer.axes.show(bool)` | `showAxes(bool)` | ✅ |
| `viewer.buildObjects.objectCallback`/`.labelCallback` (direct sync function assignment) | worker already posts `{type:'objectSelected'}` / `{type:'objectLabel'}` through `passThru` | ✅ mechanical: replace the two callback assignments with two `case` branches in the `passThru` switch. |
| `viewer.buildObjects.showLabel` (read, seeds `showObjectLabels` at mount) | no getter | 🟡 same as bed/axes above — hardcode the fork's actual default (`true`, per `buildobjects.ts`) instead of reading it back. |
| `viewer.buildObjects.loadObjectBoundaries()`, `.showObjectSelection()`, `.showLabels()` | `loadObjectBoundaries()`, `showObjectSelection()`, `showObjectLabels()` | ✅ |

### `gcodeProcessor` (the big one — every render/color/quality knob)

| DWC calls today | Fork today | Status |
|---|---|---|
| `updateFilePosition(v)` | `updateFilePosition(position, animate?)` | ✅ |
| `perimeterOnly` (property) | `setPerimeterOnly(bool)` | ✅ |
| `progressMode` (property) | `setProgressMode(bool)` | ✅ |
| `setColorMode(n)` / `colorMode` | `setRenderMode(n)` | 🟡 **numbering differs**: DWC's UI is 0=color(tool), 1=feedrate, 2=feature; the fork's `renderMode` is 0=feature, 1=tool, 2=feedrate. A translation table is required, not a passthrough — this is exactly the kind of silent bug that ships if missed. |
| `setLiveTracking(bool)`, `doFinalPass()` | nothing (no live/finished distinction — the fork just reflects whatever `filePosition` you last pushed) | 🔴 needs a decision, not just code: does "live tracking" become "DWC keeps calling `updateFilePosition` on every object-model tick" (which the fork already supports), with `doFinalPass`'s job (reveal-everything when a job ends) becoming a single `updateFilePosition(Number.MAX_VALUE)` call? That looks sufficient — recommend dropping the dedicated live/final concept rather than porting it. |
| `useSpecularColor(bool)`, `setAlpha(0-1)`/`setTransparencyValue(0-1)`, `updateMinFeedColor`/`updateMaxFeedColor` + `minFeedColorString`/`maxFeedColorString` (read), `updateColorRate(min,max)` + `minColorRate`/`maxColorRate` (read), `maxFeedRate` (read, sizes the legend) | none of this exists in the fork's shader/material API | 🔴 real, separate feature work: the fork's line shader has hardcoded specular-ish lighting, a boolean (not continuous) alpha mode, and a fixed blue→red feedrate gradient with no configurable endpoints or exposed min/max. Each needs new uniforms + new `LineShaderMaterial`/`Processor`/`Viewer_Proxy` methods. This is probably its own sub-project, not a quick add. |
| `updateForceWireMode(bool)`, `useHighQualityExtrusion(bool)` | `setMeshMode(0\|1\|2)` (box/cylinder/line) | 🟡 the fork collapses two independent old booleans into one tri-state enum. Adapter logic: `wireMode ? 2 : (highQuality ? 1 : 0)`. Loses the ability to have "high quality + wire" simultaneously if that combination mattered in the old UI — check whether it did before finalizing the mapping. |
| `setTravelPersistence(bool)`, `persistTravels` | nothing (travel highlight is a fixed animation window, see `lineshader.ts`) | 🔴 needs a new shader/material toggle to keep the travel highlight rather than let it fade. |
| `resetTools()` + `addTool(color, diameter)` per color, or `updateTool(color, diameter, index)` for a single change | `setTools(fullArray)` (bulk replace only) | 🟡 straightforward: DWC always has the full `toolColors` array in a ref already: build the full array and call `setTools()` once instead of reset+loop, and on a single-swatch edit still send the full array (already what the debounce in `updateColor` effectively produces). |
| `currentWorkplace` (property) + `workplaceOffsets` (array of `Vector3`, pushed per-WCS) | nothing public — the fork tracks workplace state purely from G-code (`G54`-`G59.3`) parsed *within the file itself*; there's no way to tell an already-loaded model "the machine is now on WCS 3" from outside | 🔴 real gap: this is how DWC reflects the machine's *live, currently active* work offset onto the render (independent of what's baked into the loaded file), used for jog/preview alignment. Needs a new `setActiveWorkplace(index, offsets)`-style API into `ProcessorProperties`/render-position math. |
| `cancelLoad = true` | nothing — `loadFile()` has no cancellation point once started | 🔴 real gap for large files; needs an abort mechanism threaded through the chunked parse loops. |
| `forceRedraw()` | not obviously needed — the fork's worker render loop redraws continuously up to `maxFrameRate` on its own | 🟡 likely a no-op to drop, but verify: confirm every DWC call site that calls `forceRedraw()` after a color/mode change actually sees the update on the fork without it (should, since the shader material uniforms update via `onBindObservable` each frame) — this is a "delete and verify," not a port. |

### Simulation / nozzle tracking

| DWC calls today | Fork today | Status |
|---|---|---|
| `simulation` (bool), `startSimulation()`, `stopSimulation()`, `simulationMultiplier`, `simulationUpdatePosition` callback, `simulationStopped` callback | `startNozzleAnimation()`, `pauseNozzleAnimation()`, `resumeNozzleAnimation()`, `stopNozzleAnimation()`, `toggleNozzle(bool)`, events `animationStarted`/`Paused`/`Resumed`/`Stopped`/`animationPositionUpdate` | 🟡 structurally similar, names differ — mechanical adapter, plus wire `simulationMultiplier` through to a **new** fork API (see next row). |
| (`simulationMultiplier` sets playback speed) | `Nozzle.setAnimationSpeed()` exists but is never exposed past `Processor.initNozzle`'s hardcoded `10.0` | 🔴 small addition: thread a `setNozzleAnimationSpeed(n)` through `Processor`→`Viewer`→`Viewer_Proxy`. |
| `updateToolPosition(positions[])` — pushes the *actual live machine position* onto the on-screen nozzle in real time while printing, independent of file-position lookup | Nozzle only positions itself by looking up the closest tracked *file position* (`updateFilePosition` → `updateNozzlePositionInstant/Animated`) — there's no "just put it at this raw XYZ" entry point | 🔴 **needs a product decision**: is "nozzle glued to the live reported machine position" a feature worth porting (net-new `setNozzlePosition({x,y,z})` passthrough), or is "nozzle follows file-position progress" an acceptable design change? These produce visibly different behavior during an actual print (the old one tracks the *real* toolhead; the file-position version tracks parsed progress, which drifts from the physical toolhead under pause/resume, mesh compensation, retraction moves, etc.). |
| `setCursorVisiblity(bool)` | ambiguous — likely maps to `toggleNozzle(bool)` if "cursor" means the tool-position marker, but **unverified**: `@sindarius/gcodeviewer`'s source isn't available locally, only its published `dist/`, so this is a guess from the name and call sites, not confirmed behavior | ⚠️ verify against the old package's actual dist/behavior (or ask Sindarius/check any changelog) before assuming this maps to the nozzle. |

### Misc

| DWC calls today | Fork today | Status |
|---|---|---|
| `setBackgroundColor(v)`, `setCameraInertia(bool)`, `setZClipPlane(top,bottom)` | same names, same signatures | ✅ |
| `getBackgroundColor()`, `getProgressColor()` (read, mount-time seed) | one-way `setBackgroundColor` only; `setProgressColor` **doesn't exist on `Viewer_Proxy` at all** (it's internal to `LineShaderMaterial`, never wired through `Processor`/`Viewer`) | 🔴 `setProgressColor` needs to be threaded through as a new public method (small, follows the exact pattern of `setBackgroundColor`); the getters should be dropped in favor of DWC owning its own persisted default, same reasoning as the bed/axes getters above. |
| `setZBelt(bool, angle)` | `props.zBelt`/`gantryAngle` exist and are used during parsing, but there's no public API to set them before a load | 🔴 small, mechanical addition: `setZBelt(enabled, angle)` on `Processor`→`Viewer`→`Viewer_Proxy`, mirroring `setBuildVolume`'s pattern. |
| `setWorkplaceVisiblity(bool)` | no concept of a workplace-offset gizmo in any `Renderables/*` | 🔴 net-new renderable, or drop the feature — this is a UI affordance for CNC/jog work, not core to viewing a print; worth asking whether it's actually used before building it. |
| `renderQuality` (1-6 preset: sbc/low/medium/high/ultra/max) + `updateRenderQuality(n)` | no preset concept — the fork has independent low-level knobs (`setMeshMode`, `setMaxFPS`; per-chunk `breakPoint` is hardcoded internally, not exposed) | ⚠️ **needs a design decision**: either build a DWC-side translation table (`renderQuality` → some combination of `setMeshMode`/`setMaxFPS`/future knobs) or simplify the settings panel to expose the fork's actual independent controls instead of a single quality slider. Recommend the translation-table approach first (keeps the existing UI/UX and cached user prefs intact) and only simplify the panel if the mapping turns out too lossy. |

## Recommended phasing

Do not attempt this as one change. Suggested order, each a mergeable increment:

1. **Prove the pipe works at all.** Wire the `file:` dependency, swap the import, and get the
   *absolute* minimum path working: construct, `init()`, load one small test file, see it render,
   confirm WASM either activates or falls back cleanly (see the asset-delivery risk above — this
   is the go/no-go gate for everything else). No settings UI wired up yet.
2. **Lifecycle correctness.** Add the Promise-wrapped `loadFile`, `clear()`/`unloadModel()`,
   `reload()`, and a load-failure signal to the fork; fix the missing `unload()` call on unmount.
   Get `GCodeViewer.vue`'s core load/clear/reload/unmount flow working end-to-end before touching
   any cosmetic setting.
3. **Direct-match settings.** Wire everything in the "✅" rows above — background color, camera
   inertia, Z-clip, bed volume/delta/render-mode/color, axes, mesh mode, alpha/progress mode,
   perimeter-only, picking enable/disable, object-selection callbacks. This is almost entirely
   mechanical and de-risks the adapter plumbing before the harder parts.
4. **Camera framing.** Port `getPrintBounds`/`framingCorners`/`frameToViewport` into the fork as a
   first-class method fired after load and on reset. This is the largest single chunk of "port,
   don't adapt" work and should land before anyone tries to actually use the viewer day-to-day,
   since without it every loaded file opens mis-framed.
5. **Straightforward net-new fork APIs.** `setZBelt`, `setProgressColor`, `setNozzleAnimationSpeed`,
   bulk `setTools` adapter, colorMode-numbering translation table, `forceRedraw` removal-and-verify.
6. **Decisions before building:** live-vs-file-position nozzle tracking, the workplace-offset live
   sync, travel persistence, feed-rate legend (colors + range), render-quality preset mapping,
   `setCursorVisiblity`'s real meaning, whether workplace-visibility and cancel-load are worth
   building at all. Each of these changes what "done" means, so they need an answer before the
   corresponding fork work starts, not after.
7. **Non-functional pass.** Babylon 7→9 upgrade + regression-test `HeightMap` plugin; real
   cross-browser check of the WASM/worker path (mobile Safari and any kiosk/embedded browser DWC
   targets, not just desktop Chrome); memory/leak check across repeated mount/unmount (the
   `unload()` fix in phase 2 is necessary but should be verified, not assumed); a rough performance
   comparison against `@sindarius/gcodeviewer` on a large real-world file, since a worker-based
   design should win on main-thread responsiveness but the actual numbers haven't been measured.

## What I did *not* do this turn

I did not write any adapter code or touch the fork's source further — this file is the plan you
asked for. The branch (`gcodeviewer-fork-integration`) exists but has no commits yet beyond
whatever was already pending (`package-lock.json`); this plan file itself is currently uncommitted,
pending your go-ahead on scope and the open decisions flagged with ⚠️ above.

## Progress log - Phase 5b-5h (net-new fork APIs from the Phase 6 decisions)

All four Phase 6 "build it" decisions plus the render-quality-panel simplification are implemented
and verified end-to-end (Playwright + a throwaway large-file test, not just typecheck/build):

- **5b - live nozzle tracking**: fork gets `Processor.setNozzlePosition({x,y,z})` /
  `Viewer.setNozzlePosition()` / worker case `setNozzlePosition` / `Viewer_Proxy`+`ViewerDirect`,
  bypassing the file-position lookup entirely (`Nozzle.forcePosition`). DWC's `watch(move, ...)`
  reads `move.axes[].machinePosition` (matched by `.letter`) and pushes it live, but only while
  `showCursor` is on and `!followingJob` - so it doesn't fight the existing file-position-driven
  nozzle tracking used while actually following a running job's byte position.
- **5c - workplace-offset sync + gizmo**: fork gets `setWorkplaceOffsets({x,y,z}[])` /
  `setCurrentWorkplaceIndex(n)` (both sticky across reload, same pattern as `setZBelt`/`setTools`)
  and `showWorkplace(visible)`, plus a small axis-cross gizmo (reuses the existing `Axes` renderable
  at a smaller size) positioned at the active workplace's origin. DWC's `updateWorkplaces()` now
  actually builds the `{x,y,z}[]` from `move.axes[].workplaceOffsets` (per-axis arrays indexed by
  workplace number) instead of being a no-op stub - the previously-existing `workplaceOffsets`
  computed had the wrong shape for this (flat-concatenated per-axis arrays) and is now only used as
  a deep-watch trigger, not read directly.
- **5d - travel persistence/visibility**: `LineShaderMaterial` gets two new uniforms
  (`showTravels`, `persistTravels`) plus a `bDiscard`-based branch ahead of the existing fade logic;
  `persistTravels` shows travels indefinitely once reached instead of fading out after
  `animationLength/8`, `showTravels=false` hides them outright. Fixed a latent bug found while
  wiring this up: the old `watch(persistTravels, ...)` unconditionally forced
  `showTravelLines.value = true` even when turning persistence *off* - now it only forces the
  switch on, never off.
- **5f - cancel-in-progress-load**: `Processor.cancelLoad()` sets a flag checked at every existing
  yield point in `loadFileStreamed`/`loadFileStreamedWithPositions`/`testRenderSceneProgressive`
  (and between the coarser WASM steps); `LoadFileResult` gained a `cancelled: boolean` field so a
  user-initiated cancel resolves as `{failed:false, cancelled:true}` rather than being reported as
  an error. Verified with a synthetic 200k-line file (small test files finish before any yield
  point is ever reached, so cancellation only has an observable effect past the 10k-line chunk
  size - confirmed both that a real cancel actually aborts mid-parse and that a subsequent load
  afterwards still works cleanly).
- **5g - feed-rate legend colors + range**: shader gets `minFeedColor`/`maxFeedColor` uniforms
  (replacing the hardcoded blue→red gradient) plus `Processor.setFeedColors(minHex, maxHex)` and
  `setFeedRateRange(min, max)` (an optional override of the auto-detected min/max used for the
  gradient, independent of the real tracked min/max still reported in `LoadFileResult`). DWC's
  `minColorRate`/`maxColorRate` sliders are labelled mm/s but G-code feed rates (and the fork) are
  mm/min - wired with an explicit `*60` conversion rather than silently mismatching by 60x.
- **5h - render-quality panel simplified**: removed the dead `renderQuality` ref/`renderQualityItems`
  computed/`v-select` (it was never wired to anything - confirmed no watch existed) and the now-unused
  `sbc`/`low`/`medium`/`high`/`ultra`/`max` i18n keys; replaced with a direct `maxFps` slider wired to
  the fork's existing `setMaxFPS`, alongside the mesh-mode checkboxes that were already direct.

Still stubbed/undecided, unchanged from before: `g1AsExtrusion`, `transparencyPercent`,
`useSpecularColor` (explicitly out of scope per the Phase 6 answers). `setCursorVisiblity`→
`toggleNozzle` mapping remains unverified against the old package's actual source.

Remaining: Phase 7 (non-functional pass - cross-browser/mobile, leak check, perf comparison vs.
`@sindarius/gcodeviewer`). Nothing in DuetWebControl has been committed yet this session; the fork
repo (`gcodeviewer`) has its Phase 5b-5h changes uncommitted too, pending the same go-ahead as
before.

## Session update (2026-07-08): WASM activation was never actually wired up

Separately from this integration work, a follow-on session closed 9 of 10 gaps between the fork's
Rust/WASM parser and its TypeScript reference implementation (see `RUST-PARITY-PLAN.md` in the
`gcodeviewer` repo) and committed them there (`dc428a8`). That surfaced a real gap in *this* repo:
**`GCodeViewer.vue` never called `enableWasmProcessing()` anywhere** - the fork's entire WASM fast
path (all of the parity work, all of Phase 5b-5h) was reachable but dormant every time a real user
loaded a real file through DWC, silently falling back to the pure-TypeScript parser every time.

Fixed: added a try/awaited `viewer.enableWasmProcessing()` call in `onMounted`, right after
`viewer.init()` and before the first file load - a failure here (e.g. the `.wasm` asset not
resolving under DWC's bundling/CSP) is caught and logged as a warning, not fatal, matching the
fork's own documented fallback behavior. `vue-tsc --noEmit` clean.

**This also resolves the single biggest open risk flagged earlier in this plan** ("Worker/WASM
asset delivery is the single biggest unknown" / Phase 1's note that WASM was "only exercised via
its fallback stub - no Rust toolchain in this environment"). Re-ran the `GCodeViewerForkTest`
smoke-test harness (now with a real `wasm-pack`-built `.wasm`, not the stub) against a live DWC dev
server via Playwright/real Edge:
- `enableWasmProcessing()` resolved `{success:true}`, `getProcessingStats()` reported
  `wasmEnabled:true, method:"hybrid"`.
- Every subsequent `loadFile()`/`reload()`/`clear()` cycle, including the Phase 5b-5h APIs
  (nozzle position, workplace gizmo, travel display, feed colors, cancel-load), ran through the
  real WASM path with zero console errors and zero failed network requests.
- A synthetic 200,000-line file parsed at ~189,500 lines/sec and a mid-parse `cancelLoad()` past
  the chunk yield point correctly resolved `{cancelled:true, failed:false}`.
- A Prusa-header file with `;TYPE:` feature comments correctly logged "Prusa Slicer detected" and
  produced the right move/color data (confirms the parity session's slicer-table rewrite is live).

Also found while re-reading this file with fresh eyes, **not yet fixed**:
- This plan's own Phase 6 log said `g1AsExtrusion` was "still stubbed" - that's now stale. It's
  fully wired (`onMounted`, the `watch(g1AsExtrusion, ...)` handler, the checkbox) as of the
  parity-plan session. `transparencyPercent` and `useSpecularColor` are the two that are actually
  still stubbed, and their settings-panel controls (`v-slider`/`v-checkbox`) are still visible to
  users despite doing nothing (`watch(transparencyPercent, (_to) => {})`, same for `specular`) -
  this is a live UX inconsistency, not just a TODO comment, since a user can toggle either control
  today and see no effect with no indication why.
- `setCursorVisiblity` → `toggleNozzle` mapping is still an unverified guess (no source for the old
  `@sindarius/gcodeviewer` package was ever available to confirm against).
- Phase 7 (cross-browser/mobile, leak check, perf-vs-old-package) hasn't been started.
- Packaging is still `file:../gcodeviewer` (dev-only) - no decision yet on eventual real `npm
  publish` under the `@duet3d` scope (is that scope actually owned by the Duet3D org?) vs. a
  pinned git-URL dependency.
- Nothing in this repo (`DuetWebControl`) has been committed yet, including this `enableWasmProcessing()` fix.
