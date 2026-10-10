# Frame

A desktop-first video and audio editor with a shared web application. Trim, split and remove sections, crop video, adjust volume, extract audio, and bulk-convert entire media folders. Processing happens on your device; no media is uploaded.

The interface adapts the typography, violet accents, and restrained surfaces in [DESIGN.md](DESIGN.md). System appearance is the default; Light, Dark, and Midnight can be selected and are remembered locally.

## Develop

Use Node.js 22.12+ (Node 24 LTS recommended) and npm, or pnpm 10.26+ / 11 / 12.

```sh
npm ci
npm run dev          # Web editor
npm run desktop      # Electron + the Vite development server
```

Desktop development needs a graphical session. Electron and portable FFprobe are installed by npm. Portable FFmpeg and yt-dlp are committed in `vendor/media-tools/` and prepared locally. **End users do not need FFmpeg or FFprobe installed**: the desktop package includes both tools for its OS and architecture.

With pnpm, run `pnpm install` followed by `pnpm desktop` (or `pnpm run dev` for the web editor). The committed `pnpm-workspace.yaml` permits the dependency scripts that install Electron/FFprobe and prepare the build tools. npm's `package-lock.json` remains the canonical lockfile; `pnpm import` can create a matching pnpm lockfile before installation.

If an earlier pnpm install skipped those scripts and reports a missing `ffmpeg.exe` / `ENOENT`, update the repository and repair the existing installation:

```sh
git pull
pnpm rebuild
pnpm run postinstall
pnpm desktop
```

If you maintain your own pnpm build policy, allow `electron`, `electron-winstaller`, `esbuild`, and the `@ffprobe-installer` package for your platform. `pnpm approve-builds` lets you review blocked dependency scripts. FFmpeg and yt-dlp are verified and restored from the repository files; a system FFmpeg installation is not required.

Desktop startup checks Electron's executable before starting the development server and runs Electron's own installer if the runtime is missing. You can perform this check/repair separately with `pnpm run setup:desktop` or `npm run setup:desktop`. It uses the installed Electron version and its usual download cache, mirrors, and proxy settings.

If rebuilding reports success but Electron still says it “failed to install correctly”, check `ELECTRON_SKIP_BINARY_DOWNLOAD`. Electron's installer deliberately exits successfully without downloading when this variable is nonempty, **including `0` or `false`**. Clear it in the terminal used to start the app. In Windows Command Prompt:

```bat
set ELECTRON_SKIP_BINARY_DOWNLOAD=
pnpm run setup:desktop
pnpm desktop
```

In PowerShell use `Remove-Item Env:ELECTRON_SKIP_BINARY_DOWNLOAD -ErrorAction SilentlyContinue`; in a POSIX shell use `unset ELECTRON_SKIP_BINARY_DOWNLOAD`. A custom `ELECTRON_OVERRIDE_DIST_PATH` must point to a complete runtime; fix or unset it if startup reports that it is incomplete. Setup verifies the executable after the installer finishes and reports download failures or an installation that still lacks its runtime.

Node 24.16.0 can silently stop while extracting Electron with the older ZIP reader: its installer exits with code 0 without writing `path.txt`. Matching npm and pnpm overrides select `yauzl` 3.4.0 for `extract-zip`, which completes extraction on that Node version. If you installed before this fix, run `git pull`, `pnpm install`, then `pnpm run setup:desktop` (with npm use `npm ci` followed by `npm run setup:desktop`). Electron's original download and checksum verification remain in place.

The browser's first import loads the self-hosted WebAssembly engine (about 32 MB). There are no external CDNs, remote fonts, media APIs, or API keys. Use “Try a sample” to explore with a small bundled video.

## Load from a URL

Choose **Load from URL** in the media library or conversion workspace, paste a direct HTTP/HTTPS media file link, and click **Load media**. Frame downloads the file, shows progress, and imports it into the current workflow. Cancel or retry from the dialog. Filename detection uses download headers, the URL path, and common audio/video MIME types, so direct download endpoints and redirects work too.

