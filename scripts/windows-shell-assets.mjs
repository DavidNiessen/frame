import { execFileSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { shellPackageManifest } from './windows-shell-package.mjs';
export async function shellPackageFiles(identity, root) {
  const assets = join(root, 'Assets');
  await mkdir(assets, { recursive: true });
  const files = { 'AppxManifest.xml': Buffer.from(shellPackageManifest(identity)) };
  const ffmpeg = resolve(
    'build/media-tools',
    process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
  );
  for (const [name, size] of [
    ['StoreLogo.png', 50],
    ['Logo44.png', 44],
    ['Logo150.png', 150],
  ]) {
    const path = join(assets, name);
    execFileSync(
      ffmpeg,
      ['-v', 'error', '-y', '-i', 'build/icon.png', '-vf', `scale=${size}:${size}`, path],
      { timeout: 10000 },
    );
    files[`Assets/${name}`] = await readFile(path);
  }
  return files;
}
