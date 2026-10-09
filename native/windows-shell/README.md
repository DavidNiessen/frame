# Windows 11 File Explorer integration

The native DLL implements two `IExplorerCommand` COM classes, registered through a sparse MSIX identity package. Windows 11 can show **Edit in Frame** and **Convert in Frame** in its primary context menu, grouped by Windows under Frame when appropriate. The independent classic verbs stay under **Show more options** and remain available on Windows 10.

Both commands validate the complete selection: local supported media only, at most 2,000 files, no folders or virtual items. Menu construction performs no media analysis. Invocation uses `CreateProcessW` with Windows argument quoting, never a shell. Large selections are split into bounded command lines and grouped by the existing single-instance launch inbox.

Setup copies the native DLL and launcher into a per-user directory named by the DLL hash. The sparse package contains only manifest and image files and points to this external directory. For development registration, the manifest and images are also copied to that persistent directory. Updates avoid overwriting a DLL still loaded by Explorer. Settings checks package registration, launch ownership, and the copied binaries; removal unregisters only Frame's recorded package and leaves commands owned by another installation alone. Explorer may need a restart to refresh its menu cache.

Current native binaries target x64 Windows 11. They are statically linked and verified against `binaries.json` before packaging. Source fingerprints normalize CRLF to LF, including existing Windows checkouts created before the Git attributes were added; actual source edits and binary icon changes still require a rebuild. Ordinary `pnpm desktop` and packaging use these checked-in binaries and do not require a compiler.

To rebuild after changing the native sources or supported extensions:

```sh
# Point to a MinGW-w64 toolchain root containing bin/ and x86_64-w64-mingw32/.
FRAME_MINGW_ROOT=/path/to/toolchain/usr npm run build:windows-shell
```

Commit source changes, all three binaries, and the updated `binaries.json` together. The current binaries were built with Debian trixie's MinGW-w64 GCC 14 toolchain. The build script also supports a Windows MinGW-w64 toolchain through `FRAME_MINGW_ROOT`.

Unsigned MSIX packages cannot declare executable activations, including this shell application's activation, even when all native code is external. `Add-AppxPackage -AllowUnsigned` fails with `0x80073D2B`; administrator access does not solve this restriction. Frame uses the normal `CN=Frame` publisher instead of the reserved unsigned OID.

Normal builds copy the committed signed `package/FrameShell.msix` and public `package/Frame.cer`. No SDK, signing key, or signing tool is needed for users. The native certificate helper is pinned at compile time to that certificate's SHA-256 digest. It accepts only `--trust` or `--revoke`, reads only the adjacent `Frame.cer`, and writes only the machine's **Trusted People** store; it never imports a CA/root certificate, runs a script, accepts caller-selected paths, or registers packages as administrator.

In Settings, **Trust certificate and enable menu** shows a confirmation explaining the machine-wide scope, publisher, fingerprint, and expiry, then launches the helper through Windows UAC. Only after trust succeeds does Frame register the signed shell package in the original user's account. Cancellation does not change existing menus. **Remove certificate trust** confirms the shared scope, invokes the same helper for revocation, and removes this user's menu entries after successful revocation. Removing only actions or uninstalling Frame preserves the shared trust; revoke from Settings before uninstalling if desired. The NSIS installer asks separately for certificate consent when its context-menu checkbox is enabled; the default is No, and silent installs never trust automatically.

Developer Mode is optional: if already enabled, local builds can still register a development manifest without trusting the certificate. Frame never changes that policy. Its disposable Windows CI runner disables Developer Mode and explicitly tests the pinned helper and signed package, with certificate cleanup afterwards. Real UAC consent must still be checked on a Windows desktop.

The self-signed certificate currently expires in October 2031; the package is not timestamped. The private RSA key and PEM certificate are stored in ignored `.local/windows-shell-signing` with restrictive permissions. Preserve the private key securely for future signatures; never commit it or include it in app resources. To re-sign as a maintainer with OpenSSL and osslsigncode available:

```sh
FRAME_OSSLSIGNCODE=/path/to/osslsigncode npm run sign:windows-shell
FRAME_MINGW_ROOT=/path/to/toolchain/usr npm run build:windows-shell
```

Commit the signed package, public certificate, signature metadata, and updated native binaries together. Signing verifies all MSIX digests, the signature, ZIP headers, and file checksums before publishing the public artifacts. Package payloads are stored without compression; content-type metadata uses DEFLATE because osslsigncode preserves its ZIP method when rewriting it. Builds repeat the archive checks before staging it. A new certificate requires a new trust approval. The current package was signed with osslsigncode 2.14.

For a publicly trusted release, supply `FRAME_WINDOWS_SHELL_PUBLISHER` and `FRAME_WINDOWS_SHELL_PACKAGE` with a matching signed sparse package. The build verifies the exact manifest and signature presence, and Windows validates trust during normal deployment. Guided self-signed trust is disabled for these custom packages because the helper remains pinned to the bundled Frame certificate. Installer/application signing is independent of shell-package signing.

References:

- https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/integrate-packaged-app-with-file-explorer
- https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/grant-identity-to-nonpackaged-apps
- https://learn.microsoft.com/en-us/windows/msix/package/unsigned-package
