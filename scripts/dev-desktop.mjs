import { spawn } from 'node:child_process';
import { build, createServer } from 'vite';
import { ensureElectronRuntime } from './electron-runtime.mjs';
let electron;
try {
  electron = await ensureElectronRuntime();
} catch (error) {
  console.error(`Desktop startup failed: ${error.message}`);
  process.exit(1);
}
await import('./build-electron.mjs');
// File-manager actions can cold-start this checkout after the development server stops.
await build();
const server = await createServer({ server: { host: '127.0.0.1', port: 5173, strictPort: true } });
await server.listen();
const child = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, FRAME_DEV_URL: 'http://127.0.0.1:5173' } });
child.on('error', async error => {
  console.error(`Electron could not start: ${error.message}. Run "pnpm run setup:desktop" or "npm run setup:desktop" to check its runtime.`);
  await server.close();
  process.exit(1);
});
child.on('exit', async code => { await server.close(); process.exit(code ?? 0); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
