import { ensureElectronRuntime } from './electron-runtime.mjs';

try {
  const executable = await ensureElectronRuntime();
  console.log(`Electron runtime ready: ${executable}`);
} catch (error) {
  console.error(`Desktop setup failed: ${error.message}`);
  process.exitCode = 1;
}
