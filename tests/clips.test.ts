import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { editClips, patchClip, reorderClip, splitClip } from '../src/core/clips';
import { editedDuration } from '../src/core/timeline';
import { outputTimeAtSource, sourceTimeAtOutput } from '../src/core/fades';
import { outputCues } from '../src/core/subtitles';
import { defaultSettings, type MediaAsset } from '../src/core/types';
import { parseEdit } from '../src/core/project';
import { buildExportArgs } from '../src/core/export-plan';
import { buildMergeArgs } from '../src/core/composition';
import { ffmpegPath, ffprobePath, probeFile } from '../electron/native';
const exec = promisify(execFile), source = resolve('public/sample.mp4');
let asset: MediaAsset, directory: string;
beforeAll(async () => { directory = await mkdtemp(join(tmpdir(), 'frame-clips-')); asset = { ...await probeFile(source), id: 'test', name: 'sample.mp4', previewUrl: '' }; });
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });
function recipe() {
  let edit = { ...defaultSettings(asset), end: 4 };
  edit = { ...edit, ...splitClip(edit, editClips(edit)[0].id, 2) };
  edit = { ...edit, ...patchClip(edit, edit.clips![1].id, { speed: 2, volume: 0, color: { ...edit.color, saturation: 0 } }) };
  return { ...edit, ...reorderClip(edit, edit.clips![1].id, 0) };
}
describe('ordered clips with scoped effects', () => {
  it('persists independent effects, order and source/output time mappings', () => {
    const original = { ...defaultSettings(asset), splits: [2] }, snapshot = JSON.stringify(original);
    reorderClip(original, editClips(original)[1].id, 0); expect(JSON.stringify(original)).toBe(snapshot);
    const edit = recipe(), restored = parseEdit(JSON.parse(JSON.stringify(edit)), asset);
    expect(restored.clips!.map(c => c.start)).toEqual([2, 0]);
    expect(restored.clips![1].effects).toEqual({});
    expect(editedDuration(restored)).toBe(3);
    expect(outputTimeAtSource(restored, 3)).toBe(.5);
    expect(sourceTimeAtOutput(restored, 1.5)).toBe(.5);
    expect(outputCues({ ...restored, subtitles: { mode: 'burn', cues: [{ start: 2, end: 3, text: 'first in output' }, { start: .5, end: 1, text: 'second' }] } })).toEqual([{ start: 0, end: .5, text: 'first in output' }, { start: 1.5, end: 2, text: 'second' }]);
  });
  it('keeps a split clip’s effects on both children and rejects malformed projects', () => {
    const edit = recipe(), split = { ...edit, ...splitClip(edit, edit.clips![0].id, 3) };
    expect(split.clips!.slice(0, 2).map(c => c.effects.volume)).toEqual([0, 0]);
    for (const patch of [{ speed: 0 }, { color: { lut: 'unsafe' } }, { format: 'mp3' }]) expect(() => parseEdit({ ...edit, clips: [{ ...edit.clips![0], effects: patch }] }, asset)).toThrow();
    expect(() => parseEdit({ ...edit, clips: [edit.clips![0], edit.clips![0]] }, asset)).toThrow();
  });
  it('exports reordered clips with different speed, color and volume through real FFmpeg', async () => {
    const edit = recipe(), output = join(directory, 'ordered.mp4');
    await exec(ffmpegPath(), buildExportArgs(asset, edit, source, output));
    const { stdout } = await exec(ffprobePath(), ['-v', 'error', '-show_format', '-of', 'json', output]);
    expect(Number(JSON.parse(stdout).format.duration)).toBeCloseTo(3, 1);
    const first = await exec(ffmpegPath(), ['-i', output, '-t', '0.7', '-map', '0:a', '-af', 'volumedetect', '-f', 'null', '-']);
    const second = await exec(ffmpegPath(), ['-ss', '1.3', '-i', output, '-t', '0.7', '-map', '0:a', '-af', 'volumedetect', '-f', 'null', '-']);
    expect(first.stderr).toMatch(/mean_volume: -91/);
    expect(Number(/mean_volume: (-?[\d.]+)/.exec(second.stderr)![1])).toBeGreaterThan(-60);
  });
  it('merges ordered sources without discarding scoped effects', async () => {
    const edit = recipe(), output = join(directory, 'merged.mp4');
    await exec(ffmpegPath(), buildMergeArgs([{ asset, edit }, { asset, edit: { ...defaultSettings(asset), end: 1 } }], defaultSettings(asset), [source, source], output));
    const { stdout } = await exec(ffprobePath(), ['-v', 'error', '-show_format', '-of', 'json', output]);
    expect(Number(JSON.parse(stdout).format.duration)).toBeCloseTo(4, 1);
  });
});
