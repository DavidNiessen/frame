import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ffmpegPath, probeFile } from '../electron/native';
import {
  curveSamples,
  curvesFilter,
  defaultCurves,
  imageHistogram,
  parseCurves,
} from '../src/core/curves';
import { defaultSettings } from '../src/core/types';
import { buildExportArgs } from '../src/core/export-plan';
import { addTimelineEffect } from '../src/core/timeline-effects';
import { needsEffectPreview } from '../src/core/effect-preview';
it('validates ordered points and interpolates a neutral diagonal', () => {
  expect(curvesFilter()).toEqual([]);
  expect(curveSamples(defaultCurves().master, 3)).toEqual([0, 0.5, 1]);
  expect(() =>
    parseCurves({
      ...defaultCurves(),
      red: [
        { x: 0, y: 0 },
        { x: 0.5, y: 0.8 },
        { x: 0.5, y: 0.9 },
        { x: 1, y: 1 },
      ],
    }),
  ).toThrow();
  expect(() =>
    parseCurves({
      ...defaultCurves(),
      red: [
        { x: 0, y: 0 },
        { x: 1, y: Infinity },
      ],
    }),
  ).toThrow();
});
it('weights histograms by alpha and ignores invisible RGB', () => {
  const h = imageHistogram(new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0]));
  expect(h.red[255]).toBe(1);
  expect(h.green[255]).toBeCloseTo(128 / 255);
  expect(h.blue[255]).toBe(0);
  expect(h.luminance.reduce((s, n) => s + n, 0)).toBeCloseTo(1 + 128 / 255);
});
it('changes real image pixels, keeps alpha and exports timed video curves', async () => {
  const exec = promisify(execFile),
    dir = await mkdtemp(join(tmpdir(), 'frame-curves-'));
  try {
    const source = join(dir, 'source.png'),
      output = join(dir, 'curved.png');
    await exec(ffmpegPath(), [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=gray@0.5:s=32x24,format=rgba',
      '-frames:v',
      '1',
      '-threads',
      '1',
      source,
    ]);
    const asset = { ...(await probeFile(source)), id: 'image', name: 'source.png', previewUrl: '' },
      curves = {
        ...defaultCurves(),
        master: [
          { x: 0, y: 0 },
          { x: 0.5, y: 0.8 },
          { x: 1, y: 1 },
        ],
      };
    const edit = { ...defaultSettings(asset), curves };
    await exec(ffmpegPath(), buildExportArgs(asset, edit, source, output));
    const result = await exec(
      ffmpegPath(),
      [
        '-v',
        'error',
        '-i',
        output,
        '-vf',
        'scale=1:1',
        '-frames:v',
        '1',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgba',
        '-threads',
        '1',
        '-',
      ],
      { encoding: 'buffer' },
    );
    expect(result.stdout[0]).toBeGreaterThan(195);
    expect(result.stdout[3]).toBeGreaterThanOrEqual(126);
    expect(result.stdout[3]).toBeLessThanOrEqual(128);
    const video = { ...asset, kind: 'video' as const },
      recipe = defaultSettings(video),
      patch = addTimelineEffect(recipe, video, 'curves');
    patch.effectInstances![0].settings.curves = curves;
    const timeline = { ...recipe, ...patch };
    expect(needsEffectPreview(timeline)).toBe(true);
    await exec(ffmpegPath(), buildExportArgs(video, timeline, source, join(dir, 'curved.mp4')));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
