import { cp, mkdir } from 'node:fs/promises';
await mkdir('public/ffmpeg', { recursive: true });
for (const name of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  await cp(`node_modules/@ffmpeg/core/dist/esm/${name}`, `public/ffmpeg/${name}`);
}
