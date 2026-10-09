# Windows 11 File Explorer integration

The native DLL implements two `IExplorerCommand` COM classes, registered through a sparse MSIX identity package. Windows 11 can show **Edit in Frame** and **Convert in Frame** in its primary context menu, grouped by Windows under Frame when appropriate. The independent classic verbs stay under **Show more options** and remain available on Windows 10.

Both commands validate the complete selection: local supported media only, at most 2,000 files, no folders or virtual items. Menu construction performs no media analysis. Invocation uses `CreateProcessW` with Windows argument quoting, never a shell. Large selections are split into bounded command lines and grouped by the existing single-instance launch inbox.

Setup copies the native DLL and launcher into a per-user directory named by the DLL hash. The sparse package contains only manifest and image files and points to this external directory. For development registration, the manifest and images are also copied to that persistent directory. Updates avoid overwriting a DLL still loaded by Explorer. Settings checks package registration, launch ownership, and the copied binaries; removal unregisters only Frame's recorded package and leaves commands owned by another installation alone. Explorer may need a restart to refresh its menu cache.

Current native binaries target x64 Windows 11. They are statically linked, about 530 KiB combined, and verified against `binaries.json` before packaging. Source fingerprints normalize CRLF to LF, including existing Windows checkouts created before the Git attributes were added; actual source edits and binary icon changes still require a rebuild. Ordinary `pnpm desktop` and packaging use these checked-in binaries and do not require a compiler.

To rebuild after changing the native sources or supported extensions:

```sh
# Point to a MinGW-w64 toolchain root containing bin/ and x86_64-w64-mingw32/.
FRAME_MINGW_ROOT=/path/to/toolchain/usr npm run build:windows-shell
```

Commit source changes, both binaries, and the updated `binaries.json` together. The current binaries were built with Debian trixie's MinGW-w64 GCC 14 toolchain. The build script also supports a Windows MinGW-w64 toolchain through `FRAME_MINGW_ROOT`.

Unsigned MSIX packages cannot declare executable activations, including this shell application's activation, even when all native code is external. `Add-AppxPackage -AllowUnsigned` fails with `0x80073D2B`; administrator access does not solve this restriction. Frame uses the normal `CN=Frame` publisher instead of the reserved unsigned OID.

For local development or unsigned local installers, enable **Developer Mode** in Windows Settings, run `pnpm desktop`, and choose **Settings → File-manager actions → Repair actions**. Frame reads the existing policy and uses `Add-AppxPackage -Register` with the persistent manifest and external directory. It never enables Developer Mode or changes certificate trust. Registration files are checked for missing/corrupt content and restored on repair. Removing actions unregisters the development package before cleanup.

Distributed installers require a shell MSIX signed by a certificate Windows trusts. Supply `FRAME_WINDOWS_SHELL_PUBLISHER` with the certificate subject and `FRAME_WINDOWS_SHELL_PACKAGE` with a matching signed sparse package; the build verifies its manifest and signature presence, and Windows validates certificate trust during normal deployment. Prepare the unsigned sparse package first with the same publisher, sign `build/generated/shell-actions/windows/FrameShell.msix` using Windows SDK SignTool, copy it to a separate path, set `FRAME_WINDOWS_SHELL_PACKAGE`, then rebuild/package. This changes only the shell component identity, not Frame's media binaries or installer signing. Do not commit signing keys or automatically trust a self-signed certificate.

If neither a signed package nor existing Developer Mode is available, Settings explains the required setup and retains classic entries. Restart File Explorer if it has not refreshed after repair.

References:

- https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/integrate-packaged-app-with-file-explorer
- https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/grant-identity-to-nonpackaged-apps
- https://learn.microsoft.com/en-us/windows/msix/package/unsigned-package
