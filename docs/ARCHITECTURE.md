# Architecture

Frame shares one React/TypeScript renderer between Electron and the browser. Editing semantics and FFmpeg argument generation live in framework-independent core modules; adapters own execution and platform resources.

| Layer                  | Responsibility                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `src/core`             | Assets, recipes, timeline rules, effects, validation, serialization and FFmpeg plans |
| `src/engines`          | `MediaEngine` implementations for WebAssembly and the desktop bridge                 |
| `src/hooks`            | Library state, undo/redo, imports, projects, recovery and processing lifecycles      |
| `src/components`       | Editing, playback, conversion, settings and responsive panel composition             |
| `src/styles`           | Theme tokens, layout and interactions                                                |
| `electron`             | Main-process IPC, native tools, temporary resources and OS integrations              |
| `native/windows-shell` | Explorer COM commands, launcher and certificate-consent helper                       |
| `scripts`              | Asset preparation, verified tool selection, builds, signing and releases             |

## Edit model and timing

A `MediaAsset` has an opaque ID and probed metadata. An `EditSettings` recipe records retained source ranges, ordered clips, track effects, audio layers and delivery settings. `src/core/types.ts` defines the shared interfaces, and `project.ts` validates versioned `.frame.json` documents. Keep parsers compatible with existing recipes or introduce an explicit migration.

Clip ranges use **source time**. The visible timeline and new timed effects use **output time**, after cuts, ordering and speed. `clips`, `timeline`, `fades` and `preview-clock` translate between these clocks. Legacy source-timed effects and per-clip overrides remain readable. Avoid treating a prepared player's native `currentTime` as original-source time.

Splitting changes clip identity without duplicating track effects. Joining contiguous ranges creates one range; joining around deleted footage keeps retained pieces with a shared `groupId`. `joinedRanges` records restorable footage so outer trimming can cross internal cuts without restoring omitted gaps. Timeline gestures commit one edit on release; cancellation discards the draft. Undo/redo histories are bounded and maintained per asset.

`effect-instances` and `timeline-effects` define independent track effects and their ranges. Repeatable corrections, fades, captions and watermarks own parameters and IDs. Crop, transforms, speed and normalization are singleton track adjustments. The catalogue, command palette and timeline add actions use the same repeatability policy. Parameter keyframes and arbitrary filter ordering are not implemented.

`export-plan` validates a recipe and produces an argument array. Both adapters run that plan. Single ranges use accurate seeking; retained sequences use trim/atrim, timestamp normalization and concatenation. Resource writers supply subtitles, LUTs, artwork, watermark images and audio layers without accepting arbitrary project paths. Artwork can use a separate unseeked input to preserve its single image packet after audio trimming.

## Playback and background preparation

The preview uses an animation-frame clock for smooth playhead/effect updates. Contiguous splits reuse the decoder without seeking. Gaps and reordered clips play straight from the source, which seeks to the next clip, as in an NLE; nothing is rendered for cuts. `cut-bridge` keeps a detached standby decoder cued on the first frame after the next jump; `CutBridge` paints it (and `GradedVideo` grades it) while the source seeks, then the hidden, muted source runs faster or slower until it shows the same frame and takes over. Repeated footage shares source times, so the source element carries the output position it is playing (`previewOutput`), which the playback loop keeps up to date.

`useJoinedPreview` debounces effect recipes, cancels obsolete preparation and retains an older stream when it still covers the required footage. `joined-preview` canonicalizes source intervals; `effect-preview` prepares audio/EQ/cleanup/mixing, and exact color effects when real-time grading is unavailable. `effectPreviewNeeds` reports audio and video needs separately: when only the sound needs processing on video, the hook renders an audio-only recipe (`audioPreviewAsset`) and `Preview` plays it beside the muted source video through `ProcessedAudioPreview`. Geometry, frame objects and video fades remain live in the renderer. Processed gain/tempo must not be applied a second time.

`realtime-grade` translates color, curves, LUT and visual recipes into ordered GPU steps for the current playback position, mirroring `rawVideoFilters`; `engines/grade-renderer` runs them in WebGL2 and `GradedVideo` draws the decoded video through them while the media element keeps the clock and audio. When `liveMediaLayers` allows it (a base that is either uncropped, or simply cropped and otherwise untransformed; resolvable non-GIF sources, WebGL2), `MediaLayerPreview` plays each layer through `LiveMediaLayer`, graded with `mediaLayerGrade`, and the effect recipe drops the layers. Otherwise recipes with media layers bake grading and geometry in FFmpeg because layers composite above the graded track. For images, `imageGradePlan` mirrors `imageLayerStages` for adjustment-only stacks and `GradedImage` grades the decoded original; other stacks use the rendered composite. When changing an export filter, update its GPU step and the parity test in `tests/e2e/realtime-grade.spec.ts`.

