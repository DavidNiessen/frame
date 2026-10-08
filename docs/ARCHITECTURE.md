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

## Project persistence

Version 1 `.frame.json` documents contain source metadata and edit recipes, without source paths, preview URLs, or embedded media. The parser validates structure, numeric limits, recipes, and bounded collections before restoring. Reopening matches source metadata against the library; missing or renamed sources can be imported and explicitly relinked. Restoring validates recipes against the actual sources again, then records the change in undo history. Project schemas are independent of engines; bump the version and provide explicit migrations when changing incompatible recipe fields.

Export presets store a validated output-only snapshot, separate from source trim, crop, and gain. Built-in presets are capability-filtered; custom presets use versioned, bounded local storage and can be replaced by name or deleted. Storage failure falls back to the session with a visible message.

## Composition

A composition is an ordered list of source assets and recipe snapshots. Its planner applies each source’s retained ranges, crop, and gain, normalizes frames and audio formats, and concatenates labeled streams. Missing video audio becomes a duration-matched silent stream. Source metadata and compatible first-source artwork can be retained. Native and browser engines use the same plan; source files remain immutable. Drag ordering has keyboard-accessible move buttons.

## Desktop boundary

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
