# Frame

A cross-platform media editor and converter for images, video and audio. Edit a clip, layer audio, or convert an entire folder—all processed locally on your device.

[Try the web app](https://davidniessen.github.io/frame/) · [Download desktop builds](https://github.com/DavidNiessen/frame/releases) · [Report a bug](https://github.com/DavidNiessen/frame/issues)

## Features

- **Images:** a dedicated canvas with zoom, pan, before/after comparison, crop handles, rotation, text and editable brush layers. Export PNG, JPEG, WebP, BMP or TIFF; convert entire image folders.
- **Shapes & guides:** editable rectangles, rounded rectangles, ellipses, lines and arrows for images and videos; on-canvas handles, rotation, color and stroke controls. Center, thirds and safe-area guides, with snapping for shapes, text and artwork.
- **Image layers:** reorder, rename, hide, lock and group adjustments and frame objects. Nine blend modes, layer opacity, and editable rectangle, ellipse or brush masks with feathering and inversion.
- **Color curves:** RGB and separate red/green/blue tone curves, a frame histogram, draggable points, numerical controls and tonal presets. Also available as timed video effects.
- **Batch image sizes:** resize by longest edge, dimensions or percentage; preserve proportions, crop to fill or stretch. Avoid enlargement and save custom size presets.
- **Visual adjustments:** exposure, gamma, shadows, highlights, vibrance, hue, tint, vignette, blur, sharpen, black & white, sepia, invert, pixelate, posterize, film grain, sketch and emboss. These also work as timed video effects with live previews.
- **Edit:** trim, split, reorder and join clips; insert videos from the library; replace or layer audio; extract audio from video.
- **Effects:** crop, rotate, resize, speed, fades, color adjustments, LUTs, volume, EQ, noise reduction and loudness normalization. Timed effects have draggable timeline bars and live previews.
- **Playback:** independent monitoring volume, five-second skips that keep playback running, precise frame stepping and an audio-reactive background.
- **Captions:** independent text effects with on-frame editing, positioning and resizing; fonts, colors and styling; SRT import/export and burned-in subtitles.
- **Convert:** files or recursive folders, a dedicated batch queue, presets, custom filenames, metadata and artwork, plus advanced encoding options.
- **URL imports:** direct files on desktop/web; public YouTube, Instagram Reels, TikTok, SoundCloud, Vimeo, Dailymotion and Bandcamp links on desktop, with video/audio and quality choices.
- **Desktop downloads:** an animated Install App button opens a platform picker, with automatic detection and an optional latest prerelease.
- **Updates:** installed apps check GitHub at startup and every six hours, download verified updates in the background, and install on restart. Opt into prereleases in Settings; a settings badge highlights available updates.
- **Workspace:** undo/redo, portable `.frame.json` projects, automatic local recovery, resizable panels, keyboard shortcuts and a command palette.
- **Appearance:** system light/dark detection, Light, Dark and High contrast themes, responsive layouts and reduced-motion support.

Output formats: **PNG, JPEG, WebP, BMP, TIFF, MP4, MOV, MKV, WebM, GIF, MP3, WAV, FLAC, OGG and M4A**. Input support depends on FFmpeg and the playback capabilities of your platform; desktop proxies help preview formats that the browser cannot play directly.

## Desktop and web

| Capability                                   | Windows / macOS / Linux                         | Web                                                 |
| -------------------------------------------- | ----------------------------------------------- | --------------------------------------------------- |
| Editing, effects and conversion              | Bundled native FFmpeg                           | Self-hosted FFmpeg WebAssembly                      |
| Folder conversion                            | Native picker and destination folder            | Directory picker/drop where supported; ZIP download |
| Local file-manager actions                   | Windows Explorer, Finder Quick Actions, Dolphin | Unavailable                                         |
| Compact context-menu converter               | Yes                                             | Unavailable                                         |
| Direct media URLs                            | Yes                                             | Requires the media host to allow CORS               |
| Public video / music service URLs            | Bundled yt-dlp; no backend                      | Unavailable                                         |
| Installed system fonts                       | Yes                                             | Bundled fonts only                                  |
| Hardware encoding, proxies and watch folders | Yes, subject to hardware/platform support       | Unavailable                                         |

Browser GIF conversion uses separate palette and encoding passes to avoid buffering an entire decoded movie. The browser has memory guards: 500 MB per source, 800 MB per library and 500 MB of retained conversion results. ZIP preparation uses additional memory. Use desktop for large collections.

Media is processed on your device. URL imports connect to the source you choose. Desktop includes FFmpeg, FFprobe and yt-dlp; users do not need to install those tools separately. Web assets and fonts are served with the application, without third-party CDNs or API keys.

Frame is under active development. Automatic desktop builds are prereleases; maintainers can also publish full releases. Windows installers are currently unsigned. macOS apps are ad-hoc signed to verify bundle integrity, but are not Apple notarized; first launch may require approval in **System Settings → Privacy & Security → Open Anyway**. The Windows Explorer extension has a separate certificate-consent workflow. See [installation, distribution and signing](docs/DISTRIBUTION.md) before redistributing builds.

## Get started

In **Editor**, import media, select a source, then drag timeline edges to trim. Split and remove sections, add effects with **+** or a double-click, and click an effect bar to adjust it. Open **Export** to choose the output format.

In **Convert**, add files or a folder, choose the target format and start the batch. Advanced settings include bitrate, metadata, artwork and filename templates. Conversion uses complete original sources independently of your editor drafts.

Press **Ctrl/Cmd + K** for commands. **Space** toggles playback outside text fields. See the [user guide](docs/USER_GUIDE.md) for projects, audio replacement and file-manager actions.

## Development

Use **Node.js 24** (recommended), or Node.js 22.13+. npm is the reference package manager and `package-lock.json` is the canonical lockfile.

```sh
npm ci
npm run dev      # Web app
npm run desktop  # Electron app; requires a graphical session
```

pnpm 10.26+ / 11 / 12 is also supported:

```sh
pnpm import
pnpm install --frozen-lockfile
pnpm desktop
```

Install scripts prepare the local WebAssembly assets and checksum-verified vendored media tools. Electron's runtime is downloaded by its installer. If desktop startup reports an incomplete runtime, run `npm run setup:desktop` (or `pnpm setup:desktop`). See [contributing](CONTRIBUTING.md) for troubleshooting and [cloud development](docs/CLOUD_SETUP.md) for headless environments.

## Checks and builds

```sh
npm run check            # Prettier, ESLint and TypeScript
npm test                 # Setup, core logic and native media regressions
npx playwright install chromium
npm run test:e2e         # Browser UI and actual WebAssembly processing
npm run test:desktop     # Build and run Electron regressions
npm run build            # Web and Electron bundles
npm run package          # Installer for the current OS and architecture
```

Use `npm run format` and `npm run lint:fix` to apply automatic fixes. CI validates the web app, pnpm setup and native desktop builds on Windows, macOS Intel/Apple Silicon and Linux. Every successful `master` push publishes all four installers and `SHA256SUMS.txt` as a uniquely versioned prerelease. For a full release, open **Actions → Validate and package → Run workflow**, select `master`, choose **release**, and enter a version such as `1.0.0`. Choose **prerelease** for a manual preview. Leaving the version blank continues the current release line. After `v1.0.0`, automatic previews use `v1.0.1-build.N`; a manually selected newer prerelease version becomes the preview line. Published tags determine versions without committing automated version bumps. Full releases are never overwritten.

## Project structure

```text
src/core/        Framework-independent edit model, validation and FFmpeg planners
src/engines/     Shared media-engine API with web and desktop adapters
src/hooks/       Application state and editing lifecycles
src/components/ UI, conversion workspace and settings
src/styles/     Theme tokens and responsive surfaces
electron/      Main process, sandboxed preload and native integrations
native/         Windows Explorer extension sources and verified public assets
scripts/        Setup, builds, tool verification, signing and release preparation
tests/          Core, browser, Electron and setup regressions
vendor/         Pinned media tools with upstream notices and checksums
```

See [architecture](docs/ARCHITECTURE.md), [design](docs/DESIGN.md), and [contributing](CONTRIBUTING.md) when extending Frame.

## Hosting

`npm run build` produces the web app in `dist/`. Serve it over HTTPS with the isolation headers in [the nginx example](docs/nginx.conf). GitHub Pages uses the included isolation service worker; the full-release workflow builds and tests that mode before deploying. GitHub Pages updates only on full releases, so automatic prereleases do not change the public web app. No media-processing backend is needed.

## Licensing

Frame's application code does not yet have a chosen open-source license. An explicit license is required before reuse or redistribution of that code is permitted. Bundled tools, fonts and dependencies retain their upstream licenses; see [distribution notices](docs/DISTRIBUTION.md) and [vendored tools](vendor/media-tools/README.md).
