import { expect, test } from '@playwright/test';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ffmpegPath } from '../../electron/native';
import { videoFilters } from '../../src/core/filters';
import { resourcePaths } from '../../src/core/resources';
import { defaultSettings, type EditSettings, type MediaAsset } from '../../src/core/types';
import { defaultVisual, type VisualSettings } from '../../src/core/visual-settings';
import { defaultCurves } from '../../src/core/curves';

const exec = promisify(execFile);
const width = 256,
  height = 144;
const asset: MediaAsset = {
  id: 'parity',
  name: 'parity.y4m',
  size: 1,
  kind: 'video',
  width,
  height,
  hasAudio: false,
  duration: 1,
  previewUrl: '',
};
const base = defaultSettings(asset);
const visual = (settings: Partial<VisualSettings>): EditSettings => ({
  ...base,
  visual: { ...defaultVisual(), ...settings },
});
const invert = 'LUT_3D_SIZE 2\n1 1 1\n0 1 1\n1 0 1\n0 0 1\n1 1 0\n0 1 0\n1 0 0\n0 0 0\n';
const cases: [string, EditSettings][] = [
  ['color', { ...base, color: { ...base.color, brightness: 0.1, contrast: 1.3, saturation: 1.4 } }],
  ['temperature', { ...base, color: { ...base.color, temperature: 0.6 } }],
  ['lut', { ...base, color: { ...base.color, lut: invert, lutName: 'invert.cube' } }],
  [
    'curves',
    {
      ...base,
      curves: {
        ...defaultCurves(),
        master: [
          { x: 0, y: 0 },
          { x: 0.3, y: 0.2 },
          { x: 0.7, y: 0.85 },
          { x: 1, y: 1 },
        ],
        blue: [
          { x: 0, y: 0.1 },
          { x: 1, y: 0.9 },
        ],
      },
    },
  ],
  ['exposure', visual({ exposure: 0.7 })],
  ['gamma', visual({ gamma: 1.6 })],
  ['shadows', visual({ shadows: 0.5, highlights: -0.5 })],
  ['vibrance', visual({ vibrance: 0.6 })],
  ['hue', visual({ hue: 60 })],
  ['tint', visual({ tint: 0.5 })],
  ['vignette', visual({ vignette: 0.6 })],
  ['blur', visual({ blur: 3 })],
  ['sharpen', visual({ sharpen: 1 })],
  ['grayscale', visual({ grayscale: 1 })],
  ['sepia', visual({ sepia: 0.8 })],
  ['invert', visual({ invert: 1 })],
  ['pixelate', visual({ pixelate: 8 })],
  ['posterize', visual({ posterize: 6 })],
];

test('real-time grading matches the export filters', async ({ page }) => {
  test.setTimeout(120000);
  const directory = await mkdtemp(join(tmpdir(), 'frame-grade-parity-'));
  try {
    const source = join(directory, 'source.y4m');
    // A smooth limited-range 4:2:0 frame, like decoded camera footage.
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
      '-pix_fmt',
      'yuv420p',
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
    for (const [name, edit] of cases) {
      const paths = { ...resourcePaths(), lut: join(directory, `${name}.cube`) };
      if (edit.color.lut) await writeFile(paths.lut, edit.color.lut);
      expected[name] = [...(await rgb(videoFilters(asset, edit, paths)))];
    }
    await page.goto('/');
    const errors = await page.evaluate(
      async ({ input, cases, expected, width, height }) => {
        const engine = '/src/engines/grade-renderer.ts',
          core = '/src/core/realtime-grade.ts';
        const { GradeRenderer } = await import(/* @vite-ignore */ engine);
        const { gradeAt, gradePasses } = await import(/* @vite-ignore */ core);
        const source = document.createElement('canvas');
        source.width = width;
        source.height = height;
        const pixels = new ImageData(width, height);
        for (let i = 0; i < width * height; i++) {
          pixels.data.set(input.slice(i * 3, i * 3 + 3), i * 4);
          pixels.data[i * 4 + 3] = 255;
        }
        source.getContext('2d')!.putImageData(pixels, 0, 0);
        const output = document.createElement('canvas');
        output.width = width;
        output.height = height;
        const renderer = new GradeRenderer(output),
          reader = document.createElement('canvas').getContext('2d')!;
        reader.canvas.width = width;
        reader.canvas.height = height;
        const result: Record<string, number> = {};
        for (const [name, edit] of cases) {
          const { steps, crop } = gradeAt(edit, 0);
          renderer.render(source, gradePasses(steps), { width, height }, crop);
          reader.drawImage(output, 0, 0);
          const data = reader.getImageData(0, 0, width, height).data;
          let sum = 0;
          for (let i = 0; i < width * height; i++)
            for (let c = 0; c < 3; c++)
              sum += Math.abs(data[i * 4 + c] - expected[name][i * 3 + c]);
          result[name] = sum / (width * height * 3);
        }
        renderer.dispose(true);
        return result;
      },
      {
        input: [...input],
        cases,
        expected,
        width,
        height,
      },
    );
    // Mean absolute error per channel, in 8-bit levels. Grain, sketch and emboss are approximations.
    for (const [name] of cases) expect(errors[name], name).toBeLessThan(3);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