Source swaps preserve the source/output playhead and pending playback intent. Explicit pause cancels a pending resume. Space invokes the same transport action as the Play/Pause button. Decoder metadata/play/seek events restart frame-clock updates after a handoff.

Each job owns a cancellation path and temporary outputs. Release replaced previews only after the player detaches. Deleting a source pauses its players, removes edit/library state, waits for active waveform/preview work, then releases proxies and owned files. Native windows maintain independent job owners; closing a mini converter must not cancel the main editor's work.

## Platform execution

### Browser

`src/engines/browser.ts` lazily creates FFmpeg WebAssembly workers. Binary assets are self-hosted under `public/ffmpeg/`; generated notices ship with the build. The engine owns its virtual filesystem and Blob URLs. Separate background preparation prevents preview work from holding the foreground processing lock.

Imports and retained outputs have memory guards. Folder readers consume all browser directory-entry batches and preserve root-relative paths. ZIP conversion downloads validate paths and number collisions. Direct URL imports require CORS. There is no backend, filesystem bridge or service downloader in the web app. Desktop URL imports use a shared provider registry for link validation and a bundled yt-dlp runner for video/music services. New services reuse quality selection, audio extraction, cancellation, progress and temporary-file ownership.

HTTPS hosting needs cross-origin isolation for SharedArrayBuffer. Vite supplies development headers. GitHub Pages uses `browser-isolation` and `public/isolation-worker.js` to add headers to same-origin responses after a bootstrap reload; the worker does not cache media. Its static-host integration test performs an actual conversion.

### Desktop

Electron's sandboxed preload exposes a narrow typed bridge. `window-ipc`, `window-security` and media-session ownership restrict requests to trusted windows. The main process validates recipes, registered asset IDs, path tokens and input options before work. Tool commands use argument arrays rather than shell interpolation.

FFmpeg and yt-dlp come from checksum-pinned repository artifacts; FFprobe comes from its platform npm package. `tool-paths` resolves development and packaged resources without relying on PATH. Packaging verifies the native OS/architecture and runs the bundled tools with an empty PATH. See [distribution](DISTRIBUTION.md) for licenses and signing.

Native jobs coordinate subprocess cancellation and cleanup. Folder traversal is bounded, skips symlinks and probes with limited concurrency. Output destinations use dialog-approved tokens and exclusive copying with collision numbering. Autosave retains local media safely; downloaded/prepared media has explicit ownership.

The single-instance launch inbox groups file-manager requests. Edit opens/reuses the editor; Convert opens an independent frameless mini window. Windows supports classic registry verbs and an x64 Explorer extension with explicit certificate consent. macOS uses Finder Quick Actions; Linux optionally uses Dolphin service menus. Public signed assets are committed so ordinary contributors do not need a signing key or native compiler.

## Workspace and conversion state

`useEditor` owns the library and recipes. `useConversion` has a separate selection and queue; its neutral recipes intentionally ignore editor trims/effects. Completed downloads/results survive workflow navigation. Browser persistence uses IndexedDB; desktop storage retains registered files and generated sources. Manual project files contain recipes and metadata, without original audio/video files, local paths or URL credentials.

Autosave debounces **persistent edit changes**, not per-frame playhead/progress updates. Recovery runs once; latest-value refs let long-lived listeners read current callbacks without restarting their lifecycle. `loading-activity` tracks concurrent work with owner tokens released in `finally`; one footer beam reports shared processing state.

Panel sizing belongs to presentation state, not recipes. `EditorWorkspace`, `ConversionLayout`, `panel-layout` and `usePanelSizes` constrain sizes and preserve device-local preferences. Divider gestures support cancellation and keyboard adjustment; panels scroll internally. Effects use a modeless full-height overlay aligned to the inspector so playback and frame editing remain available.

## Extending and testing

Register formats in `formats`, capabilities in the engine interface, and effects through the shared catalogue/instance policy. Add validation, project compatibility, resource handling and both adapters where applicable. Expose desktop-only behavior through explicit capability checks; web settings should explain unavailable platform features.

Use core tests for edit/serialization invariants and actual FFmpeg output. Browser tests cover UI interactions and WebAssembly; Electron tests cover the real bridge and native tools; setup tests cover binary integrity, installation, signing and release completeness. Keep regression tests for lifecycle races and native integrations even when their fixtures look unusual.