Other page links, streaming playlists, and links containing embedded login credentials are not supported. Browser imports require the host to allow cross-origin access (CORS); an HTTPS deployment also needs HTTPS media links. The browser's existing file/library limits apply during download. Desktop downloads directly to disk and does not need CORS permission. Downloaded sources are held for the session and removed on library removal or application exit; export a copy to keep them. URLs and authentication tokens are not saved in projects or autosave.

### YouTube on desktop

Paste an individual YouTube video link in **Load from URL**, then choose **Video with audio** or **Audio only**. Video imports default to **Up to 1080p**; 720p, 480p, and **Best available** are also available. Frame downloads original streams and merges them without re-encoding, then imports the source into Editor or Convert. Choose the final output format in the usual export controls. Watch, short, Shorts, embed, and completed live-video links are recognized; a video link containing a playlist still imports just that video.

YouTube imports run locally, without a hosted backend. The desktop distribution includes a checksum-verified standalone `yt-dlp` and its extraction scripts, uses Electron's bundled Node runtime, and merges streams with the bundled FFmpeg. Users do not need Python, Node, FFmpeg, or yt-dlp installed. **Publicly accessible, completed videos only**: no playlists, channel downloads, live streams, browser-cookie access, or account sign-in. YouTube may block downloads from some connections or require sign-in; Frame shows an actionable error. Web explains that YouTube import requires the desktop app.

Development and desktop builds prepare pinned, checksum-verified tools from [vendor/media-tools](vendor/media-tools/README.md), without downloading FFmpeg or yt-dlp from GitHub. Versions and hashes are recorded in [scripts/ffmpeg-tools.json](scripts/ffmpeg-tools.json) and [scripts/youtube-tools.json](scripts/youtube-tools.json). `pnpm setup:desktop` repairs missing or corrupt tools; `pnpm desktop` prepares them automatically. Updating the downloader requires a new Frame build: update the version and official SHA-256 digests in the manifest, run `npm run vendor:media-tools`, commit the binaries and vendor notices, and run the downloader and packaged desktop tests. Frame does not self-update downloaded executables or fetch remote challenge-solver components at runtime.

## Convert a collection

Choose **Convert** in the header for a dedicated conversion workspace without editing panels or a timeline. Your last workflow and conversion output settings are remembered on this device.

1. **Add folder** reads supported video/audio files in all subfolders. Desktop uses its native folder picker; supported browsers use directory selection. You can also add files or drop files/folders. Non-media files are skipped, and unreadable files are reported without discarding valid songs or videos.
2. Search the queue and select the files to convert. Choose one format and quality for the selection. Advanced options include bitrate, artwork (enabled by default for supported formats), and metadata retention. Audio formats also extract sound from videos; video-only sources cannot produce audio, and audio-only sources cannot produce video.
3. Choose whether to **Keep folder structure** (enabled by default). Desktop asks for one output folder and saves there; web offers **Download all (ZIP)** and individual downloads. Conversion keeps original basenames and numbers conflicting names rather than overwriting files. Preserved folder paths start below the folder you imported, so album folders remain organized.
4. Follow per-file progress. Cancel if needed; completed files stay available. Correct any errors and **Retry unfinished files**, which retries selected failed/cancelled sources while retaining completed results. **Clear results** prepares the collection for another conversion without deleting saved outputs or source files.

Conversion processes each **complete original source** independently of trims, cuts, volume, speed, and other recipes in Editor. Switch back to **Editor** to continue working with those drafts. Waveforms are generated by default when editing audio. Disable **Settings → Editing → Generate audio waveforms automatically** to skip automatic analysis; the preference persists across sessions on desktop and web. You can still generate a waveform manually from the timeline. Conversion queues do not generate waveforms.

