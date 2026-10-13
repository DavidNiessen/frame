import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ensureYoutubeTools } from './prepare-youtube.mjs';
import { ensureFfmpeg } from './prepare-ffmpeg.mjs';
import { prepareWindowsShell } from './prepare-windows-shell.mjs';
await ensureFfmpeg();
await ensureYoutubeTools();
await prepareWindowsShell();
await build({
  entryPoints: [
    'electron/main.ts',
    'electron/preload.ts',
    'electron/update-worker.ts',
    'electron/image-decode-worker.ts',
    'electron/speech-worker.ts',
  ],
  outdir: 'dist-electron',
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron', '@ffprobe-installer/ffprobe', 'onnxruntime-node'],
  // Audio inference does not need Sharp/libvips or another image decoding stack.
  alias: { sharp: resolve('electron/speech-image-backend.ts') },
  sourcemap: true,
});
await copyFile('electron/update-windows.ps1', 'dist-electron/update-windows.ps1');
await build({
  entryPoints: ['scripts/prepare-shell-actions.ts'],
  outfile: 'build/generated/prepare-shell-actions.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
});
execFileSync(process.execPath, ['build/generated/prepare-shell-actions.cjs'], { stdio: 'inherit' });
