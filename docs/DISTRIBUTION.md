# Desktop distribution

Frame uses Electron Builder for Windows NSIS installers, macOS DMG files, and optional Linux AppImages. Run the build on the same OS and CPU architecture as the artifact. `scripts/verify-package.cjs` enforces that requirement and runs both portable media tools with an empty PATH before packaging.

## Portable media tools

- FFmpeg archives and standalone yt-dlp binaries are committed in `vendor/media-tools/`. Setup verifies their SHA-256 checksums and extracts/copies only the host target into `build/media-tools/`; no GitHub download is needed during setup or build.
- `@ffprobe-installer/ffprobe` installs a platform-specific FFprobe binary through optional npm dependencies.
- FFmpeg and yt-dlp are copied into external `resources/media-tools`; FFprobe remains a production dependency unpacked outside Electron's ASAR archive.
- `electron/tool-paths.ts` selects the prepared development or packaged resource paths. `electron/native.ts` resolves FFprobe's unpacked package path.
- No system FFmpeg discovery, user PATH setup, shell invocation, runtime download, or install prompt is needed.
- The sample media is copied to the external resources directory for native subprocess access.

The same desktop smoke test can run against an unpacked artifact:

```sh
FRAME_TEST_EXECUTABLE=/absolute/path/to/Frame npm run test:desktop
```

On Windows set environment variables using PowerShell syntax; on Linux provide a display or run under Xvfb. The test launches the application with an empty PATH, imports and previews the sample, performs a native FLAC export, and checks output duration and cleanup.

## File-manager integration

The Electron build generates `build/generated/windows-context-menu.nsh` and the bundled Finder workflow resources from the canonical supported-extension list. The assisted NSIS installer shows a checkbox checked on first installation and remembers the per-user preference in `HKCU\Software\Frame\ShellActions`. Silent installation supports `/NOFRAMECONTEXTMENU` and `/FRAMECONTEXTMENU` overrides. Its `customInstall` / `customUnInstall` hooks register classic actions under `HKCU` and install/remove the Windows 11 primary-menu component. Each supported extension gets `Frame.Edit` and `Frame.Convert` under `Software\Classes\SystemFileAssociations`, with an executable icon, quoted `%1` input, explicit workflow, and `MultiSelectModel=Player`. Shared canonical verb names allow mixed file-type selections. Explorer may invoke one process per file; Frame’s single-instance inbox coalesces pending requests and imports every accepted path. Classic Explorer verbs are limited to 100 selected files and appear in Windows 11’s **Show more options** menu. Default file associations are unchanged.

On x64 Windows 11, `native/windows-shell` supplies two statically linked `IExplorerCommand` COM classes registered through a sparse MSIX identity. Windows can group **Edit in Frame** and **Convert in Frame** under **Frame** in the primary menu. The classic registrations remain independent. Source and binary fingerprints are checked at build time; checked-in binaries avoid requiring a C++ compiler for development. The sparse package contains only XML and images and points to code copied into a per-user directory named by the DLL hash. Upgrades avoid overwriting loaded DLLs. Commands validate local supported selections, preserve Unicode and special characters, and split large selections into bounded Windows command lines.

Unsigned MSIX packages cannot declare executable activations: even with all DLLs/EXEs outside the archive, `Add-AppxPackage -AllowUnsigned` rejects this manifest with `0x80073D2B`. Elevation does not solve that restriction. For unsigned local builds, enable Developer Mode explicitly in Windows Settings; Frame then registers a persistent copy of the manifest and assets with `Add-AppxPackage -Register -ExternalLocation`. It checks and restores those development files on repair. Frame only reads the existing Developer Mode policy and never changes it or certificate trust.

Distributed installers need a trusted signed shell MSIX. Prepare the sparse package with `FRAME_WINDOWS_SHELL_PUBLISHER` matching the certificate subject, sign it with Windows SDK SignTool, then supply a separate signed copy through `FRAME_WINDOWS_SHELL_PACKAGE` and rebuild/package. The build verifies the manifest and signature presence; Windows checks cryptographic validity and certificate trust when deploying it. Signed package deployment does not require Developer Mode. With neither signing nor Developer Mode, Settings reports the requirement and preserves classic entries. See [the native component guide](../native/windows-shell/README.md) for rebuilding and signing inputs. Other Windows versions/processors retain classic actions.

Uninstall checks that each command still belongs to that installation before deleting only its Frame verb key. This protects an action registered by a newer installation at another path. Installer hooks refresh the shell association cache. Packaged and development builds can also install/remove actions from Settings using a narrow, trusted main-process API. Status checks read both actual registry verbs and the primary package, launch ownership, and native file hashes, detect incomplete installations, and offer repair. Removal unregisters only Frame’s recorded package and cleans up managed component directories where Explorer has released its DLL. Removal also updates the preference so upgrades respect the opt-out. Development commands include the Electron executable and the absolute project directory; `pnpm desktop` builds the renderer so cold launches work without Vite. Windows registration uses Windows PowerShell with paths passed as JSON through stdin; paths are never interpolated into scripts.

On macOS, the packaging hook advertises supported media as `Editor` / `Alternate` document types without claiming the default handler. Settings and the packaged app’s Frame menu install/remove two per-user `.workflow` services under `~/Library/Services`. Automator passes file paths as arguments to the installed app executable, using Launch Services to resolve Frame by bundle ID. Starting the executable also forwards workflow arguments to a running instance; plain `open --args` would lose those arguments when the app was already open. Users may need to enable the actions in System Settings. Removing the `.app` does not uninstall user services; remove the Quick Actions from Frame first.

On Linux, Settings and the optional CLI installer write executable Dolphin service-menu entries into the user data directory (`XDG_DATA_HOME`, or `~/.local/share`), including the older KDE 5 directory. `%F` preserves separate file arguments, the executable is quoted using Desktop Entry escaping, and actions are limited to local media. An AppImage registers its persistent `APPIMAGE` path instead of the temporary mounted executable. Remove the entries before deleting or moving the application. Nautilus and other file managers are outside this integration.

The disposable Windows CI runner explicitly enables Developer Mode for its unsigned test builds; this policy setup is confined to the workflow. Windows CI installs the actual NSIS artifact into a temporary path, checks all registry commands, invokes classic shell actions on a mixed selection and, on supported Windows builds, activates the registered COM classes to check selection filtering and invoke both workflows, runs installed launch and settings tests, checks primary-component repair, silent opt-out/opt-in and remembered opt-out on upgrades, and verifies registry and package uninstall cleanup. The portable Electron tests also exercise cold starts, subsequent process launches, minimized-window restoration, queued imports during an active job, and draft preservation.

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
