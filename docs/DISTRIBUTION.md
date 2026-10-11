# Desktop distribution

Frame uses Electron Builder for Windows NSIS installers, macOS DMG files, and optional Linux AppImages. Run the build on the same OS and CPU architecture as the artifact. `scripts/verify-package.cjs` enforces that requirement and runs both portable media tools with an empty PATH before packaging.

Renderer libraries and font assets are bundled by Vite. Their original Node package copies are excluded from desktop archives, including both unused WebAssembly binaries. The external FFprobe package and its native platform dependency remain packaged; desktop processing uses the portable native tools.

## Portable media tools

The violet application logo comes from `public/favicon.svg`. Maintainers can run `pnpm exec playwright install chromium` and `pnpm build:icon` to regenerate `build/icon.png`, which Electron Builder uses for application icons. After changing the logo, regenerate the signed Windows shell assets in this order: `pnpm sign:windows-shell`, `pnpm build:windows-shell`, then `pnpm build`. Signing changes integrity metadata included in the native source fingerprint, so the native build must follow signing. These commands require the signing and compiler tools described in the native component guide; normal installation uses the committed assets. Existing development shell registrations need **Settings → Repair actions** to receive updated Explorer icons. Packaged application icons require rebuilding and installing the updated desktop artifact.

- FFmpeg archives and standalone yt-dlp binaries are committed in `vendor/media-tools/`. Setup verifies their SHA-256 checksums and extracts/copies only the host target into `build/media-tools/`; no GitHub download is needed during setup or build.
- `@ffprobe-installer/ffprobe` installs a platform-specific FFprobe binary through optional npm dependencies.
- FFmpeg and yt-dlp are copied into external `resources/media-tools`; FFprobe remains a production dependency unpacked outside Electron's ASAR archive.
- `electron/tool-paths.ts` selects the prepared development or packaged resource paths. `electron/native.ts` resolves FFprobe's unpacked package path.
- No system FFmpeg discovery, user PATH setup, shell invocation, runtime download, or install prompt is needed.

The same desktop smoke test can run against an unpacked artifact:

```sh
FRAME_TEST_EXECUTABLE=/absolute/path/to/Frame npm run test:desktop
```

On Windows set environment variables using PowerShell syntax; on Linux provide a display or run under Xvfb. The test launches the application with an empty PATH, imports and previews a test fixture, performs a native FLAC export, and checks output duration and cleanup.

## macOS installation

Use the **Mac Apple Silicon** download on M1/M2/M3/M4 Macs and **Mac Intel** on Intel Macs. Open the DMG and drag Frame into Applications, replacing an older copy when updating.

Both architectures are explicitly ad-hoc signed after packaging. CI mounts the actual DMG, copies its app as Finder would, verifies the resource seal and nested code with `codesign --verify --deep --strict`, and runs native import/export smoke tests against that installed copy. It also checks that modifying the app's resources invalidates the signature. This catches broken Electron resource signatures before publishing.

Ad-hoc signing verifies integrity; it does not establish an Apple-verified publisher or notarization. If macOS blocks a prerelease on first launch, attempt to open **Applications → Frame**, then use **System Settings → Privacy & Security → Open Anyway** and approve that app. On recent macOS versions, Finder's right-click Open alone may not offer this approval.

If macOS reports that Frame is damaged, verify the installed app:

```sh
codesign --verify --deep --strict --verbose=2 /Applications/Frame.app
```

An error such as `code has no resources but signature indicates they must be present` means the bundle signature is invalid. Replace that copy with the latest release. If the latest copy also fails verification, report the release, architecture and command output. A passing integrity check is separate from Gatekeeper approval.

## File-manager integration

The Electron build generates `build/generated/windows-context-menu.nsh` from the canonical supported-extension list. The assisted NSIS installer shows a checkbox checked on first installation and remembers the per-user preference in `HKCU\Software\Frame\ShellActions`. Silent installation supports `/NOFRAMECONTEXTMENU` and `/FRAMECONTEXTMENU` overrides. Its `customInstall` / `customUnInstall` hooks register classic actions under `HKCU` and install/remove the Windows 11 primary-menu component. Each supported extension gets `Frame.Edit` and `Frame.Convert` under `Software\Classes\SystemFileAssociations`, with an executable icon, quoted `%1` input, explicit workflow, and `MultiSelectModel=Player`. Shared canonical verb names allow mixed file-type selections. Explorer may invoke one process per file; Frame’s single-instance inbox coalesces pending requests and imports every accepted path. Classic Explorer verbs are limited to 100 selected files and appear in Windows 11’s **Show more options** menu. Default file associations are unchanged.