The library supports up to 2,000 media files. Large collections use searchable, paginated queues. Browser limits remain 500 MB per source, 800 MB in the library, and 500 MB of retained converted results; ZIP preparation uses additional memory. Save and clear completed downloads before the next group, or use desktop for large libraries. Directory picking varies by browser, with regular multi-file selection available as a fallback.

## Open from your file manager

**Windows:** install the packaged Frame application using its `.exe` installer. Its **Add "Edit in Frame" and "Convert in Frame" to file context menus** checkbox is checked on first installation. Uncheck it to opt out; upgrades remember your choice. You can install, repair, or remove the actions later in **Settings → File-manager actions**. Right-click a supported audio/video file or a selection of files and choose **Edit in Frame** or **Convert in Frame**. On x64 Windows 11, a native Explorer extension also adds these commands to the primary right-click menu; Windows may group them under **Frame**. The classic entries remain under **Show more options** (Shift+F10), including on Windows 10. If you already installed the older integration, use **Repair actions** in Settings. Restart File Explorer if its menu has not refreshed. The actions support mixed media selections: Edit reuses the editor, while Convert opens a separate compact converter. The primary-menu commands accept up to 2,000 files; Explorer’s classic menu supports up to 100. Your default media player is unchanged. Uninstalling Frame removes its own menu entries and primary-menu package. The bundled shell package is signed with Frame’s self-signed certificate. Choose **Trust certificate and enable menu** in Settings, read the confirmation, then approve Windows’ administrator prompt. This trusts the bundled Frame certificate in **Trusted People for all users of this PC**, and installs the menu for your account without Developer Mode. Certificate details and **Remove certificate trust** are available in Settings. Cancelling keeps existing trust and menus unchanged. The installer asks separately before trusting the certificate; silent installs never do so automatically. Removing actions or uninstalling Frame preserves the shared certificate trust; revoke it in Settings before deleting Frame if you want to remove it. Classic entries work without certificate trust.

**macOS:** copy Frame to Applications, open it, and choose **Settings → File-manager actions → Install actions** (also available from **Frame → Install Finder Quick Actions…**). In Finder, right-click media and choose **Quick Actions** or **Services → Edit in Frame / Convert in Frame**. If hidden, enable the actions in **System Settings → Keyboard → Keyboard Shortcuts → Services**. Use **Remove actions** in Settings or the corresponding Frame menu item to remove them. Frame also appears as an alternate **Open With** application for supported media, opening files in Editor. Quick Actions use the installed Frame app and support multiple selected files, including when Frame is already running.

**Linux (optional, Dolphin):** keep the AppImage at a stable path and choose **Settings → File-manager actions → Install actions**, or run `./Frame.AppImage --install-shell-actions`. This adds both actions for local audio/video/GIF files in Dolphin. Restart Dolphin if needed. Run `./Frame.AppImage --remove-shell-actions` before deleting or moving the AppImage; rerun installation after moving it. Other Linux file managers are not integrated in this version.

File-manager requests queue within their own window while it is busy. Existing editor sources are selected without resetting their recipes. **Convert in Frame** opens a frameless mini converter in the bottom-right of the current screen, above the taskbar or dock. It starts expanded with the usual format, quality, bitrate, artwork, metadata and folder options; choose an output folder when starting. During encoding it collapses to a progress bar and expand button. Successful batches fade out and close the mini window automatically; failed or cancelled batches expand for review and retry. If an editor is already open, its project and processing remain independent. The mini converter follows your theme and respects reduced-motion preferences. File-manager actions also work when running `pnpm desktop`: they launch Electron with this checkout’s absolute path and can open its built UI after the development server closes. Remove them before moving/deleting the project, or reinstall from the new location. The web Settings page shows the file-manager controls disabled, with an explanation. Theme selection lives in **Settings → Appearance**, with previews for System, Light, Dark, and Midnight. System is the default and follows the device’s light/dark preference.

