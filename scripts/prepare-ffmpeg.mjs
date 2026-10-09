import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepareToolFile } from './media-tool-files.mjs';
const require = createRequire(import.meta.url), manifest = require('./ffmpeg-tools.json');

export function ffmpegToolTarget(platform = process.platform, arch = process.arch) {
  const target = manifest.platforms[`${platform}-${arch}`];
  if (!target) throw new Error(`Portable FFmpeg is not available for ${platform}/${arch}.`);
  return { ...target, name: platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg' };
}
export async function ensureFfmpeg({ directory = resolve('build/media-tools'), vendorDirectory = resolve('vendor/media-tools/ffmpeg') } = {}) {
  const target = ffmpegToolTarget(), binary = join(directory, target.name);
  await prepareToolFile({ source: join(vendorDirectory, target.asset), destination: binary, sha256: target.sha256, binarySha256: target.binarySha256, gzip: true, executable: true });
  for (const [name, file] of Object.entries(target.notices)) await prepareToolFile({ source: join(vendorDirectory, file.asset), destination: `${binary}.${name}`, sha256: file.sha256 });
  execFileSync(binary, ['-version'], { timeout: 10000, stdio: 'ignore', env: { ...process.env, PATH: '' } });
  return binary;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await ensureFfmpeg(); }
  catch (error) { console.error(`FFmpeg preparation failed: ${error.message}`); process.exitCode = 1; }
}