On x64 Windows 11, `native/windows-shell` supplies two statically linked `IExplorerCommand` COM classes registered through a sparse MSIX identity. Windows can group **Edit in Frame** and **Convert in Frame** under **Frame** in the primary menu. The classic registrations remain independent. Source and binary fingerprints are checked at build time; checked-in binaries avoid requiring a C++ compiler for development. The sparse package contains only XML and images and points to code copied into a per-user directory named by the DLL hash. Upgrades avoid overwriting loaded DLLs. Commands validate local supported selections, preserve Unicode and special characters, and split large selections into bounded Windows command lines.

Unsigned MSIX packages cannot declare executable activations: even with all DLLs/EXEs outside the archive, `Add-AppxPackage -AllowUnsigned` rejects this manifest with `0x80073D2B`. Elevation does not solve that restriction. Normal builds bundle a signed sparse package and Frame's public self-signed code-signing certificate. Settings explains machine-wide trust and requests explicit confirmation before UAC. A native helper, pinned to the bundled certificate's SHA-256, accepts only trust/revoke actions on the adjacent certificate and changes only LocalMachine Trusted People. It cannot import a root/CA or caller-provided certificate, execute a script, or register an app as administrator. After trust succeeds, the original non-elevated user registers the package; this also works when a standard user supplies a different administrator account to UAC. Declining confirmation or UAC leaves existing menus unchanged. Revocation needs separate consent and removes this user's actions only after successful certificate removal. Uninstalling or removing menu actions preserves shared trust for other users.

The installer checkbox remains checked by default. If certificate approval is needed, interactive installation asks separately, defaults to No, then opens UAC for the pinned helper. Silent installation never imports a certificate or opens elevation for it. Developer Mode remains an optional fallback when already enabled; Frame never changes it. Signature/public-certificate/native-helper hashes are verified at build and packaging time. Private signing keys stay in ignored `.local/windows-shell-signing` and are never packaged. See [the native component guide](../native/windows-shell/README.md) for signing, key retention, expiry and revocation.

For publicly trusted distribution, use a CA-signed shell package through `FRAME_WINDOWS_SHELL_PUBLISHER` and `FRAME_WINDOWS_SHELL_PACKAGE`. Windows validates it normally, and the pinned self-signed trust controls are disabled for custom packages. Signing the NSIS executable alone does not sign the shell MSIX.

Uninstall checks that each command still belongs to that installation before deleting only its Frame verb key. This protects an action registered by a newer installation at another path. Installer hooks refresh the shell association cache. Packaged and development builds can also install/remove actions from Settings using a narrow, trusted main-process API. Status checks read both actual registry verbs and the primary package, launch ownership, and native file hashes, detect incomplete installations, and offer repair. Removal unregisters only Frame’s recorded package and cleans up managed component directories where Explorer has released its DLL. Removal also updates the preference so upgrades respect the opt-out. Development commands include the Electron executable and the absolute project directory; `pnpm desktop` builds the renderer so cold launches work without Vite. Windows registration uses Windows PowerShell with paths passed as JSON through stdin; paths are never interpolated into scripts.

On macOS, Frame does not declare media document types or register file associations. Installing Frame leaves the existing default media apps alone. Settings and the packaged app’s Frame menu install/remove two per-user `.workflow` services under `~/Library/Services`. Each workflow is generated with the current installed executable's path; Automator passes selected files directly to it. The workflow does not resolve the app using AppleScript, which can start the editor before a conversion request. Starting the executable also forwards workflow arguments to a running instance; plain `open --args` would lose those arguments when the app was already open. Frame refreshes previously installed legacy workflows when it starts. Reinstall the Quick Actions from Settings after moving Frame. Users may need to enable the actions in System Settings. If an older Frame installation became the default media app, choose the desired app in Finder → Get Info → Open with → Change All; Frame cannot infer the previous default. Removing the `.app` does not uninstall user services; remove the Quick Actions from Frame first.

