# Architecture

The renderer is shared by Electron and the web. Core logic has no dependency on React, Electron, the filesystem, or WebAssembly.

```text
src/core       Media assets, edit recipes, formats, probe interpretation, timeline rules, versioned projects, output presets
src/engines    MediaEngine interface adapters: browser worker or desktop bridge
src/hooks      Application state, per-asset undo/redo, theme preference, project relinking
src/components Focused editing and export components
src/styles     Tokens, layout, editing surface, controls

electron       Sandboxed preload, main-process IPC, portable native tool adapter
scripts        Asset preparation, development startup, bundling, package verification
```

## Edit model

A source asset has metadata and an opaque ID. Its recipe records source trim boundaries, split markers, removed ranges, crop geometry, gain, output format, and encoder options. `keptRanges` merges overlapping removals and finds the retained source ranges. Splits change selection boundaries; they only change the output after a section is removed.

`buildExportArgs` validates the recipe and returns an argument array. Single-range output uses accurate FFmpeg seeking/re-encoding. Multiple retained sections use trim/atrim, timestamp resets, and concat. Both engines execute exactly this plan. Embedded artwork uses a separate unseeked input so trimming audio does not discard the single image packet.

The application owns the media library and bounded per-asset undo/redo histories. The interface sends edit patches rather than constructing FFmpeg commands. Exports use a snapshot of the selected recipe. Imports and exports are serialized by application state, and exports can be cancelled.

## Workspace presentation

The header selects Editor or Convert with a remembered workflow preference. Both use the same source library, while `useConversion` owns output-only settings, selection, and an independent batch queue. `conversionSettings` always creates a neutral recipe from the complete original asset, so conversion never applies or changes editor drafts. Automatic waveform analysis is enabled only in Editor. Conversion components separate the searchable/paginated source queue, shared encoding settings, import report, and results. Results persist across workflow navigation and retries; completed jobs are excluded from the next conversion until cleared.

`ImportReport` returns readable assets, per-file errors, and a skipped-file count. The library and project source count share a 2,000-file bound. Native folder traversal is recursive, bounded to 50,000 entries, and skips symbolic links; four probes run concurrently inside the native job coordinator. Browser directory selection and dropped file-system entries provide root-relative paths without uploading media. Dropped directory readers consume all paginated entry batches and use the same limits. Non-media files are filtered before probing. Engines retain partial successes when a source is corrupt or exceeds browser memory guards.

Bulk export passes explicit conversion/folder options to the engine. Native destination paths are derived from registered assets and a dialog-approved folder token, with validated path segments and rejection of symbolic-link subfolders. Successful temporary output is published with exclusive copying and numbered filename collisions, including when converting into the source folder. Browser results carry a relative path; `createDownloadArchive` streams their local Blob URLs into a self-contained ZIP using `fflate`, validates entry paths, and numbers collisions. ZIP creation is cancellable, lazily loaded, and uses no network service. Both raw result and archive URLs are released when replaced or cleared.

`InspectorTabs` separates basic edits, effects, and output settings while keeping panels mounted so preview results and specialist control state survive navigation. Hidden preview players are paused on tab changes. `ExportFooter` keeps format selection, progress, cancellation, and export results outside the scrolling controls. Keyboard tab navigation uses the standard arrow/Home/End keys and a single tab stop.

Timeline pointer gestures map against the full source track bounds, retain pointer capture while dragging, and clamp to the source duration. A transparent native range occupies the same track for keyboard and assistive technology; its focus indicator appears around the track. Section buttons still support keyboard selection. Removed gaps have no active section. `TimelineRange` captures resize gestures, renders transient local bounds, and commits once on pointer release. Cancellation discards the draft. `resizeSection` reconstructs retained cuts and split markers, bounding edges by adjacent sections without moving them. Caption ranges use source time; fade lanes map between source and output time through trims, cuts, and speed. Fade durations clamp when an edit shortens the output. Playback publishes media time and enforces retained sections on animation frames, while paused previews use media events.

