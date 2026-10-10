import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StableWatchFiles, parseWatchDraft } from '../src/core/watch-folders';
import { builtInPresets } from '../src/core/presets';
import { WatchRunner, validateWatchPaths, validateWatchNetwork } from '../electron/watch-runner';
describe('watch folders', () => {
  it('waits for stable files, records successes across restart, and retries failures explicitly', () => {
    const files = new StableWatchFiles(); expect(files.observe('song', '100:1', 0)).toBe(false); expect(files.observe('song', '200:2', 2000)).toBe(false); expect(files.observe('song', '200:2', 3999)).toBe(false); expect(files.observe('song', '200:2', 4000)).toBe(true);
    files.finish('song', '200:2'); const restored = new StableWatchFiles(new Map(Object.entries(files.receipts()))); expect(restored.observe('song', '200:2', 6000)).toBe(false);
    expect(restored.observe('song', '300:3', 6000)).toBe(false); expect(restored.observe('song', '300:3', 8000)).toBe(true); restored.fail('song', '300:3'); expect(restored.observe('song', '300:3', 10000)).toBe(false); restored.retry(); expect(restored.observe('song', '300:3', 10000)).toBe(false); expect(restored.observe('song', '300:3', 12000)).toBe(true);
    restored.reconcile(new Set()); expect(restored.receipts()).toEqual({});
  });
  it('skips initial files, handles new files with old timestamps, and rejects recursive output', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'frame-watch-unit-'))); const input = join(root, 'input'), output = join(root, 'output');
    try {
      await mkdir(input); await mkdir(output); await writeFile(join(input, 'old.mp3'), 'old'); await mkdir(join(input, 'converted'));
      await expect(validateWatchPaths(input, join(input, 'converted'))).rejects.toThrow('outside'); await expect(validateWatchPaths(input, input)).rejects.toThrow('outside'); await expect(validateWatchPaths(input, root)).rejects.toThrow('contain');
      const draft = parseWatchDraft({ name: 'Music', input, output, settings: builtInPresets[5].settings, keepFolders: true, recursive: true, includeExisting: false, namingTemplate: '{name}' });
      const watch = { ...draft, id: 'music', enabled: true }, encoded: string[] = [];
      const runner = new WatchRunner(async work => { encoded.push(work.path); return join(output, 'new.flac'); }, async () => {});
      await runner.initialize(watch); runner.watches.push(watch); await runner.tick(0); await writeFile(join(input, 'new.mp3'), 'first'); await runner.tick(1000); await writeFile(join(input, 'new.mp3'), 'second'); await runner.tick(3000); expect(encoded).toEqual([]); await runner.tick(5000); expect(encoded).toEqual([join(input, 'new.mp3')]); await runner.tick(7000); expect(encoded).toHaveLength(1); expect(runner.status().activity[0].status).toBe('done'); runner.stop();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
it('settles cancellation and persists a conversion that completed as shutdown started', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'frame-watch-shutdown-')));
  try {
    const input = join(root, 'input'), output = join(root, 'output'); await mkdir(input); await mkdir(output); await writeFile(join(input, 'song.mp3'), 'complete');
    const watch = { name: 'Music', input, output, settings: builtInPresets[5].settings, keepFolders: false, recursive: false, includeExisting: true, namingTemplate: '{name}', id: 'music', enabled: true };
    let release: (() => void) | undefined, saved = false; const runner = new WatchRunner(async () => { await new Promise<void>(resolve => { release = resolve; }); return join(output, 'song.flac'); }, async () => { saved = true; });
    await runner.initialize(watch); runner.watches.push(watch); await runner.tick(0); const running = runner.tick(2000);
    // Yield until the deferred encoder starts, then stop and await durable completion.
    await new Promise<void>(resolve => { const timer = setInterval(() => { if (release) { clearInterval(timer); resolve(); } }, 1); });
    runner.stop(); const settled = runner.settled(); release!(); await settled; await running; expect(saved).toBe(true); expect(runner.status().activity[0].status).toBe('done'); expect(runner.receipts().music[join(input, 'song.mp3')]).toBeDefined();
  } finally { await rm(root, { recursive: true, force: true }); }
});

it('rejects output paths that can feed another watch, including paused watches', () => {
  const root = join(tmpdir(), 'frame-watch-network'), first = { input: join(root, 'originals'), output: join(root, 'converted') }, second = { input: join(root, 'inbox'), output: join(root, 'ready') };
  expect(() => validateWatchNetwork([first, second])).not.toThrow();
  expect(() => validateWatchNetwork([first, { ...second, input: first.output }])).toThrow('re-enter');
  expect(() => validateWatchNetwork([first, { ...second, input: join(first.output, 'albums') }])).toThrow('re-enter');
  expect(() => validateWatchNetwork([first, { ...second, output: join(first.input, 'nested') }])).toThrow('re-enter');
});
