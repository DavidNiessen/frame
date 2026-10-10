import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { rm } from 'node:fs/promises';
import { sceneFixture } from './helpers/scenes';
import { ffmpegPath, probeFile } from '../electron/native';
import { SceneCollector, sceneArgs, splitAtScenes, parseSceneOptions } from '../src/core/scenes';
import { defaultSettings, type MediaAsset } from '../src/core/types';
it('finds real scene cuts and filters nearby flashes without inventing markers at source boundaries', async () => {
  const fixture = await sceneFixture();
  try {
    const asset = { ...await probeFile(fixture.source), id: 'a', name: 'scenes.mp4', previewUrl: '' }, collector = new SceneCollector(.5);
    const { stderr } = await promisify(execFile)(ffmpegPath(), sceneArgs(asset, fixture.source, { threshold: .1, minGap: .5 })); stderr.split('\n').forEach(line => collector.push(line));
    expect(collector.finish(asset.duration)).toEqual({ times: [1, 2], truncated: false });
    collector.push('pts_time:2.1'); expect(collector.finish(asset.duration).times).toEqual([1, 2]);
  } finally { await rm(fixture.directory, { recursive: true, force: true }); }
});
it('preserves local effects and sequence order when splitting at detected source positions', () => {
  const asset: MediaAsset = { id: 'a', name: 'a.mp4', duration: 6, kind: 'video', hasAudio: true, size: 1, previewUrl: '' }, edit = { ...defaultSettings(asset), clips: [{ id: 'late', start: 3, end: 6, effects: { volume: .5 } }, { id: 'early', start: 0, end: 2, effects: {} }] };
  const result = splitAtScenes(edit, [4, 1, 2, 4]); expect(result.clips?.map(clip => [clip.start, clip.end, clip.effects.volume])).toEqual([[3, 4, .5], [4, 6, .5], [0, 1, undefined], [1, 2, undefined]]);
  expect(edit.clips).toHaveLength(2); expect(() => parseSceneOptions({ threshold: 0, minGap: -1 })).toThrow();
});
