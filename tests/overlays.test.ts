import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ffmpegPath } from '../electron/native';
import { buildExportArgs } from '../src/core/export-plan';
import { resourcePaths } from '../src/core/resources';
import { textAss, parseOverlays } from '../src/core/overlays';
import { defaultSettings, type MediaAsset } from '../src/core/types';
const ffmpeg = ffmpegPath();
const exec = promisify(execFile);
it('renders literal text and a real image watermark without interpreting text as filters', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-overlays-'));
  try {
    const paths = { ...resourcePaths(join(directory, 'clip')), fonts: resolve('public/fonts') };
    const asset: MediaAsset = { id: 'clip', name: 'clip.mp4', size: 1, kind: 'video', duration: 6, width: 640, height: 360, hasAudio: true, previewUrl: '' };
    const edit = defaultSettings(asset); edit.end = .5; edit.overlays.text = "Literal %{n}: 'quotes' [labels]";
    await writeFile(paths.text, textAss(edit, asset));
    await exec(ffmpeg!, ['-y', '-f', 'lavfi', '-i', 'color=red:s=64x64', '-frames:v', '1', '-threads', '1', paths.image]);
    edit.overlays.image = `data:image/png;base64,${(await readFile(paths.image)).toString('base64')}`;
    const output = join(directory, 'marked.mp4'); await exec(ffmpeg!, buildExportArgs(asset, edit, resolve('public/sample.mp4'), output, paths));
    const { stdout } = await exec(ffmpeg!, ['-v', 'error', '-ss', '0.1', '-i', output, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: 'buffer', maxBuffer: 2_000_000 });
    const offset = (Math.round(360 * .8) * 640 + Math.round(640 * .9)) * 3;
    expect(stdout[offset]).toBeGreaterThan(200); expect(stdout[offset + 1]).toBeLessThan(50);
    expect(() => parseOverlays({ ...edit.overlays, image: 'https://example.com/image.png' })).toThrow();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