## Project persistence

Version 1 `.frame.json` documents contain source metadata and edit recipes, without source paths, preview URLs, or embedded media. The parser validates structure, numeric limits, recipes, and bounded collections before restoring. Reopening matches source metadata against the library; missing or renamed sources can be imported and explicitly relinked. Restoring validates recipes against the actual sources again, then records the change in undo history. Project schemas are independent of engines; bump the version and provide explicit migrations when changing incompatible recipe fields.

Export presets store a validated output-only snapshot, separate from source trim, crop, and gain. Built-in presets are capability-filtered; custom presets use versioned, bounded local storage and can be replaced by name or deleted. Storage failure falls back to the session with a visible message.

Speed is recipe data, not an output preset. Source time remains the basis for cuts and playback; output duration divides retained source time by speed. Shared audio/video filters apply after retained sections are joined. Pitch preservation uses chained `atempo` stages; pitch shifting resamples at a changed rate. Version 1 projects without the new fields receive compatible defaults.

Audio/video fades operate on output time after cuts and speed. Preview maps the source playhead back to output time and updates gain/opacity using animation frames. Crossfades use normalized video time bases and audio formats, with validated overlap limits; composition duration subtracts the overlap at each boundary.

Audio cleanup filters run after speed processing and before final manual gain/fades. Loudness normalization explicitly negotiates channel layouts around resampling for compatibility with both native and WebAssembly FFmpeg. Preview generation chooses a bounded retained section and returns a temporary stereo WAV; source recipe changes revoke the preview.

## Composition

A composition is an ordered list of source assets and recipe snapshots. Its planner applies each source’s retained ranges, crop, and gain, normalizes frames and audio formats, and concatenates labeled streams. Missing video audio becomes a duration-matched silent stream. Source metadata and compatible first-source artwork can be retained. Native and browser engines use the same plan; source files remain immutable. Drag ordering has keyboard-accessible move buttons.

## Desktop boundary

`launchArguments` accepts supported local file arguments and an explicit Editor/Convert workflow, with `--` separating filenames from options. Electron’s single-instance lock routes later launches into the primary app; macOS `open-file` events enter the same bounded `LaunchInbox`. It groups same-workflow launches arriving less than 1.5 seconds apart, deduplicates pending paths, and preserves distinct selections in order. Group IDs survive consumption, allowing Explorer's separate per-file activations to remain one selection even while probing is underway. Conversion replaces the previous checked selection for a new group and accumulates files within the group; unrelated library files remain unchecked. Overflow produces a visible error without discarding previously queued selections. Window creation is guarded against native event reentrancy until the main window has been assigned.

The renderer subscribes to availability and pulls an opaque launch ID when its operation lock and dialogs permit importing. Only the main process retains selected OS paths. `desktop:import-launch` checks the caller, consumes the queued ID inside the native job coordinator, probes media, and reuses already imported sources. Workflow activation happens after acquiring the renderer lock, so automatic waveform analysis cannot race conversion imports. Requests arriving during exports remain queued, and renderer reloads can pull undelivered requests. The preload exposes no arbitrary-path import API. Reopening a registered file selects it without replacing its undo history or recipes.

Shell integration is separate from media processing: `shell-action-definitions` generates installer and file-manager resources, `shell-actions` installs/removes and checks per-user actions, `windows-shell-actions` manages owned Explorer registry keys, and `system-integration` owns the app menu/CLI and trusted Settings IPC. Windows installer and runtime management share the same registrations and opt-out preference. Development actions include the Electron executable and absolute app directory, while the desktop launcher prepares a built renderer for cold starts. Settings keeps unavailable web controls visible and disabled. Theme previews and settings UI are separate components; navigating Settings preserves editor drafts and conversion selections. The supported-extension JSON is shared with file import, keeping installed verbs and accepted types consistent.

