import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import ffprobe from '@ffprobe-installer/ffprobe';
import { ffmpegPath } from '../../electron/native';
const exec = promisify(execFile);

test('exports a full-HD MP4 to GIF without buffering the entire decoded movie', async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const input = info.outputPath('hd.mp4');
  await exec(ffmpegPath()!, [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=s=1920x1080:r=15:d=20',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '28',
    '-threads',
    '2',
    input,
  ]);
  await page.goto('/');
  const bytes = (await readFile(input)).toString('base64');
  const result = await page.evaluate(async (encoded) => {
    const enginePath = '/src/engines/browser.ts';
    const { createBrowserEngine } = (await import(
      /* @vite-ignore */ enginePath
    )) as typeof import('../../src/engines/browser');
    const typesPath = '/src/core/types.ts';
    const { defaultSettings } = (await import(
      /* @vite-ignore */ typesPath
    )) as typeof import('../../src/core/types');
    const engine = createBrowserEngine();
    const raw = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
    const imported = await engine.importFiles([new File([raw], 'hd.mp4', { type: 'video/mp4' })]);
    if (!imported.assets.length) throw new Error(JSON.stringify(imported.issues));
    const asset = imported.assets[0];
    try {
      const output = await engine.export(
        asset,
        { ...defaultSettings(asset), format: 'gif' },
        () => {},
      );
      if (!output?.url) throw new Error('Browser export did not return a downloadable file.');
      const response = await fetch(output.url);
      const blob = await response.arrayBuffer();
      return {
        url: output.url,
        size: output.size,
        header: String.fromCharCode(...new Uint8Array(blob).slice(0, 6)),
      };
    } finally {
      engine.cancel();
      await engine.release(asset);
    }
  }, bytes);
  expect(result.size).toBeGreaterThan(1000);
  expect(result.header).toMatch(/^GIF8[79]a$/);
  const pending = page.waitForEvent('download');
  await page.evaluate((url) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = 'hd.gif';
    link.click();
  }, result.url);
  const output = info.outputPath('hd.gif');
  await (await pending).saveAs(output);
  const { stdout } = await exec(ffprobe.path, [
    '-v',
    'error',
    '-show_format',
    '-show_streams',
    '-of',
    'json',
    output,
  ]);
  const decoded = JSON.parse(stdout);
  expect(decoded.streams[0]).toMatchObject({ codec_name: 'gif', width: 1920, height: 1080 });
  expect(Number(decoded.format.duration)).toBeCloseTo(20, 1);
});
