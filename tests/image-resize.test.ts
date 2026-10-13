import { afterAll, beforeAll, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ffmpegPath, probeFile } from '../electron/native';
import {
  imageResizeGeometry,
  defaultImageResize,
  parseImageResize,
} from '../src/core/image-resize';
import { conversionSettings } from '../src/core/conversion';
import { defaultSettings, type MediaAsset } from '../src/core/types';
import { buildExportArgs } from '../src/core/export-plan';
import { outputSettings, parseOutputSettings } from '../src/core/presets';
const exec = promisify(execFile);
let directory: string, input: string, asset: MediaAsset;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'frame-resize-'));
  input = join(directory, 'source.png');
  await exec(ffmpegPath(), [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=120x80',
    '-frames:v',
    '1',
    '-threads',
    '1',
    input,
  ]);
  asset = { ...(await probeFile(input)), id: 'image', name: 'source.png', previewUrl: '' };
});
afterAll(async () => rm(directory, { recursive: true, force: true }));
it('fits portrait and landscape images independently without enlargement', () => {
  const size = { ...defaultImageResize(), mode: 'long-edge' as const, width: 1600 };
  expect(imageResizeGeometry(4000, 3000, size)).toMatchObject({ width: 1600, height: 1200 });
  expect(imageResizeGeometry(3000, 4000, size)).toMatchObject({ width: 1200, height: 1600 });
  expect(imageResizeGeometry(800, 600, size)).toMatchObject({ width: 800, height: 600 });
  expect(imageResizeGeometry(800, 600, { ...size, withoutEnlargement: false })).toMatchObject({
    width: 1600,
    height: 1200,
  });
});
it('supports percent, fit, fill and stretch and rejects oversize outputs', () => {
  expect(
    imageResizeGeometry(120, 80, { ...defaultImageResize(), mode: 'percentage', percent: 50 }),
  ).toMatchObject({ width: 60, height: 40 });
  expect(
    imageResizeGeometry(120, 80, {
      ...defaultImageResize(),
      mode: 'dimensions',
      width: 40,
      height: 40,
      fit: 'contain',
    }),
  ).toMatchObject({ width: 40, height: 27 });
  expect(
    imageResizeGeometry(120, 80, {
      ...defaultImageResize(),
      mode: 'dimensions',
      width: 40,
      height: 40,
      fit: 'cover',
    }),
  ).toMatchObject({ width: 40, height: 40, fit: 'cover' });
  expect(() =>
    imageResizeGeometry(8000, 8000, {
      ...defaultImageResize(),
      mode: 'percentage',
      percent: 400,
      withoutEnlargement: false,
    }),
  ).toThrow('exceeds');
  expect(() => parseImageResize({ ...defaultImageResize(), width: Infinity })).toThrow();
});
it.each(['contain', 'cover', 'stretch'] as const)(
  'exports actual %s dimensions and retains output presets',
  async (fit) => {
    const output = {
      ...outputSettings(defaultSettings(asset)),
      imageResize: {
        ...defaultImageResize(),
        mode: 'dimensions' as const,
        width: 40,
        height: 40,
        fit,
      },
    };
    expect(parseOutputSettings(output).imageResize).toEqual(output.imageResize);
    const edit = conversionSettings(asset, output),
      destination = join(directory, `size-${fit}.png`);
    await exec(ffmpegPath(), buildExportArgs(asset, edit, input, destination));
    const actual = await probeFile(destination);
    expect({ width: actual.width, height: actual.height }).toEqual(
      fit === 'contain' ? { width: 40, height: 27 } : { width: 40, height: 40 },
    );
  },
);
