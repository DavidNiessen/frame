import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { ensureYoutubeTools } from './prepare-youtube.mjs';
import { ensureFfmpeg } from './prepare-ffmpeg.mjs';
await ensureFfmpeg();
await ensureYoutubeTools();
await build({
  entryPoints: ['electron/main.ts', 'electron/preload.ts'],
  outdir: 'dist-electron', outExtension: { '.js': '.cjs' },
  bundle: true, platform: 'node', format: 'cjs', target: 'node22',
  external: ['electron', '@ffprobe-installer/ffprobe'], sourcemap: true,
});
await build({ entryPoints: ['scripts/prepare-shell-actions.ts'], outfile: 'build/generated/prepare-shell-actions.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node22' });
execFileSync(process.execPath, ['build/generated/prepare-shell-actions.cjs'], { stdio: 'inherit' });