On Linux, Settings and the optional CLI installer write executable Dolphin service-menu entries into the user data directory (`XDG_DATA_HOME`, or `~/.local/share`), including the older KDE 5 directory. `%F` preserves separate file arguments, the executable is quoted using Desktop Entry escaping, and actions are limited to local media. An AppImage registers its persistent `APPIMAGE` path instead of the temporary mounted executable. Remove the entries before deleting or moving the application. Nautilus and other file managers are outside this integration.

The disposable Windows CI runner disables Developer Mode, verifies rejection of a modified certificate, explicitly trusts the pinned certificate for the test, and revokes it during cleanup. This setup is confined to the workflow and isolated installer test. Windows CI installs the actual NSIS artifact into a temporary path, checks all registry commands, invokes classic shell actions on a mixed selection and, on supported Windows builds, activates the registered COM classes to check selection filtering and invoke both workflows, runs installed launch and settings tests, checks primary-component repair, silent opt-out/opt-in and remembered opt-out on upgrades, and verifies registry and package uninstall cleanup. The portable Electron tests also exercise cold starts, subsequent process launches, minimized-window restoration, queued imports during an active job, and draft preservation. Convert actions route to a separate frameless window with its own media session and operation lock; tests exercise collapsed progress, expansion, cancellation, retry, successful automatic closure, and isolation from an existing editor.

For Windows package-open failures, run `pnpm verify:windows-shell` from the checkout. This read-only diagnostic prints the absolute path and SHA-256, then asks Windows' native Appx reader to read the manifest and package identity and reports the Windows Authenticode signature status. `NotTrusted` can mean the certificate has not been approved; `HashMismatch` or `NotSigned` fails the diagnostic. Manifest acceptance alone does not prove Windows can deploy a package. It also checks existing desktop staging against the committed package; after pulling shell-package updates, close Frame, stop the dev process, restart `pnpm desktop`, and choose **Repair actions**. To validate a particular package, run `powershell.exe -NoProfile -File scripts/validate-windows-shell.ps1 -Package C:\path\FrameShell.msix`. The command never changes certificate trust, Windows policy, or package registration. Windows CI runs the native reader before packaging, and the setup tests verify that it rejects an invalid ZIP.

## Signing

Windows application installers are unsigned by default. Mac apps use the explicit ad-hoc identity `-`; the bundled Windows shell MSIX is signed with Frame’s self-signed certificate. For publicly trusted Mac downloads, replace `mac.identity` with a **Developer ID Application** identity and configure Electron Builder's Apple certificate and notarization credentials. Apple Developer membership and notarization are required for that trust; ad-hoc signing cannot replace them. Do not commit private signing keys, PFX files, passwords, API keys, or developer credentials. Public verification certificates may be committed. Local packaging never publishes; CI publishes validated installers separately.

### GitHub Actions shell signing

In the repository's **Settings → Secrets and variables → Actions**, add these two repository secrets using the complete PEM file contents, including the `BEGIN`/`END` lines. No base64 encoding is needed.

| Secret                                | File                                           |
| ------------------------------------- | ---------------------------------------------- |
| `FRAME_WINDOWS_SHELL_PRIVATE_KEY_PEM` | `.local/windows-shell-signing/private-key.pem` |
| `FRAME_WINDOWS_SHELL_CERTIFICATE_PEM` | `.local/windows-shell-signing/certificate.pem` |

These files currently live in the cloud workspace where the signing pair was created; Git does not copy them to other checkouts. The key must be unencrypted RSA (at least 2048 bits), and the certificate must be its matching, currently valid, non-CA `CN=Frame` code-signing certificate. Reuse the existing pair to preserve users' certificate trust. The workflow rejects an incomplete pair, malformed credentials, or mismatched/expired certificates rather than generating replacements.

The **Validate and package** workflow signs on pushes to `master` and manual runs selecting `master`. Pull requests and other branches receive no signing secrets and use the committed signed package. With neither secret configured, `master` also uses that committed package. Trigger **Actions → Validate and package → Run workflow** after adding both secrets.

The Ubuntu `windows-shell` job builds SHA-256-pinned osslsigncode 2.14 and Microsoft's MSIX SDK, uses Microsoft's package writer, signs and verifies the sparse package, and cross-compiles all native components with MinGW, including the helper's certificate pin. CI keeps the identity's major/minor version and sets its build/revision to `GITHUB_RUN_NUMBER.GITHUB_RUN_ATTEMPT`; these counters must fit 1–65535. This avoids publishing different package contents under the same version. Public signature metadata and source/binary fingerprints are regenerated together and verified before the Windows packaging job downloads them.

