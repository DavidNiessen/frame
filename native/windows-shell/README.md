# Windows 11 File Explorer integration

The native DLL implements two `IExplorerCommand` COM classes, registered through a sparse MSIX identity package. Windows 11 can show **Edit in Frame** and **Convert in Frame** in its primary context menu, grouped by Windows under Frame when appropriate. The independent classic verbs stay under **Show more options** and remain available on Windows 10.

Both commands validate the complete selection: local supported media only, at most 2,000 files, no folders or virtual items. Menu construction performs no media analysis. Invocation uses `CreateProcessW` with Windows argument quoting, never a shell. Large selections are split into bounded command lines and grouped by the existing single-instance launch inbox.

Setup copies the native DLL and launcher into a per-user directory named by the DLL hash. The sparse package contains only manifest and image files and points to this external directory. Updates avoid overwriting a DLL still loaded by Explorer. Settings checks package registration, launch ownership, and the copied binaries; removal unregisters only Frame's recorded package and leaves commands owned by another installation alone. Explorer may need a restart to refresh its menu cache.

Current native binaries target x64 Windows 11. They are statically linked, about 530 KiB combined, and verified against `binaries.json` before packaging. Source fingerprints normalize CRLF to LF, including existing Windows checkouts created before the Git attributes were added; actual source edits and binary icon changes still require a rebuild. Ordinary `pnpm desktop` and packaging use these checked-in binaries and do not require a compiler.

To rebuild after changing the native sources or supported extensions:

```sh
# Point to a MinGW-w64 toolchain root containing bin/ and x86_64-w64-mingw32/.
FRAME_MINGW_ROOT=/path/to/toolchain/usr npm run build:windows-shell
```

Commit source changes, both binaries, and the updated `binaries.json` together. The current binaries were built with Debian trixie's MinGW-w64 GCC 14 toolchain. The build script also supports a Windows MinGW-w64 toolchain through `FRAME_MINGW_ROOT`.

The identity uses Microsoft's reserved unsigned-publisher OID with `Add-AppxPackage -AllowUnsigned`. Windows deployment policies can reject unsigned package registration; the installer retains classic verbs, and Settings reports the primary component as needing repair with the OS error. Frame does not change Developer Mode, certificate trust, or Windows policy. A distributor can supply `FRAME_WINDOWS_SHELL_PUBLISHER` and a matching signed sparse package via `FRAME_WINDOWS_SHELL_PACKAGE`; this changes only the shell component identity, not Frame's media binaries or normal installer.

References:

- https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/integrate-packaged-app-with-file-explorer
- https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/grant-identity-to-nonpackaged-apps
- https://learn.microsoft.com/en-us/windows/msix/package/unsigned-package