**Convert in Frame** selects the files from that file-manager action in the mini window. Consecutive per-file launches in one Explorer selection are grouped together; additional selections queue during conversion and keep the mini view open for review. The full Convert workspace is still available from the main app’s header.

Packaged Frame also accepts file arguments directly: `Frame.exe --frame-workflow=convert -- "C:\Music\song.wav" "C:\Music\second.flac"`. Use `--frame-workflow=edit` to open Editor. Paths after `--` are treated as filenames, and unsupported extensions are ignored.

## Editing

1. Import or drop video/audio files and choose a file in the library.
2. Drag a clip’s left or right timeline edge to set its start or end. Split sections have their own handles and can shrink or expand into free space without overlapping neighbours. Click or drag inside the track to seek, then split and remove unwanted sections. Handles support touch, arrow-key nudging (Shift for larger steps), Page Up/Down, and Home/End. A drag is one undo step; Escape or an interrupted touch cancels it.
3. Choose a video crop preset, drag the crop frame/corners, or enter precise dimensions.
4. Adjust volume and choose an output format.
5. In **Export**, choose a built-in export preset or save your own format/quality settings for reuse. Presets keep trim, crop, and volume unchanged. Custom presets persist on this device (up to 20).
6. In **Export**, open Advanced settings for bitrate, GIF frame rate, embedded artwork, and metadata.
7. Export: desktop opens a save dialog; the browser provides a downloadable file.

**Edit** contains trim, crop, and volume. **Effects** contains speed, fades, audio cleanup, silence removal, transforms, color, subtitles, and watermarks. Applied effects are summarized in Edit. **Export** contains presets, quality, size, advanced encoding options, and desktop performance tools. Output format and the export action remain available in every tab. Open **Project tools** for project opening, merge, and batch export; saving a project stays directly available.

The workspace uses separate panels for the library, preview, timeline, and editing controls. Drag the dividers to resize them; focused dividers also support arrow keys, Shift for larger steps, and Home/End. Sizes are remembered on this device. Double-click a divider to reset its panel, or choose **Project tools → Reset panel layout** to reset all sizes. Convert also has a resizable settings panel.

**Project tools** and **Save project** share the main header with navigation. On phones, open the hamburger menu for project actions, Import, command search, and Settings; the Editor/Convert tabs stay visible. Escape closes the project submenu first, then the main menu.

The desktop window has a custom title bar without a title or app icon. Move the cursor to the app's top edge to reveal the draggable area and animated minimize, maximize/restore, and close buttons. The app's background and outer border smoothly expand upward around the controls, keeping the content in the same screen position. The transparent native window reserves room above the app, so hovering never resizes or moves it; the space outside the rounded outline remains transparent. Window controls stay visible while maximized, during fullscreen, and during fullscreen preview. **Ctrl+Shift+Space** reveals and focuses the controls; **Escape** returns focus to the workspace. Its animations respect reduced-motion preferences.

**Fullscreen preview** smoothly expands the video across the workspace while keeping the app header, preview's top toolbar, and footer visible. Playback continues through the transition. Hover or focus the preview to reveal playback controls; touch devices keep playback controls visible. Click the restore button or press Escape to return to the saved panel layout. Transitions respect the system's reduced-motion preference.

Adding caption or effect lanes keeps the preview size stable: extra tracks scroll vertically inside the timeline. Use the timeline zoom controls for finer edits and horizontal scrolling; **Fit** shows the whole source again. Zoomed timelines follow the playhead during playback. Smaller windows move the library above the preview, and phones stack the panels while keeping the timeline independently resizable.

Edits are nondestructive and support undo/redo. Artwork is enabled by default for MP3, FLAC, and M4A if embedded in the source. GIF has no audio. WAV/FLAC use lossless encoding rather than a target audio bitrate. The default export name has an `-edited` suffix; the desktop app rejects exporting over the source file. Save a `.frame.json` project to retain edits across sessions. Project files contain recipes and source metadata, without media bytes or machine paths. Open a project and relink its original media to restore edits; you can undo the restore. Keep the original files alongside your projects. Theme preference persists locally.

