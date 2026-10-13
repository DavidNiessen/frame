import { afterAll, beforeAll, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ffmpegPath, probeFile } from '../electron/native';
import { defaultSettings, type EditSettings, type MediaAsset } from '../src/core/types';
import { defaultVisual } from '../src/core/visual-settings';
import { buildExportArgs } from '../src/core/export-plan';
import {
  changeImageLayer,
  imageLayerRows,
  moveImageLayer,
  parseImageLayers,
} from '../src/core/image-layers';
import { createProject, parseProject } from '../src/core/project';
const exec = promisify(execFile);
let directory: string, input: string, asset: MediaAsset;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'frame-layer-test-'));
  input = join(directory, 'source.png');
  await exec(ffmpegPath(), [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=0x804020:s=32x24',
    '-frames:v',
    '1',
    '-threads',
    '1',
    input,
  ]);
  asset = { ...(await probeFile(input)), id: 'image', name: 'source.png', previewUrl: '' };
});
afterAll(async () => rm(directory, { recursive: true, force: true }));
async function render(edit: ReturnType<typeof defaultSettings>) {
  const output = join(directory, 'output.png');
  await exec(ffmpegPath(), buildExportArgs(asset, edit, input, output));
  const { stdout } = await exec(
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
  return [...stdout];
}
it('reorders real adjustment pixels and bypasses hidden layers', async () => {
  let edit: EditSettings = {
    ...defaultSettings(asset),
    effectInstances: [
      {
        id: 'light',
        effect: 'exposure' as const,
        settings: { visual: { ...defaultVisual(), exposure: 1 } },
      },
      {
        id: 'negative',
        effect: 'invert' as const,
        settings: { visual: { ...defaultVisual(), invert: 1 } },
      },
    ],
  };
  const before = await render(edit);
  edit = { ...edit, ...moveImageLayer(asset, edit, 'instance:negative', -1) };
  const after = await render(edit);
  expect(Math.abs(after[0] - before[0])).toBeGreaterThan(80);
  edit = { ...edit, ...changeImageLayer(edit, 'instance:negative', { hidden: true }) };
  const hidden = await render(edit);
  expect(hidden[0]).toBeGreaterThan(220);
  expect(hidden[1]).toBeLessThan(hidden[0]);
});
it('groups preserve project state and hide/lock their children', async () => {
  const edit = {
    ...defaultSettings(asset),
    visual: { ...defaultVisual(), invert: 1 },
    imageLayers: {
      order: ['primary:invert'],
      entries: { 'primary:invert': { name: 'Negative', group: 'group1' } },
      groups: [{ id: 'group1', name: 'Look', hidden: true, locked: true, collapsed: true }],
    },
  };
  const restored = parseProject(createProject('Layers', [asset], () => edit, asset.id)).sources[0]
    .edit;
  expect(restored.imageLayers).toEqual(edit.imageLayers);
  expect(imageLayerRows(asset, restored)[0]).toMatchObject({ hidden: true, locked: true });
  const pixels = await render(restored);
  expect(pixels[0]).toBeGreaterThan(110);
  expect(pixels[0]).toBeLessThan(145);
  expect(moveImageLayer(asset, restored, 'primary:invert', 1)).toEqual({});
});
it('rejects duplicate IDs and invalid group references', () => {
  expect(() =>
    parseImageLayers({ order: ['instance:a', 'instance:a'], entries: {}, groups: [] }),
  ).toThrow();
  expect(() =>
    parseImageLayers({ order: [], entries: { 'instance:a': { group: 'missing' } }, groups: [] }),
  ).toThrow();
});
