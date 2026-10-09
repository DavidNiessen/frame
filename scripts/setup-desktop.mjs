import { ensureElectronRuntime } from './electron-runtime.mjs';
import { ensureYoutubeTools } from './prepare-youtube.mjs';
import { ensureFfmpeg } from './prepare-ffmpeg.mjs';

try {
  const executable = await ensureElectronRuntime();
  await ensureFfmpeg();
  await ensureYoutubeTools();
  console.log(`Electron runtime ready: ${executable}`);
} catch (error) {
  console.error(`Desktop setup failed: ${error.message}`);
  process.exitCode = 1;
}