The preload exposes only import, sample import, export, validated project saving, cancellation, release, and progress subscription. It does not expose Node.js or arbitrary IPC. File-drop paths are derived from real File objects in the isolated preload. Main-process requests are accepted only from the application's main frame; source paths are stored behind opaque IDs. The renderer cannot choose an arbitrary input or output path for FFmpeg.

Native tools run through `spawn` with arrays, never a shell. The app imports platform-specific FFmpeg and FFprobe packages and resolves paths outside ASAR before execution. FFprobe discovers stream capabilities. Export destinations come from the native save dialog. Output is written beside the destination under a temporary filename and moved only after encoding succeeds; failed/cancelled jobs clean up that temporary file. The sample is an external resource because native subprocesses cannot read inside ASAR.

The window uses context isolation, renderer sandboxing, disabled Node integration, a content security policy, denied new windows/navigation, and denied browser permission requests. The preview protocol serves only registered assets.

## Audio analysis

Waveform generation uses FFmpeg `astats` and bounded peak windows across all channels. Both engines use the same arguments and peak-log collector, returning source-time peak data for an SVG timeline. Analysis is serialized with exports and can be cancelled. Native FFmpeg processes report progress through the narrow bridge; the renderer never chooses input paths. Web analysis explicitly sets the information log level because a preceding FFprobe call changes shared logging state.

Video thumbnail analysis renders a fixed twelve-frame PNG strip. Each engine uses the same sampling plan; native temporary directories and browser virtual files are cleaned up. Renderer Blob URLs are scoped to imported assets and released on removal. A shared native job coordinator serializes and cancels processing.

## Web boundary

The FFmpeg WebAssembly adapter and its worker load on first use. Core files are copied from the lockfile-installed package and hosted by the application. Files remain in a renderer-owned map; temporary worker filesystem files are removed after probing/export. Blob URLs are released when library items or export results are removed. Cancellation terminates the worker; a later job reloads the engine without losing imported source Files.

Core 0.12 returns `-1` when FFprobe returns normally without updating its exit sentinel. Imports accept that sentinel only with fresh JSON output and validated stream/duration data; FFprobe's explicit error section is rejected. This compatibility behavior is exercised by valid and corrupt browser imports.

## Extending

- **Output formats:** add a format descriptor in `src/core/formats.ts`, its type ID, and any necessary encoder options in the planner. Verify native and browser codec support with real output tests before advertising it.
- **Editing operations:** add serializable recipe data, validation/planning, and a focused control component. Engines stay unchanged when the operation maps to FFmpeg arguments.
- **Media kinds:** add the kind and metadata, supported import/probe handling, appropriate preview/control components, and capability-aware format filtering.
- **Alternative engines:** implement `MediaEngine` and select it in `src/engines/index.ts`. Platform-specific options should be represented by capabilities and only shown when supported.
- **Future composition:** evolve the recipe into source-referenced clips/tracks before adding multitrack mixing. Keep timeline algebra independent of playback and UI rendering.

Files should remain focused on one responsibility. There is no untrusted plugin loader in this version; extension points are source-level modules.

Recipe resources (caption/text files, PNG overlays and LUTs) use engine-generated temporary paths, with a bundled font, and are cleaned up after each operation. Browser analysis is a separate adapter. Native jobs latch cancellation across hardware detection and retries; only encoders that complete a real short encode are offered. Proxy files are served through opaque media URLs and never replace source paths in export planning. Recovery stores validated portable recipes in IndexedDB and waits for explicit relinking before replacing a pending draft.

Direct URL import shares HTTP/HTTPS validation, filename handling, streamed byte limits, progress, and abort logic across engines. Browser imports reuse ordinary file probing. Desktop streams through Electron’s network stack to private temporary directories, probes raw formats with network protocols disabled, and cleans up downloads on cancellation, removal and exit. URL import uses trusted IPC and the existing exclusive operation lock.