Private files use restrictive permissions in `$RUNNER_TEMP/frame-shell-signing` and are deleted by an `always()` cleanup step before artifact upload. The `frame-windows-shell` artifact contains only an explicit list of native binaries, the signed MSIX, public certificate, identity, and integrity metadata. The Windows installer includes those public assets; private PEM files never enter the artifact or installer. CI does not commit generated artifacts or modify GitHub Secrets. Its signing covers the shell MSIX; the NSIS executable and macOS app still need their separate release signing configuration.

## Third-party notices

The media binaries are distributed under their respective upstream licenses, not merely their npm wrapper licenses. The included builds enable GPL components (including x264); WebAssembly core 0.12.10 is GPL-2.0-or-later, and the current Linux native binaries are GPL-3.0. Platform builds may differ; retain the matching vendor notices and corresponding-source information when distributing artifacts.

The asset-preparation script copies the native FFmpeg vendor license/README and generates a notice listing the installed FFmpeg/FFprobe versions, package versions, source projects, and binary providers. Desktop packages include these in `resources/notices`; the web build includes `notices/`. Upstream corresponding source and build instructions are available from:

- https://github.com/eugeneware/ffmpeg-static (binary build/release selection)
- https://github.com/SavageCore/node-ffprobe-installer (FFprobe platform selection)
- https://www.johnvansickle.com/ffmpeg/ (Linux static builds and source archives)
- https://ffmpeg.org/download.html (FFmpeg source releases)
- https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v0.12.10 (WebAssembly build instructions)

Preserve the sources/build instructions that correspond to the exact shipped binaries when preparing a public release. The project intentionally does not invent a license for the application owner's code.

## Library and font attribution

Asset preparation copies upstream license files for React, React DOM, Scheduler, Lucide, fflate and Public Sans into `public/notices/`, alongside license texts for the WebAssembly wrapper/core and FFprobe installer. DejaVu notices remain in `public/fonts/LICENSE.txt`. The generated `LIBRARIES.txt` lists installed versions and attribution locations. Web builds serve these resources from `notices/`; desktop packages include them under `resources/notices/`. Maintain the supplemental texts in [vendor/licenses](../vendor/licenses/README.md) when updating packages whose npm archives omit license files.

## Publishing versions

### Desktop update checks

**Settings → Updates** checks the latest full GitHub release by default; enable **Include prereleases** to use preview builds. Installed builds check shortly after startup and every six hours while running. Turn off **Check for updates automatically** to use manual checks only. Development checkouts offer manual checks but do not poll automatically.

Frame selects an installer matching the current OS and architecture. Downloads start only when the user chooses **Download update**, stream to a temporary file, and are verified against the release's `SHA256SUMS.txt` before becoming available. Cancellation or checksum failure removes the temporary file. **Open installer** and **Show download** verify the file again. The downloaded installer lives under Frame's user-data directory in `updates/<release-tag>/`; Frame never replaces the running app automatically. Save work before using the Windows installer; on macOS open the DMG and replace Frame in Applications, and on Linux replace the AppImage. These downloads retain the signing and notarization limits described above.

CI embeds the exact release tag in each desktop package, so previews compare by build number, a full release supersedes previews of the same version, and a lower release is never offered as an update. Unsupported architectures display an unavailable control and link to releases. On the web, update controls are disabled; a full release redeploys the hosted app.

### Release workflow

Use **Actions → Validate and package → Run workflow** on `master`. Choose `release` for a full release (`v1.0.0`) or `prerelease` for a preview (`v1.0.0-build.N`). The optional version input accepts a numeric version such as `1.0.0`; leave it blank to continue the current line. All four installers are built with that version and published only after validation passes. Full releases cannot overwrite an existing release.

Every master push creates a prerelease. After full release `1.0.0`, these builds use `1.0.1-build.N` until the next full release or a manually selected newer version. The release history persists the version line, so a prerelease does not increment the patch on each push. Selecting a full release does not change the signing or notarization requirements above.

Only full releases deploy GitHub Pages. The publishing workflow calls the Pages workflow directly with the published tag; it builds and tests that exact release before deploying. This works with GitHub's Actions token, which does not trigger a second workflow through a generated release event.