Keyboard shortcuts: Ctrl/Cmd+O imports, Space plays/pauses (including when timeline clips, trim handles, or the seek slider have focus), I/O set trim boundaries, Ctrl/Cmd+Z undoes, and Ctrl/Cmd+Shift+Z redoes. A shortcut reference is available in the footer.

Audio files automatically generate a **waveform** when selected. For videos with audio, choose Generate waveform in the Timeline. Peaks are cached per source and drawn inside each retained clip: trims and split-section edges crop the matching source peaks live, and removed sections leave empty gaps. Processing runs locally, can be cancelled, and offers a retry if interrupted.

For video, **Generate thumbnails** adds a strip of twelve source frames. Click a thumbnail to seek to that part of the source. Thumbnails are generated locally and released when their media leaves the library.

**Merge clips** combines imported sources in your chosen order. Drag clips or use the up/down buttons; each clip keeps its recipe. Video outputs require video sources, fit frames to the first clip, and use silence for missing audio. Mixed video/audio selections can export audio. Compatible audio outputs keep the first clip’s artwork by default when present.

Use **Speed** for 0.25×–4× playback and export. Audio pitch stays unchanged by default; disable preservation for the classic pitch-shifting effect. Speed also applies to each source in a merge. Trim boundaries stay in source time, while output duration reflects the speed. Older project files default to 1× with pitch preservation.

Enable **Fades** to fade video to/from black and audio to/from silence, then drag their bar edges in the **Timed effects** lanes above the media track. Fade duration uses output seconds after cuts and speed. Preview fades update smoothly during playback. In **Merge clips**, choose **Crossfade audio and video** to overlap adjacent clips; the duration can use at most half of the shortest clip, and the overlap shortens the output.

Open **Audio cleanup & EQ** to normalize loudness to a LUFS target, reduce steady background noise, and adjust bass/mid/treble by up to 12 dB. Cleanup also applies within merged clips. **Preview audio effects** processes a retained section up to 10 seconds; final normalization processes the complete export. Manual volume applies after normalization.

## Batch export

Open **Batch export**, select library files, and choose each file’s recipe, current output settings, or all current edits. Jobs run sequentially with per-file progress and errors. Desktop asks for one output folder and numbers conflicting filenames; the browser offers a separate download per result. Cancelling preserves completed results. Browser batch downloads have a 500 MB retention guard; save and clear results before running more jobs.

## Capabilities

| Capability | Desktop | Web |
| --- | --- | --- |
| MP4, MOV, MKV, WebM, GIF export | Native FFmpeg | FFmpeg WebAssembly |
| MP3, WAV, FLAC, OGG, M4A export | Native FFmpeg | FFmpeg WebAssembly |
| Trim, split/remove, crop, volume | Yes | Yes |
| Metadata and artwork retention | Compatible formats | Compatible formats |
| Recursive folder import and conversion queue | Native folder picker / drop | Supported directory picker / drop |
| Bulk conversion downloads | One destination, organized subfolders | ZIP and individual files |
| Native open/save dialogs and filesystem paths | Yes | Browser picker/download |
| Large-file processing | Reads directly from disk | 500 MB/file, 800 MB library guard |
| Progress and export cancellation | Yes | Yes |
| Music/voiceover tracks, scenes, markers and contact sheets | Yes | Yes |
| Watch-folder conversion | While Frame is open | Desktop only |
| Background completion notifications | Yes, OS support permitting | Desktop only |
| Media preview | Chromium codec support | Browser codec support |

Common input extensions include MP4, MOV, MKV, WebM, AVI, M4V, GIF, MP3, WAV, FLAC, OGG, M4A, AAC, OPUS, and AIFF. A container alone does not guarantee a decodable stream. Unsupported preview codecs can still be converted when FFmpeg can decode them. GIF previews loop the source; trim/split edits are applied on export. Volume above 100% is applied on export and may clip; the media element's preview is capped at 100%.

