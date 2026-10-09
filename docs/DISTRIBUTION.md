# Desktop distribution

Frame uses Electron Builder for Windows NSIS installers, macOS DMG files, and optional Linux AppImages. Run the build on the same OS and CPU architecture as the artifact. `scripts/verify-package.cjs` enforces that requirement and runs both portable media tools with an empty PATH before packaging.

## Portable media tools

- `ffmpeg-static` installs the target machine's FFmpeg binary.
- `@ffprobe-installer/ffprobe` installs a platform-specific FFprobe binary through optional npm dependencies.
- Both binaries are included as production dependencies and unpacked outside Electron's ASAR archive.
- `electron/native.ts` converts their package paths to unpacked paths before starting them.
- No system FFmpeg discovery, user PATH setup, shell invocation, runtime download, or install prompt is needed.
- The sample media is copied to the external resources directory for native subprocess access.

The same desktop smoke test can run against an unpacked artifact:

```sh
FRAME_TEST_EXECUTABLE=/absolute/path/to/Frame npm run test:desktop
```

On Windows set environment variables using PowerShell syntax; on Linux provide a display or run under Xvfb. The test launches the application with an empty PATH, imports and previews the sample, performs a native FLAC export, and checks output duration and cleanup.

## File-manager integration

The Electron build generates `build/generated/windows-context-menu.nsh` and the bundled Finder workflow resources from the canonical supported-extension list. NSIS includes its `customInstall` / `customUnInstall` hooks; install context (`SHCTX`) follows per-user/all-user installation. Each supported extension gets `Frame.Edit` and `Frame.Convert` under `Software\Classes\SystemFileAssociations`, with an executable icon, quoted `%1` input, explicit workflow, and `MultiSelectModel=Player`. Shared canonical verb names allow mixed file-type selections. Explorer may invoke one process per file; Frame’s single-instance inbox coalesces pending requests and imports every accepted path. Classic Explorer verbs are limited to 100 selected files and appear in Windows 11’s **Show more options** menu. This implementation does not ship an in-process Explorer extension or modify default file associations.

Uninstall checks that each command still belongs to that installation before deleting only its Frame verb key. This protects an action registered by a newer installation at another path. Installer hooks refresh the shell association cache. Unpacked Windows builds do not register menu entries; use the NSIS installer.

On macOS, the packaging hook advertises supported media as `Editor` / `Alternate` document types without claiming the default handler. The packaged app’s Frame menu installs/removes two per-user `.workflow` services under `~/Library/Services`. Automator passes file paths as arguments to the installed app executable, using Launch Services to resolve Frame by bundle ID. Starting the executable also forwards workflow arguments to a running instance; plain `open --args` would lose those arguments when the app was already open. Users may need to enable the actions in System Settings. Removing the `.app` does not uninstall user services; remove the Quick Actions from Frame first.

On Linux, the optional CLI installer writes executable Dolphin service-menu entries into the user data directory (`XDG_DATA_HOME`, or `~/.local/share`), including the older KDE 5 directory. `%F` preserves separate file arguments, the executable is quoted using Desktop Entry escaping, and actions are limited to local media. An AppImage registers its persistent `APPIMAGE` path instead of the temporary mounted executable. Remove the entries before deleting or moving the application. Nautilus and other file managers are outside this integration.

Windows CI installs the actual NSIS artifact into a temporary path, checks all registry commands, invokes shell actions on a mixed selection, runs the installed launch tests, and verifies uninstall cleanup. The portable Electron tests also exercise cold starts, subsequent process launches, minimized-window restoration, queued imports during an active job, and draft preservation.

## Signing

Local packaging and CI use unsigned artifacts by default. Configure Electron Builder's supported certificate, notarization, and signing settings when preparing publicly trusted installers. Do not commit certificates, passwords, API keys, or developer credentials. Packaging never publishes automatically.

## Third-party notices

The media binaries are distributed under their respective upstream licenses, not merely their npm wrapper licenses. The included builds enable GPL components (including x264); WebAssembly core 0.12.10 is GPL-2.0-or-later, and the current Linux native binaries are GPL-3.0. Platform builds may differ; retain the matching vendor notices and corresponding-source information when distributing artifacts.

The asset-preparation script copies the native FFmpeg vendor license/README and generates a notice listing the installed FFmpeg/FFprobe versions, package versions, source projects, and binary providers. Desktop packages include these in `resources/notices`; the web build includes `notices/`. Upstream corresponding source and build instructions are available from:

- https://github.com/eugeneware/ffmpeg-static (binary build/release selection)
- https://github.com/SavageCore/node-ffprobe-installer (FFprobe platform selection)
- https://www.johnvansickle.com/ffmpeg/ (Linux static builds and source archives)
- https://ffmpeg.org/download.html (FFmpeg source releases)
- https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v0.12.10 (WebAssembly build instructions)

Preserve the sources/build instructions that correspond to the exact shipped binaries when preparing a public release. The project intentionally does not invent a license for the application owner's code.
