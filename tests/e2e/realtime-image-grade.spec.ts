import { expect, test } from '@playwright/test';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ffmpegPath } from '../../electron/native';
import { videoFilters } from '../../src/core/filters';
import { resourcePaths } from '../../src/core/resources';
import { closeEffect } from '../helpers/effects';
import { defaultSettings, type EditSettings, type MediaAsset } from '../../src/core/types';
import { defaultVisual } from '../../src/core/visual-settings';
import { imageBlendModes, type ImageBlendMode } from '../../src/core/image-compositing';

const exec = promisify(execFile);
const width = 240,
  height = 160;
const asset: MediaAsset = {
  id: 'photo',
  name: 'photo.png',
  size: 1,
  kind: 'image',
  width,
  height,
  hasAudio: false,
  duration: 0,
  previewUrl: '',
};
const base = defaultSettings(asset);
const exposure: EditSettings = {
  ...base,
  visual: { ...defaultVisual(), exposure: 0.8 },
  color: { ...base.color, contrast: 1.3, saturation: 1.3 },
};
const blended = (blend: ImageBlendMode, opacity: number): EditSettings => ({
  ...exposure,
  imageLayers: {
    order: [],
    groups: [],
    entries: { 'primary:exposure': { blend, opacity } },
  },
});
const cases: [string, EditSettings][] = [
  ['adjustments', exposure],
  [
    'crop',
    {
      ...exposure,
      crop: { x: 40, y: 20, width: 120, height: 90 },
      visual: { ...exposure.visual!, vignette: 0.5 },
    },
  ],
  ...imageBlendModes.map((mode): [string, EditSettings] => [
    mode,
    blended(mode, mode === 'normal' ? 0.5 : 0.7),
  ]),
];

test('real-time image layers match the exported composite', async ({ page }) => {
  test.setTimeout(120000);
  const directory = await mkdtemp(join(tmpdir(), 'frame-image-grade-'));
  try {
    const source = join(directory, 'photo.png');
    await exec(ffmpegPath(), [
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      `nullsrc=s=${width}x${height},format=gbrp,geq=r='X':g='Y*255/${height - 1}':b='255-X*0.6'`,
      '-frames:v',
      '1',
      source,
    ]);
    const rgb = async (filters: string[]) =>
      (
        await exec(
          ffmpegPath(),
          [
            '-v',
            'error',
            '-i',
            source,
            '-vf',
            [...filters, 'format=rgb24'].join(','),
            '-frames:v',
            '1',
            '-f',
            'rawvideo',
            '-',
          ],
          { encoding: 'buffer', cwd: directory },
        )
      ).stdout;
    const input = await rgb([]);
    const expected: Record<string, number[]> = {};
    for (const [name, edit] of cases)
      expected[name] = [...(await rgb(videoFilters(asset, edit, resourcePaths())))];
    await page.goto('/');
    const errors = await page.evaluate(
      async ({ input, cases, expected, asset }) => {
        const engine = '/src/engines/grade-renderer.ts',
          core = '/src/core/realtime-grade.ts';
        const { GradeRenderer } = await import(/* @vite-ignore */ engine);
        const { imageGradePlan, gradeLayerPasses } = await import(/* @vite-ignore */ core);
        const { width, height } = asset;
        const source = document.createElement('canvas');
        source.width = width;
        source.height = height;
        const pixels = new ImageData(width, height);
        for (let i = 0; i < width * height; i++) {
          pixels.data.set(input.slice(i * 3, i * 3 + 3), i * 4);
          pixels.data[i * 4 + 3] = 255;
        }
        source.getContext('2d')!.putImageData(pixels, 0, 0);
        const result: Record<string, number | string> = {};
        for (const [name, edit] of cases) {
          const plan = imageGradePlan(asset, edit);
          if (!plan) {
            result[name] = 'unsupported';
            continue;
          }
          const crop = plan.crop ?? { x: 0, y: 0, width, height };
          const output = document.createElement('canvas');
          output.width = crop.width;
          output.height = crop.height;
          const renderer = new GradeRenderer(output, true);
          renderer.render(source, gradeLayerPasses(plan.layers), crop, null, 0, {
            x: crop.x / width,
            y: crop.y / height,
            width: crop.width / width,
            height: crop.height / height,
          });
          const reader = document.createElement('canvas').getContext('2d')!;
          reader.canvas.width = crop.width;
          reader.canvas.height = crop.height;
          reader.drawImage(output, 0, 0);
          const data = reader.getImageData(0, 0, crop.width, crop.height).data,
            count = crop.width * crop.height;
          if (expected[name].length !== count * 3) {
            result[name] = `size ${expected[name].length / 3} vs ${count}`;
            continue;
          }
          let sum = 0;
          for (let i = 0; i < count; i++)
            for (let c = 0; c < 3; c++)
              sum += Math.abs(data[i * 4 + c] - expected[name][i * 3 + c]);
          result[name] = sum / (count * 3);
          renderer.dispose(true);
        }
        return result;
      },
      { input: [...input], cases, expected, asset: { ...asset, width, height } },
    );
    // Mean absolute error per channel, in 8-bit levels.
    for (const [name] of cases) expect(errors[name], name).toBeLessThan(3);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('image adjustments grade live and fall back to rendered composites for objects', async ({
  page,
}) => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-image-live-'));
  try {
    const path = join(directory, 'photo.png');
    await exec(ffmpegPath(), [
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=320x240',
      '-vf',
      'lutrgb=r=val/3:g=val/3:b=val/3',
      '-frames:v',
      '1',
      path,
    ]);
    await page.goto('/');
    const choosing = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Add media', exact: true }).click();
    await (await choosing).setFiles(path);
    await expect(page.getByLabel('Image canvas', { exact: true })).toBeVisible();
    const graded = page.locator('canvas[data-realtime-grade]'),
      frame = page.locator('.image-canvas-frame');
    await expect(graded).toHaveCount(1);
    const brightness = () =>
      graded.evaluate((node: HTMLCanvasElement) => {
        const probe = document.createElement('canvas').getContext('2d')!;
        probe.canvas.width = 16;
        probe.canvas.height = 12;
        probe.drawImage(node, 0, 0, 16, 12);
        return probe
          .getImageData(0, 0, 16, 12)
          .data.reduce((sum, value, index) => sum + (index % 4 === 3 ? 0 : value), 0);
      });
    await expect.poll(brightness).toBeGreaterThan(0);
    const original = await brightness();
    const renderedSource = await frame.locator('img').getAttribute('src');
    await page.getByRole('button', { name: 'Add Exposure', exact: true }).click();
    await page.getByLabel('Exposure value').fill('1');
    await expect.poll(brightness).toBeGreaterThan(original * 1.5);
    // The FFmpeg composite is not re-rendered for adjustment layers.
    await expect(frame).toHaveAttribute('aria-busy', 'false');
    await expect(frame.locator('img')).toHaveAttribute('src', renderedSource!);
    await closeEffect(page);
    await page.getByRole('button', { name: 'Add Text', exact: true }).click();
    await expect(graded).toHaveCount(0);
    await expect(frame.locator('img')).not.toHaveAttribute('src', renderedSource!, {
      timeout: 45000,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
