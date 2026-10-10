import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StableWatchFiles, parseWatchDraft } from '../src/core/watch-folders';
import { builtInPresets } from '../src/core/presets';
import { WatchRunner, validateWatchPaths } from '../electron/watch-runner';
describe('watch folders', () => {
  it('waits for stable files, records successes across restart, and retries failures explicitly', () => {
    const files = new StableWatchFiles(); expect(files.observe('song', '100:1', 0)).toBe(false); expect(files.observe('song', '200:2', 2000)).toBe(false); expect(files.observe('song', '200:2', 3999)).toBe(false); expect(files.observe('song', '200:2', 4000)).toBe(true);
    files.finish('song', '200:2'); const restored = new StableWatchFiles(new Map(Object.entries(files.receipts()))); expect(restored.observe('song', '200:2', 6000)).toBe(false);
    expect(restored.observe('song', '300:3', 6000)).toBe(false); expect(restored.observe('song', '300:3', 8000)).toBe(true); restored.fail('song', '300:3'); expect(restored.observe('song', '300:3', 10000)).toBe(false); restored.retry(); expect(restored.observe('song', '300:3', 10000)).toBe(false); expect(restored.observe('song', '300:3', 12000)).toBe(true);
    restored.reconcile(new Set()); expect(restored.receipts()).toEqual({});
  });
  it('skips initial files, handles new files with old timestamps, and rejects recursive output', async () => {
    const root = await mkdtemp(join(tmpdir(), 'frame-watch-unit-')); const input = join(root, 'input'), output = join(root, 'output');
    try {
      await mkdir(input); await mkdir(output); await writeFile(join(input, 'old.mp3'), 'old'); await mkdir(join(input, 'converted'));
      await expect(validateWatchPaths(input, join(input, 'converted'))).rejects.toThrow('outside'); await expect(validateWatchPaths(input, input)).rejects.toThrow('outside');
      const draft = parseWatchDraft({ name: 'Music', input, output, settings: builtInPresets[5].settings, keepFolders: true, recursive: true, includeExisting: false, namingTemplate: '{name}' });
      const watch = { ...draft, id: 'music', enabled: true }, encoded: string[] = [];
      const runner = new WatchRunner(async work => { encoded.push(work.path); return join(output, 'new.flac'); }, async () => {});
      await runner.initialize(watch); runner.watches.push(watch); await runner.tick(0); await writeFile(join(input, 'new.mp3'), 'first'); await runner.tick(1000); await writeFile(join(input, 'new.mp3'), 'second'); await runner.tick(3000); expect(encoded).toEqual([]); await runner.tick(5000); expect(encoded).toEqual([join(input, 'new.mp3')]); await runner.tick(7000); expect(encoded).toHaveLength(1); expect(runner.status().activity[0].status).toBe('done'); runner.stop();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
