import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);

function packageDirectory() {
  try {
    return dirname(require.resolve('electron/package.json'));
  } catch {
    throw new Error('Electron is not installed. Run "pnpm install" or "npm ci", including development dependencies.');
  }
}

export function electronExecutable(directory, env = process.env) {
  const pathFile = join(directory, 'path.txt');
  const executable = existsSync(pathFile) ? readFileSync(pathFile, 'utf8').trim() : '';
  if (!executable && !env.ELECTRON_OVERRIDE_DIST_PATH) {
    throw new Error(`Electron's runtime path file is missing or empty: ${pathFile}`);
  }
  // Match Electron's custom-runtime resolution, including its fallback filename.
  const binary = join(env.ELECTRON_OVERRIDE_DIST_PATH || join(directory, 'dist'), executable || 'electron');
  if (!statSync(binary).isFile()) throw new Error(`Electron's executable is not a file: ${binary}`);
  return binary;
}

export async function ensureElectronRuntime({ directory = packageDirectory(), env = process.env } = {}) {
  try {
    return electronExecutable(directory, env);
  } catch {
    // A successful dependency lifecycle does not guarantee that a binary exists.
  }
  if (env.ELECTRON_OVERRIDE_DIST_PATH) {
    throw new Error('ELECTRON_OVERRIDE_DIST_PATH points to an incomplete Electron runtime. Fix that directory or unset the variable, then run "pnpm run setup:desktop" (or "npm run setup:desktop").');
  }
  if (env.ELECTRON_SKIP_BINARY_DOWNLOAD) {
    throw new Error('Electron is missing and ELECTRON_SKIP_BINARY_DOWNLOAD is set. Electron\'s installer exits successfully without downloading whenever this variable is nonempty, even "0" or "false". Unset it (Windows Command Prompt: "set ELECTRON_SKIP_BINARY_DOWNLOAD="), then run "pnpm run setup:desktop" (or "npm run setup:desktop").');
  }
  console.log('Electron runtime is missing. Running Electron\'s installer to download or restore it…');
  await new Promise((resolve, reject) => {
    const installer = spawn(process.execPath, [join(directory, 'install.js')], { env, stdio: 'inherit' });
    installer.once('error', reject);
    installer.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Electron installation failed (${signal || `exit ${code}`}). Check the installer output above for download, proxy, or filesystem errors.`));
    });
  });
  try {
    return electronExecutable(directory, env);
  } catch (cause) {
    throw new Error(`Electron's installer finished but its runtime is still missing. Runtime check failed: ${cause.message}.`, { cause });
  }
}