Browser guards are conservative, not a guarantee that a 500 MB job will fit: decoding, processing, and output buffers consume additional memory. Mobile devices may support considerably smaller jobs. Desktop uses native processes and avoids those WebAssembly limits. Audio layering and hardware encoding are available now; arbitrary third-party plugins remain a future extension.

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

Subtitles: import SRT or WebVTT, edit caption text, and adjust source timing by dragging caption bar edges above the media track. Drag captions directly in the preview to place them, or use arrow keys (Shift for larger steps). Touch works too; Escape cancels a drag, each drag is one undo step, and individual positions can be reset. Placement is saved with projects/autosave and applied to burned-in captions using frame-relative coordinates, including cropped or resized exports. Overlapping captions use separate lanes. Caption and timed-effect groups can be folded to save space. Burn-in uses a bundled DejaVu Sans font on both platforms; MP4/MOV/MKV/WebM also support selectable subtitle streams, whose layout is controlled by the player. Output SRT timing follows trims, cuts and speed; SRT does not preserve placement. Merges retain per-clip burn-in or combine embedded cues.

Text and watermarks: add multiline text or a PNG/JPEG/WebP image, position it, and adjust size/color/opacity. Images are normalized to portable PNG assets stored in the project. FFmpeg uses bundled-font ASS text and image overlays, including for merged clips; text is never interpreted as a filter expression.

Geometry: rotate by 90° increments, flip horizontally/vertically, and resize with letterbox, fill/crop or stretch. Portrait, square, 720p and 1080p presets are available, plus custom dimensions and an aspect-ratio lock. Transforms follow the source crop and also apply to merged clips; crop editing remains in source coordinates.

Color: adjust brightness, contrast, saturation and temperature; import complete 2–33 point 3D `.cube` LUTs. LUT content is validated and travels with projects. Render the playhead frame through FFmpeg to inspect the actual edits at up to 720 pixels, including crop, transforms, captions, overlays and fades.

Silence removal: analyze original audio with a configurable dB threshold, minimum duration and retained padding. Review and select proposed source-time cuts before applying; changes are undoable and exports remove only the selected sections.

Export size: see bitrate-based estimates, a broad range for quality-mode/lossless output, or PCM estimates for WAV. Target-size mode derives average bitrates from edited duration with a 5% overhead allowance and is available for lossy formats. Targets use decimal MB and are approximate rather than hard limits; content, artwork and short-file overhead can vary. Targets also work in output presets, batches and merges.

Autosave is enabled by default and can be turned off in Settings → Editing. Disabling it preserves any previous recovery document; manual project saving stays available. Valid editing recipes are persisted in local IndexedDB after a 700 ms pause, including captions, images and LUTs, with a 16 MB workspace limit. On restart, choose Recover workspace and relink/import the original media, or discard recovery. Pending recovery is protected from new imports until resolved. Media bytes, source paths, undo history and export jobs are not retained. Private browsing, cleared site/app storage or insufficient disk space can prevent recovery; explicit project files remain available.

Desktop performance: test available VideoToolbox, NVENC, Quick Sync and AMF H.264 encoders, then choose automatic acceleration or a detected encoder. Unavailable or failing hardware retries with portable software FFmpeg; cancellation never triggers a retry. Hardware compression differs from software quality presets. Temporary MP4/MP3 preview proxies help with heavy or unsupported playback formats while final exports always read original sources. Proxies are session-local and cleaned up on release/exit. These controls are desktop exclusive; web exports remain WebAssembly software encoding.

## Effects and clip sequencing

The Effects tab is a searchable library, grouped into Audio, Video and Timing. Choose a card to open its controls; the applied-effects list lets you revisit or remove an effect. The **Apply to** selector targets all clips or one split clip. Selecting a timeline clip also sets the target. Volume, speed, fades, cleanup, equalizer, color/LUTs, crop and transforms support individual clips. Shared changes replace that setting on all clips; other clip-specific settings remain. Captions, watermarks and silence detection are labeled source-wide. Caption timing follows cuts, clip order and speed on export.

