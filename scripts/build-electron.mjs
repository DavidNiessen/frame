import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFile } from 'node:fs/promises';
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
  ],
  outdir: 'dist-electron',
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron', '@ffprobe-installer/ffprobe'],
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
