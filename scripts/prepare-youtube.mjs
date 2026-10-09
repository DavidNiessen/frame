import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepareToolFile } from './media-tool-files.mjs';
const require = createRequire(import.meta.url);
const manifest = require('./youtube-tools.json');

export function youtubeToolTarget(platform = process.platform, arch = process.arch) {
  const target = manifest.platforms[`${platform}-${arch}`];
  if (!target) throw new Error(`Portable YouTube imports are not available for ${platform}/${arch}.`);
  return { ...target, name: platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp' };
}
export async function ensureYoutubeTools({ directory = resolve('build/media-tools'), vendorDirectory = resolve('vendor/media-tools/yt-dlp') } = {}) {
  const target = youtubeToolTarget();
  await mkdir(directory, { recursive: true });
  const files = [
    { name: target.name, asset: target.asset, hash: target.sha256 },
    ...Object.entries(manifest.notices).map(([name, hash]) => ({ name, asset: name, hash })),
  ];
  for (const { name, asset, hash } of files) await prepareToolFile({ source: join(vendorDirectory, asset), destination: join(directory, name), sha256: hash, executable: name === target.name });
  const binary = join(directory, target.name);
  const version = execFileSync(binary, ['--version'], { encoding: 'utf8', timeout: 15000, env: { ...process.env, PATH: '' } }).trim();
  if (version !== manifest.version) throw new Error('The portable YouTube downloader version does not match its manifest.');
  const runtime = require('electron');
  const nodeVersion = execFileSync(runtime, ['--experimental-permission', '--no-warnings', '-p', 'process.versions.node'], { encoding: 'utf8', timeout: 10000, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PATH: '' } }).trim();
  if (Number(nodeVersion.split('.')[0]) < 22) throw new Error('YouTube imports require Electron with Node 22 or newer.');
  await writeFile(join(directory, 'TOOLS.txt'), `Frame portable YouTube tools\nyt-dlp ${version}; bundled Electron Node ${nodeVersion}\nOfficial release: https://github.com/yt-dlp/yt-dlp/releases/tag/${version}\nSource and build instructions: https://github.com/yt-dlp/yt-dlp/tree/${version}\nThe standalone executable includes GPLv3+ components; retain LICENSE and THIRD_PARTY_LICENSES.txt and provide corresponding sources when redistributing.\n`);
  return binary;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await ensureYoutubeTools(); }
  catch (error) { console.error(`YouTube tool preparation failed: ${error.message}. Restore the vendor files from Git, then retry pnpm setup:desktop.`); process.exitCode = 1; }
}
