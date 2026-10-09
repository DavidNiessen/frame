# Portable media tools

This directory contains the actual portable FFmpeg and yt-dlp binaries used by Frame. No Git LFS or external binary download is required after cloning. Setup selects the host's OS/architecture and prepares executable files under the ignored `build/media-tools/` directory; desktop packaging includes only that target's files.

- **FFmpeg:** compressed upstream release assets from [ffmpeg-static b6.1.1](https://github.com/eugeneware/ffmpeg-static/releases/tag/b6.1.1), for Windows x64, macOS Intel/Apple Silicon, and Linux x64/ARM64. Original provider licenses and build/source information accompany each binary. Release tags identify the provider bundle; individual platform build versions are recorded in their READMEs.
- **yt-dlp:** standalone assets from [official release 2026.08.19](https://github.com/yt-dlp/yt-dlp/releases/tag/2026.08.19), including Windows x64/x86/ARM64, macOS universal, and Linux x64/ARM64. The macOS asset is shared between Intel and Apple Silicon. Preserve `LICENSE` and `THIRD_PARTY_LICENSES.txt` with redistributions.

Pinned upstream asset names and SHA-256 checksums are in `scripts/ffmpeg-tools.json` and `scripts/youtube-tools.json`. FFmpeg archives and extracted executables are both verified. `.gitattributes` preserves notice bytes on Windows.

To intentionally refresh vendor files, first review and update the pinned manifests against upstream release checksums, then run `npm run vendor:media-tools`. This is the only media-tool command that downloads from GitHub. Commit the changed binaries, manifests, and licenses together. Keep each stored file below GitHub's 100 MiB file limit.

FFprobe, Electron, and the browser WebAssembly engine remain npm dependencies. The FFprobe package contains its native binary; vendoring FFmpeg and yt-dlp does not make the entire dependency installation offline.
