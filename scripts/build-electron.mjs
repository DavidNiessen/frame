import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
await build({
  entryPoints: ['electron/main.ts', 'electron/preload.ts'],
  outdir: 'dist-electron', outExtension: { '.js': '.cjs' },
  bundle: true, platform: 'node', format: 'cjs', target: 'node22',
  external: ['electron', 'ffmpeg-static', '@ffprobe-installer/ffprobe'], sourcemap: true,
});
await build({ entryPoints: ['scripts/prepare-shell-actions.ts'], outfile: 'build/generated/prepare-shell-actions.cjs', bundle: true, platform: 'node', format: 'cjs', target: 'node22' });
execFileSync(process.execPath, ['build/generated/prepare-shell-actions.cjs'], { stdio: 'inherit' });