Drag a clip body to reorder it, or focus it and use **Alt + Left/Right**. Drag its edges to trim. Splitting carries its settings into both children. Ordering and scoped effects are included in undo, project files, autosave, export and merge. Clips are joined without gaps; different crop or transform dimensions fit inside the shared output canvas.

The main clip track stays visible below scrollable caption and effect tracks. **Compact** collapses track groups, and the track filters isolate clips, captions or effects. The overview strip shows the full sequence and lets you pan a zoomed timeline; **Locate playhead** returns to the current position and **Fit** restores the full view. Fullscreen preview includes a playback slider that follows the edited output.

Waveform analysis runs separately from editing: a native background FFmpeg job on desktop and a dedicated WASM worker on web. You can trim, change effects and export while it runs. Cancelling waveform analysis leaves an export running. Source peaks are cached during the session and follow each trimmed or moved clip; the browser releases the extra worker after analysis finishes.

Audio delivery: Advanced export/conversion settings let you choose a sample rate, keep the automatic channel layout or convert to mono/stereo, and select 16-bit, 24-bit, or 32-bit float WAV output. These choices travel with projects and output presets, apply to merges, and update WAV size estimates. Automatic sample rate retains the encoder/processing defaults; increasing rate or bit depth does not restore missing source detail. Switching to a format that cannot use the selected rate resets it to Automatic.

GIF delivery: Advanced export/conversion options include play once, infinite looping, or 1–100 extra repeats; a smaller output width; 32–256 color presets; and smooth, ordered, or disabled dithering. Settings persist in projects and output presets and apply to merged GIF exports. Width preserves the edited aspect ratio. Player behavior may override the encoded repeat count.

Conversion naming: Advanced options accept a filename pattern with `{name}`, `{index}` (001-based queue numbering), `{format}`, and `{folder}` (the nearest source folder). A live preview shows the resulting path; the extension is added automatically. Names are made portable for Windows/macOS/Linux, folder structure remains optional, existing-file collisions are numbered, and retries keep their queue numbers. The pattern is remembered on this device; Clear results starts a new numbering sequence.

Source information is available from the preview header and each conversion row. It shows the original codecs, frame rate, dimensions, sample rate, channels, artwork and common embedded metadata without changing the file.

Use the preview transport or comma/period keys to step video frames (audio moves one output second). Clicking the timecode opens precise sequence navigation with seconds, m:ss or h:mm:ss input. Stepping pauses playback and follows reordered clips across cuts.

Add named, colored timeline markers with M or the bookmark button. Drag markers to reposition them, double-click to rename, or use the marker list to navigate and remove bookmarks. Markers are saved in projects and autosave, remain anchored to the source during clip reordering, and support undo/redo.

Timeline snapping aligns dragged trim handles, caption and fade boundaries, markers and the scrubber with nearby landmarks; video source edits also snap to frames. Use the magnet toggle to disable snapping, or hold Alt during a drag for free placement. The toggle is remembered on this device.

The repeat control in the preview loops the entire retained sequence or the selected clip. Looping is a review preference and is reset when changing source files. Export timing continues to use the edited sequence.

In Effects → Recipes & copy / paste, copy clip effects to another clip or source, or save up to 20 named recipes on this device. Recipes apply in the selected effect scope, scale crops to new source dimensions and clamp fades to the receiving duration. Audio sources receive the compatible audio and timing effects.

Captions support literal find-and-replace with case-sensitive and Unicode whole-word matching. Next match navigates across paged caption lists, and Replace all preserves timing and placement in one undoable edit.

Project tools → Video contact sheet exports a PNG overview of the edited clip order and effects. Choose 2–6 rows and columns, frame width, and optional sequence timestamps. Processing stays local on desktop and web.

