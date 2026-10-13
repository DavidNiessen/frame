import { expect, it } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { trackMotion, simplifyMotion, trackedAnimation } from '../src/core/motion-tracking';
import {
  analysisDataArgs,
  parseAnalysisOptions,
  trackingDimensions,
} from '../src/core/analysis-data';
import { movingSubjectFrames } from './helpers/moving-subject';
import { ffmpegPath, probeFile, runFfmpeg } from '../electron/native';
import { defaultSettings } from '../src/core/types';
import { resourcePaths } from '../src/core/resources';
import { insertedMediaLayer } from '../src/core/media-layers';
const exec = promisify(execFile);
it('follows textured motion, simplifies a linear path and stops when the subject disappears', () => {
  const bytes = movingSubjectFrames(),
    result = trackMotion(bytes, 160, 90, 8, { x: 20, y: 20, width: 20, height: 20 });
  expect(result.points).toHaveLength(24);
  expect(result.points.at(-1)!.x).toBe(76);
  expect(result.lostAt).toBeUndefined();
  expect(simplifyMotion(result.points)).toHaveLength(2);
  bytes.fill(24, 12 * 160 * 90);
  const lost = trackMotion(bytes, 160, 90, 8, { x: 20, y: 20, width: 20, height: 20 });
  expect(lost.lostAt).toBe(1.5);
  expect(lost.points).toHaveLength(12);
  expect(() =>
    trackMotion(new Uint8Array(160 * 90), 160, 90, 8, { x: 10, y: 10, width: 20, height: 20 }),
  ).toThrow(/uniform/);
});
it('extracts the edited output sequence and applies portable X/Y keyframes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'frame-motion-'));
  try {
    const input = join(dir, 'input.mp4'),
      raw = join(dir, 'source.raw'),
      output = join(dir, 'frames.raw');
    await writeFile(raw, movingSubjectFrames());
    await exec(ffmpegPath(), [
      '-v',
      'error',
      '-y',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'gray',
      '-s',
      '160x90',
      '-r',
      '8',
      '-i',
      raw,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      input,
    ]);
    const asset = { ...(await probeFile(input)), id: 'base', name: 'moving.mp4', previewUrl: '' },
      edit = defaultSettings(asset),
      dims = trackingDimensions(asset, edit);
    await runFfmpeg(
      analysisDataArgs(
        asset,
        edit,
        { kind: 'tracking', start: 0, end: 3 },
        input,
        output,
        resourcePaths(),
      ),
      3,
      () => {},
    ).done;
    const result = trackMotion(new Uint8Array(await readFile(output)), dims.width, dims.height, 8, {
      x: 40,
      y: 40,
      width: 40,
      height: 40,
    });
    expect(result.points).toHaveLength(24);
    const layer = insertedMediaLayer(edit, asset, asset, 0),
      animation = trackedAnimation(layer, result, 0, dims.width, dims.height);
    expect(animation.x!.keys.at(-1)!.value - animation.x!.keys[0].value).toBeCloseTo(28.75, 0);
    edit.start = 0.5;
    edit.end = 2.5;
    await runFfmpeg(
      analysisDataArgs(
        asset,
        edit,
        { kind: 'tracking', start: 0, end: 2 },
        input,
        output,
        resourcePaths(),
      ),
      2,
      () => {},
    ).done;
    expect((await readFile(output)).length).toBe(16 * dims.width * dims.height);
    expect(() => parseAnalysisOptions({ kind: 'tracking', start: 0, end: 31 }, edit)).toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
