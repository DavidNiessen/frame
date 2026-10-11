import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { ensureFfmpeg } from './prepare-ffmpeg.mjs';
const require = createRequire(import.meta.url);
await mkdir('public/ffmpeg', { recursive: true });
for (const name of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  await cp(`node_modules/@ffmpeg/core/dist/esm/${name}`, `public/ffmpeg/${name}`);
}
await mkdir('public/notices', { recursive: true });
const native = await ensureFfmpeg();
const probe = require('@ffprobe-installer/ffprobe');
const version = (binary, name) => {
  try {
    if (!binary) throw new Error('No binary is available for this OS and architecture.');
    return execFileSync(binary, ['-version'], { encoding: 'utf8', timeout: 10000 }).split('\n')[0];
  } catch (error) {
    console.error(
      `Asset preparation failed: the bundled ${name} could not run${error.code ? ` (${error.code})` : ''}.`,
    );
    console.error(
      'Restore vendor/media-tools from Git and rerun postinstall. If FFprobe is missing, run pnpm rebuild (or npm ci).',
    );
    process.exit(1);
  }
};
const core = JSON.parse(await readFile('node_modules/@ffmpeg/core/package.json', 'utf8'));
const notice = [
  'Frame — third-party media processing tools',
  '',
  version(native, 'FFmpeg'),
  version(probe.path, 'FFprobe'),
  `WebAssembly: @ffmpeg/core ${core.version} (${core.license})`,
  '',
  'Native FFmpeg provider: https://github.com/eugeneware/ffmpeg-static',
  `FFprobe provider: ${probe.url}`,
  'FFprobe package: https://github.com/SavageCore/node-ffprobe-installer',
  'FFmpeg corresponding source: https://ffmpeg.org/download.html',
  'Linux static build sources: https://www.johnvansickle.com/ffmpeg/',
  'WebAssembly source and build instructions: https://github.com/ffmpegwasm/ffmpeg.wasm/tree/v0.12.10',
  '',
  'Media binaries include GPL components; retain vendor notices and matching sources when redistributing.',
  'Electron and Chromium notices are also included in desktop distributions.',
  '',
].join('\n');
await writeFile('public/notices/MEDIA-TOOLS.txt', notice);
for (const [source, destination] of [
  [`${native}.LICENSE`, 'FFMPEG-LICENSE.txt'],
  [`${native}.README`, 'FFMPEG-README.txt'],
]) {
  await cp(source, `public/notices/${destination}`);
}
