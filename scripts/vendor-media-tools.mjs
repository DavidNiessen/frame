import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { fileDigest, downloadTool } from './download-tool.mjs';
const require = createRequire(import.meta.url);
const ffmpeg = require('./ffmpeg-tools.json'),
  youtube = require('./youtube-tools.json');
const root = resolve('vendor/media-tools');
const files = [];
for (const target of Object.values(ffmpeg.platforms)) {
  for (const file of [target, ...Object.values(target.notices)])
    files.push({
      ...file,
      directory: 'ffmpeg',
      url: `${ffmpeg.baseUrl}/${ffmpeg.release}/${file.asset}`,
    });
}
for (const target of Object.values(youtube.platforms))
  files.push({
    ...target,
    directory: 'yt-dlp',
    url: `https://github.com/yt-dlp/yt-dlp/releases/download/${youtube.version}/${target.asset}`,
  });
for (const [asset, sha256] of Object.entries(youtube.notices))
  files.push({
    asset,
    sha256,
    directory: 'yt-dlp',
    url: `https://raw.githubusercontent.com/yt-dlp/yt-dlp/${youtube.version}/${asset}`,
  });
const unique = [
  ...new Map(files.map((file) => [`${file.directory}/${file.asset}`, file])).values(),
];
// Explicit maintainer command only; install/build never download media tools.
for (let index = 0; index < unique.length; index += 3) {
  await Promise.all(
    unique.slice(index, index + 3).map(async (file) => {
      const directory = join(root, file.directory);
      await mkdir(directory, { recursive: true });
      const path = join(directory, file.asset);
      if ((await fileDigest(path).catch(() => '')) === file.sha256) return;
      console.log(`Vendoring ${file.asset}…`);
      await downloadTool(file.url, path, file.sha256);
    }),
  );
}
console.log(`Verified ${unique.length} vendored media tool files.`);
