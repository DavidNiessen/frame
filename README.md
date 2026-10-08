# Frame

A desktop-first video and audio editor with a shared web application. Trim, split and remove sections, crop video, adjust volume, extract audio, and convert formats. Processing happens on your device; no media is uploaded.

The interface adapts the typography, green accents, and restrained surfaces in [DESIGN.md](DESIGN.md). System appearance is the default; Light, Dark, and Midnight can be selected and are remembered locally.

## Develop

Use Node.js 22.12+ (Node 24 LTS recommended) and npm.

```sh
npm ci
npm run dev          # Web editor
npm run dev:desktop  # Electron + the Vite development server
```

Desktop development needs a graphical session. Electron, portable FFmpeg, and portable FFprobe are installed by npm. **End users do not need FFmpeg or FFprobe installed**: the desktop package includes both tools for its OS and architecture.

The browser's first import loads the self-hosted WebAssembly engine (about 32 MB). There are no external CDNs, remote fonts, media APIs, or API keys. Use “Try a sample” to explore with a small bundled video.

## Editing

1. Import or drop video/audio files and choose a file in the library.
2. Adjust the trim range. Split at the playhead and select/remove unwanted sections.
3. Choose a video crop preset, drag the crop frame/corners, or enter precise dimensions.
4. Adjust volume and choose an output format.
5. Choose a built-in export preset or save your own format/quality settings for reuse. Presets keep trim, crop, and volume unchanged. Custom presets persist on this device (up to 20).
6. Open Advanced settings for bitrate, GIF frame rate, embedded artwork, and metadata.
7. Export: desktop opens a save dialog; the browser provides a downloadable file.

Edits are nondestructive and support undo/redo. Artwork is enabled by default for MP3, FLAC, and M4A if embedded in the source. GIF has no audio. WAV/FLAC use lossless encoding rather than a target audio bitrate. The default export name has an `-edited` suffix; the desktop app rejects exporting over the source file. Save a `.frame.json` project to retain edits across sessions. Project files contain recipes and source metadata, without media bytes or machine paths. Open a project and relink its original media to restore edits; you can undo the restore. Keep the original files alongside your projects. Theme preference persists locally.

Keyboard shortcuts: Ctrl/Cmd+O imports, Space plays/pauses, I/O set trim boundaries, Ctrl/Cmd+Z undoes, and Ctrl/Cmd+Shift+Z redoes. A shortcut reference is available in the footer.

Generate an **audio waveform** from the Timeline to see measured source peaks before cutting. This runs locally, works for video with audio and audio-only files, and can be cancelled. Source peaks remain visible as you adjust cuts.

For video, **Generate thumbnails** adds a strip of twelve source frames. Click a thumbnail to seek to that part of the source. Thumbnails are generated locally and released when their media leaves the library.

**Merge clips** combines imported sources in your chosen order. Drag clips or use the up/down buttons; each clip keeps its recipe. Video outputs require video sources, fit frames to the first clip, and use silence for missing audio. Mixed video/audio selections can export audio. Compatible audio outputs keep the first clip’s artwork by default when present.

Use **Speed** for 0.25×–4× playback and export. Audio pitch stays unchanged by default; disable preservation for the classic pitch-shifting effect. Speed also applies to each source in a merge. Trim boundaries stay in source time, while output duration reflects the speed. Older project files default to 1× with pitch preservation.

Set **Fades** to fade video to/from black and audio to/from silence. Fade duration uses output seconds after cuts and speed. Preview fades update smoothly during playback. In **Merge clips**, choose **Crossfade audio and video** to overlap adjacent clips; the duration can use at most half of the shortest clip, and the overlap shortens the output.

## Batch export

Open **Batch export**, select library files, and choose each file’s recipe, current output settings, or all current edits. Jobs run sequentially with per-file progress and errors. Desktop asks for one output folder and numbers conflicting filenames; the browser offers a separate download per result. Cancelling preserves completed results. Browser batch downloads have a 500 MB retention guard; save and clear results before running more jobs.

## Capabilities

| Capability | Desktop | Web |
| --- | --- | --- |
| MP4, MOV, MKV, WebM, GIF export | Native FFmpeg | FFmpeg WebAssembly |
| MP3, WAV, FLAC, OGG, M4A export | Native FFmpeg | FFmpeg WebAssembly |
| Trim, split/remove, crop, volume | Yes | Yes |
| Metadata and artwork retention | Compatible formats | Compatible formats |
| Native open/save dialogs and filesystem paths | Yes | Browser picker/download |
| Large-file processing | Reads directly from disk | 500 MB/file, 800 MB library guard |
| Progress and export cancellation | Yes | Yes |
| Media preview | Chromium codec support | Browser codec support |

Common input extensions include MP4, MOV, MKV, WebM, AVI, M4V, GIF, MP3, WAV, FLAC, OGG, M4A, AAC, OPUS, and AIFF. A container alone does not guarantee a decodable stream. Unsupported preview codecs can still be converted when FFmpeg can decode them. GIF previews loop the source; trim/split edits are applied on export. Volume above 100% is applied on export and may clip; the media element's preview is capped at 100%.

Browser guards are conservative, not a guarantee that a 500 MB job will fit: decoding, processing, and output buffers consume additional memory. Mobile devices may support considerably smaller jobs. Desktop uses native processes and avoids those WebAssembly limits. Multitrack composition, hardware encoding, and arbitrary third-party plugins are future extensions.

## Validate

```sh
npm run typecheck
npm test             # Core rules + real portable native FFmpeg conversions
npm run test:e2e     # Browser UI + real WebAssembly exports
npm run test:desktop # Electron UI + native export with an empty PATH
npm run build
```

Install the test browser with `npx playwright install --with-deps chromium`. Playwright uses its full Chromium build; set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use a specific local browser. Linux desktop tests require a display, for example `xvfb-run -a npm run test:desktop`. Sandboxed containers may need the test-only `FRAME_TEST_NO_SANDBOX=1`; the application itself keeps renderer sandboxing enabled. Set `FRAME_TEST_EXECUTABLE` to test an unpacked desktop executable with the same desktop suite.

## Package

```sh
npm run package:dir # Unpacked desktop application
npm run package     # Windows NSIS / macOS DMG / Linux AppImage
```

Build on the target OS and architecture so the bundled media binaries match. Cross-packaging is deliberately rejected. CI prepares native artifacts for Windows, macOS (Apple Silicon and Intel), and Linux; it also validates the web build. Artifacts are saved under `release/`. Commands do not publish a release.

Unsigned local builds are available without credentials. Public Windows signing and macOS signing/notarization require the appropriate certificates and accounts; configure Electron Builder's supported signing environment variables separately. See [distribution notes](docs/DISTRIBUTION.md) for portable-tool packaging and third-party notices.

## Host the web application

Deploy the complete `dist/` directory after `npm run build`, including `ffmpeg/`, worker assets, fonts, and notices. Serve over HTTPS (localhost is allowed during development), with these response headers:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Content-Type: application/wasm  # for .wasm files
```

Vite's development and preview servers already set the isolation headers. `base: './'` permits hosting under a subdirectory; the core assets resolve relative to the page. An example Nginx configuration is in [docs/nginx.conf](docs/nginx.conf).

[Architecture](docs/ARCHITECTURE.md) describes the extension points. [Cloud setup](docs/CLOUD_SETUP.md) records the validated container workflow.
