import { afterEach, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceStore } from '../electron/workspace-store';
import { createProject } from '../src/core/project';
import { defaultSettings, type MediaAsset } from '../src/core/types';
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'frame-workspace-'));
  directories.push(directory);
  const path = join(directory, 'song.wav');
  await writeFile(path, 'temporary audio');
  const asset: MediaAsset = {
    id: 'song',
    name: 'song.wav',
    size: (await stat(path)).size,
    duration: 5,
    hasAudio: true,
    kind: 'audio',
    previewUrl: 'media://asset/song',
  };
  const document = {
    version: 1 as const,
    savedAt: Date.now(),
    project: createProject('Songs', [asset], () => defaultSettings(asset), asset.id),
  };
  return {
    directory,
    path,
    asset,
    document,
    store: new WorkspaceStore(join(directory, 'workspace')),
  };
}
it('retains downloaded media independently of the temporary source and prunes only owned copies', async () => {
  const { path, asset, document, store } = await fixture();
  await store.save(document, [{ path, asset, temporary: true }]);
  const first = (await store.read())!;
  expect(first.sources[0].path).not.toBe(path);
  await store.save(document, [{ path, asset, temporary: true }]);
  expect((await store.read())!.sources[0].path).toBe(first.sources[0].path);
  await rm(path);
  expect(await readFile(first.sources[0].path, 'utf8')).toBe('temporary audio');
  await store.save(document, [{ path: first.sources[0].path, asset, temporary: false }]);
  await store.clear();
  expect(await store.read()).toBeNull();
  await expect(stat(first.sources[0].path)).rejects.toThrow();
});
it('serializes clear after an in-flight save without deleting the original media', async () => {
  const { path, asset, document, store } = await fixture();
  const save = store.save(document, [{ path, asset, temporary: false }]);
  const clear = store.clear();
  await Promise.all([save, clear]);
  expect(await store.read()).toBeNull();
  expect(await readFile(path, 'utf8')).toBe('temporary audio');
});
it('keeps the previous checkpoint when a source can no longer be saved', async () => {
  const { path, asset, document, store } = await fixture();
  await store.save(document, [{ path, asset, temporary: false }]);
  await expect(
    store.save({ ...document, savedAt: document.savedAt + 1000 }, [
      { path: join(path, 'missing.wav'), asset, temporary: false },
    ]),
  ).rejects.toThrow();
  expect((await store.read())!.document.savedAt).toBe(document.savedAt);
});
