import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('imports, analyses, layers and exports Blob inputs without full-file copies', async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.goto('/');
  const encoded = (await readFile('tests/fixtures/sample.mp4')).toString('base64');
  const result = await page.evaluate(async (encoded) => {
    const engineUrl = '/src/engines/browser.ts',
      typesUrl = '/src/core/types.ts',
      layersUrl = '/src/core/media-layers.ts';
    const { createBrowserEngine } = await import(/* @vite-ignore */ engineUrl);
    const { defaultSettings } = await import(/* @vite-ignore */ typesUrl);
    const { insertedMediaLayer } = await import(/* @vite-ignore */ layersUrl);
    const engine = createBrowserEngine(),
      progress = () => {};
    const inputFiles = ['main.mp4', 'overlay.mp4'].map((name) => {
      const file = new File([Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))], name);
      file.arrayBuffer = () => Promise.reject(new Error('Unexpected full-file copy'));
      return file;
    });
    const report = await engine.importFiles(inputFiles);
    if (report.assets.length !== 2) throw new Error(JSON.stringify(report.issues));
    const [asset, overlay] = report.assets,
      edit = { ...defaultSettings(asset), end: 1 };
    const peaks = await engine.waveform(asset, progress);
    const frame = await engine.previewFrame(asset, edit, 0.5, progress);
    const audio = await engine.previewAudio(asset, edit, progress);
    const speech = await engine.analysisData(
      asset,
      edit,
      { kind: 'speech', start: 0, end: 1 },
      progress,
    );
    const visual = insertedMediaLayer(edit, asset, overlay, 0);
    const mix = {
      id: 'sound',
      sourceId: overlay.id,
      source: overlay,
      start: 0,
      end: 1,
      sourceStart: 0,
      sourceEnd: 1,
      volume: 0.5,
      fadeIn: 0,
      fadeOut: 0,
      loop: false,
      muted: false,
    };
    const rendered = await engine.effectPreview(
      asset,
      { ...edit, mediaLayers: [visual], audioLayers: [mix] },
      progress,
    );
    const exported = await engine.export(
      asset,
      { ...edit, mediaLayers: [visual], audioLayers: [mix] },
      progress,
    );
    const gif = await engine.export(
      asset,
      { ...edit, format: 'gif', fps: 8, gifWidth: 160 },
      progress,
    );
    const merged = await engine.merge(
      [
        { asset, edit },
        { asset: overlay, edit },
      ],
      edit,
      progress,
    );
    const extracted = await engine.extractAudio(asset, progress);
    const appended = await engine.appendVideo(asset, overlay, progress);
    const output = {
      peaks: peaks.length,
      speech: speech.byteLength,
      rendered: rendered.size,
      exported: exported.size,
      gif: gif.size,
      merged: merged.size,
      extracted: extracted.kind,
      appended: appended.duration,
    };
    for (const url of [frame, audio, exported.url, gif.url, merged.url]) URL.revokeObjectURL(url);
    await engine.releaseProxy(rendered.id);
    for (const source of [asset, overlay, extracted, appended]) await engine.release(source);
    return output;
  }, encoded);
  expect(result.peaks).toBeGreaterThan(0);
  expect(result.speech).toBeGreaterThan(16000);
  for (const size of [result.rendered, result.exported, result.gif, result.merged])
    expect(size).toBeGreaterThan(100);
  expect(result.extracted).toBe('audio');
  expect(result.appended).toBeCloseTo(12, 1);
});

test('seeks directly into reordered preview excerpts with a separate audio mix', async ({
  page,
}) => {
  await page.goto('/');
  const encoded = (await readFile('tests/fixtures/sample.mp4')).toString('base64');
  const result = await page.evaluate(async (encoded) => {
    const engineUrl = '/src/engines/browser.ts',
      typesUrl = '/src/core/types.ts';
    const { createBrowserEngine } = await import(/* @vite-ignore */ engineUrl);
    const { defaultSettings } = await import(/* @vite-ignore */ typesUrl);
    const engine = createBrowserEngine(),
      progress = () => {};
    const file = new File([Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))], 'source.mp4');
    const asset = (await engine.importFiles([file])).assets[0];
    const audio = {
      id: 'audio',
      sourceId: asset.id,
      source: asset,
      start: 0,
      end: 3,
      sourceStart: 0,
      sourceEnd: 3,
      volume: 0.2,
      fadeIn: 0,
      fadeOut: 0,
      muted: false,
      loop: false,
    };
    const edit = {
      ...defaultSettings(asset),
      audioLayers: [audio],
      clips: [
        { id: 'late', start: 4, end: 6, effects: { speed: 2 } },
        { id: 'early', start: 0, end: 2, effects: {} },
      ],
    };
    const proxy = await engine.effectPreview(asset, edit, progress);
    const video = document.createElement('video');
    video.src = proxy.url;
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('The preview is not playable.'));
    });
    const result = { size: proxy.size, duration: video.duration };
    video.removeAttribute('src');
    video.load();
    await engine.releaseProxy(proxy.id);
    await engine.release(asset);
    return result;
  }, encoded);
  expect(result.size).toBeGreaterThan(1000);
  expect(result.duration).toBeCloseTo(3, 1);
});