Desktop completion notifications report saved exports, merges and batches while Frame is in the background. Settings → Completion notifications controls the persisted preference. Partially failed batches report files needing attention; cancelled batches remain quiet. The setting is visible and disabled on web.

Project tools → Find scene changes scans source RGB frames locally on desktop or web. Adjust the change threshold and minimum gap, review or deselect proposed points, then add markers or split the retained clips in one undoable action. Results are capped at 500 changes, and splits inherit local effects.

Audio cleanup effects include full edited-audio loudness measurement: integrated LUFS, loudness range, and true peak with headroom/clipping guidance. Measurements include cuts, ordered clip effects, speed and fades, are available on desktop and web, and reset after edits so stale readings are not shown.

Desktop Settings includes watch folders: Frame polls up to 10 input folders while it is open, waits for files to stop changing, and converts them with a chosen output preset. Existing files are skipped by default; enable their conversion during setup if desired. Source and output folders must be separate across all watches; neither may contain the other. Pause/resume, explicit retries, preserved subfolders, collision-safe filenames and durable completion records keep ongoing imports manageable.

**Music & voiceover** in the Effects library adds up to 16 imported audio tracks to the edited output. Each track has its own volume, mute, fades, source excerpt and repeat option. Its timeline bar moves by dragging or Alt + arrow keys, and its edges trim the window; waveforms follow the source excerpt and repeated audio. Track positions use output time, so rearranging video clips leaves the soundtrack in place. Peak protection is enabled by default. Live playback approximates levels; **Preview exported mix** and the loudness meter use the actual final processing. Audio layers are included in exports and merges and saved in projects; relink their sources when reopening a project. Conversion-only mode continues to process the original source without editor audio layers.

Recent exports in Settings lists the last 100 desktop outputs from editing, conversion, merging and watch folders. Search the list, reveal an output in its folder, or forget entries without deleting saved files. History remains on the device and survives restarts.

Timeline markers can become chapters in MP4, MOV, MKV and M4A exports. Enable **Chapters from markers** in advanced export settings, or download a timestamp list from the marker manager. Chapters follow retained clip order and speed. Merged exports can also add chapters using clip names and markers.

Project relinking also compares a small sampled content fingerprint, helping distinguish equally named files from different albums without hashing entire large videos. Audio tracks preserve their specific source references in saved projects.

Advanced output settings include an optional metadata editor for titles, artists, albums, track numbers, dates, genres, comments and copyright. Explicit changes apply even when source metadata is removed; clearing a field removes that tag. Bulk conversion and watch folders can apply shared tag changes. Filename patterns also support `{title}`, `{artist}`, `{album}` and `{track}`, using any edited values.

Music tracks can duck automatically under original dialogue or tracks marked as voiceover. Enable **Duck music under dialogue** in Music & voiceover, and use the exported mix preview to hear the final result. Export applies dialogue-driven compression with a smooth attack and recovery; live playback retains the original levels.

Add custom cover artwork in advanced audio export or conversion options for MP3, FLAC and M4A. PNG, JPEG and WebP images are prepared locally and large covers are resized. Individual projects store their cover; bulk covers apply to the current conversion session. Removing a custom cover restores the source artwork behavior.

After bulk conversion, save a CSV report with source/output names, format, status, sizes, duration and any errors. Reports are prepared locally and include failed or cancelled items as well as successful outputs.

Use the header command search or Ctrl/Cmd+K to find import, editing, review, conversion, export and settings actions. Arrow keys move through available commands; Enter runs one and Escape closes search. Unavailable actions explain what they need. Inspector tabs retain their selection while moving between workspaces.

Project files are limited to 16 MB of UTF-8 data so saved workspaces remain reopenable. Frame uses compact JSON near that limit; large embedded image collections may need smaller workspaces. Autosave builds the portable snapshot after the editing pause rather than during every slider movement.
