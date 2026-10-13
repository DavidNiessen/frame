import { expect, test } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cameraDng, cameraHeic } from '../helpers/camera-images';
let fixtures: { name: string; bytes: string }[];
test.beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'frame-camera-web-'));
  try {
    fixtures = [
      { name: 'camera.dng', bytes: Buffer.from(cameraDng()).toString('base64') },
      { name: 'phone.heic', bytes: Buffer.from(await cameraHeic(dir)).toString('base64') },
    ];
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('browser imports RAW and HEIC, exports lossless working pixels, and recovers original files', async ({
  page,
}) => {
  await page.goto('/');
  const result = await page.evaluate(async (fixtures) => {
    const enginePath = '/src/engines/browser.ts',
      typesPath = '/src/core/types.ts',
      projectPath = '/src/core/project.ts',
      storagePath = '/src/storage/autosave.ts';
    const { createBrowserEngine } = (await import(
        /* @vite-ignore */ enginePath
      )) as typeof import('../../src/engines/browser'),
      { defaultSettings } = (await import(
        /* @vite-ignore */ typesPath
      )) as typeof import('../../src/core/types'),
      { createProject, parseProject } = (await import(
        /* @vite-ignore */ projectPath
      )) as typeof import('../../src/core/project'),
      { readRetainedWorkspace } = (await import(
        /* @vite-ignore */ storagePath
      )) as typeof import('../../src/storage/autosave'),
      engine = createBrowserEngine();
    const files = fixtures.map(
        (f) => new File([Uint8Array.from(atob(f.bytes), (c) => c.charCodeAt(0))], f.name),
      ),
      report = await engine.importFiles(files),
      edits = new Map(report.assets.map((a) => [a.id, defaultSettings(a)])),
      output = [];
    if (report.issues.length) return { issues: report.issues };
    for (const asset of report.assets) {
      const out = await engine.export(asset, edits.get(asset.id)!, () => {});
      if (!out) throw new Error('No export output.');
      output.push({
        name: asset.name,
        kind: asset.kind,
        size: out.size,
        sourceSize: asset.size,
        width: asset.width,
        height: asset.height,
      });
      URL.revokeObjectURL(out.url!);
    }
    const project = createProject(
        'Camera images',
        report.assets,
        (id) => edits.get(id)!,
        report.assets[0].id,
      ),
      document = { version: 1 as const, savedAt: Date.now(), project: parseProject(project) };
    await engine.saveWorkspace!(
      document,
      report.assets.map((a) => a.id),
    );
    const saved = await readRetainedWorkspace();
    for (const asset of report.assets) await engine.release(asset);
    const restored = await engine.recoverWorkspace!(() => {});
    await engine.discardWorkspace!();
    if (!restored || !saved) throw new Error('No recovered workspace.');
    for (const asset of restored.assets) await engine.release(asset);
    return {
      issues: report.issues,
      output,
      saved: saved.media.map((f) => {
        if (!f) throw new Error('Missing retained original.');
        return { name: f.name, size: f.blob.size };
      }),
      restored: restored.assets.map((a) => a.name),
      recoveryIssues: restored.issues,
    };
  }, fixtures);
  expect(result.issues).toEqual([]);
  expect(result.recoveryIssues).toEqual([]);
  expect(result.restored).toEqual(['camera.dng', 'phone.heic']);
  for (const item of result.output!) {
    expect(item.kind).toBe('image');
    expect(item.width).toBe(64);
    expect(item.height).toBe(48);
    expect(item.size).toBeGreaterThan(100);
    expect(result.saved?.find((f) => f.name === item.name)?.size).toBe(item.sourceSize);
  }
});
