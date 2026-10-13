import { afterAll, beforeAll, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ffmpegPath, probeFile } from '../electron/native';
import { defaultSettings, type MediaAsset, type FormatId } from '../src/core/types';
import {
  readImageMetadata,
  defaultImageMetadata,
  parseImageMetadata,
} from '../src/core/image-metadata';
import { writeImageMetadata } from '../src/core/image-metadata-export';
import { buildExportArgs } from '../src/core/export-plan';
import { createProject, parseProject } from '../src/core/project';
const exec = promisify(execFile);
let dir: string, asset: MediaAsset, input: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'frame-metadata-'));
  input = join(dir, 'photo.png');
  await exec(ffmpegPath(), [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc=size=64x48',
    '-frames:v',
    '1',
    '-threads',
    '1',
    input,
  ]);
  asset = {
    ...(await probeFile(input)),
    id: 'photo',
    name: 'photo.png',
    previewUrl: '',
    imageMetadata: {
      author: 'Photographer',
      copyright: 'Copyright 2026',
      description: 'Test photo',
      camera: 'Frame Camera',
      model: 'Model A',
      lens: '35 mm',
      taken: '2026:10:13 12:00:00',
      exposure: 0.005,
      aperture: 2.8,
      iso: 400,
      focalLength: 35,
      latitude: 51.123456,
      longitude: -0.654321,
    },
  };
});
afterAll(async () => rm(dir, { recursive: true, force: true }));
const pixels = async (path: string) =>
  (
    await exec(
      ffmpegPath(),
      [
        '-v',
        'error',
        '-i',
        path,
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
    )
  ).stdout;
it.each(['jpeg', 'png', 'webp', 'tiff'] as FormatId[])(
  'writes credits, camera and optional location without changing %s pixels',
  async (format) => {
    const path = join(dir, `out.${format}`),
      edit = {
        ...defaultSettings(asset),
        format,
        imageMetadata: { ...defaultImageMetadata(), keepLocation: true },
      };
    await exec(ffmpegPath(), buildExportArgs(asset, edit, input, path));
    const original = await readFile(path),
      before = await pixels(path),
      output = writeImageMetadata(original, asset, edit);
    await writeFile(path, output);
    expect(await pixels(path)).toEqual(before);
    const tags = await readImageMetadata(output);
    expect(tags.author).toBe('Photographer');
    expect(tags.copyright).toBe('Copyright 2026');
    expect(tags.model).toBe('Model A');
    expect(tags.aperture).toBeCloseTo(2.8);
    expect(tags.latitude).toBeCloseTo(51.123456);
    expect(tags.longitude).toBeCloseTo(-0.654321);
    const stripped = writeImageMetadata(output, asset, { ...edit, keepMetadata: false });
    await writeFile(path, stripped);
    expect(await pixels(path)).toEqual(before);
    expect(await readImageMetadata(stripped)).toEqual({});
    expect(new TextDecoder().decode(stripped)).not.toContain('Photographer');
    expect(new TextDecoder().decode(stripped)).not.toContain('Frame Camera');
  },
);
it('excludes GPS by default and allows removing credits while adding others', async () => {
  const bytes = await readFile(input),
    edit = {
      ...defaultSettings(asset),
      imageMetadata: { ...defaultImageMetadata(), author: '', copyright: 'New rights' },
    },
    tags = await readImageMetadata(writeImageMetadata(bytes, asset, edit));
  expect(tags.latitude).toBeUndefined();
  expect(tags.longitude).toBeUndefined();
  expect(tags.author).toBeUndefined();
  expect(tags.copyright).toBe('New rights');
  expect(tags.camera).toBe('Frame Camera');
  const noCamera = await readImageMetadata(
    writeImageMetadata(bytes, asset, {
      ...edit,
      imageMetadata: { ...edit.imageMetadata, keepCamera: false },
    }),
  );
  expect(noCamera.camera).toBeUndefined();
  expect(
    parseProject(createProject('Credits', [asset], () => edit, asset.id)).sources[0].edit
      .imageMetadata,
  ).toEqual(edit.imageMetadata);
});
it('validates portable metadata and strips unsupported fields', () => {
  expect(() =>
    parseImageMetadata({ ...defaultImageMetadata(), author: 'a'.repeat(2001) }),
  ).toThrow();
  expect(() => parseImageMetadata({ ...defaultImageMetadata(), keepLocation: 'yes' })).toThrow();
  expect(() => parseImageMetadata({ ...defaultImageMetadata(), author: '\0evil' })).toThrow();
  expect(parseImageMetadata({ ...defaultImageMetadata(), arbitrary: 'ignored' })).toEqual(
    defaultImageMetadata(),
  );
});

it('keeps non-ASCII credits readable', async () => {
  const bytes = await readFile(input),
    edit = {
      ...defaultSettings(asset),
      imageMetadata: { ...defaultImageMetadata(), author: 'Jörg — 東京' },
    };
  expect((await readImageMetadata(writeImageMetadata(bytes, asset, edit))).author).toBe(
    'Jörg — 東京',
  );
});
