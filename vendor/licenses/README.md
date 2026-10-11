# License texts missing from published npm packages

The build copies dependency-provided license files directly from installed packages. These additional texts cover packages whose npm distributions omit a license file:

- `ffmpeg-wasm.LICENSE`: the MIT license from [ffmpeg.wasm v12.15](https://github.com/ffmpegwasm/ffmpeg.wasm/blob/v12.15/LICENSE), covering the `@ffmpeg/ffmpeg` wrapper.
- `GPL-2.0.txt`: the GNU GPL version 2 text for `@ffmpeg/core` (GPL-2.0-or-later). Source/build references are in `docs/DISTRIBUTION.md` and generated `MEDIA-TOOLS.txt`.
- `LGPL-2.1.txt`: the GNU LGPL version 2.1 text declared by `@ffprobe-installer/ffprobe` 2.1.2. Its source is [node-ffprobe-installer v2.1.2](https://github.com/SavageCore/node-ffprobe-installer/tree/v2.1.2).

The GNU license texts come from the Debian `common-licenses` copies of the standard GNU texts. They do not change or replace the licenses/notices of the actual FFmpeg/FFprobe binaries. Preserve these texts and their attribution when updating dependency versions.
