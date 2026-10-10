import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { defaultSettings, type EditSettings, type MediaAsset } from '../src/core/types';
import { addTimelineEffect, fitTimelineEffects, timelineEffectRows, timelineFadeGain } from '../src/core/timeline-effects';
import { editClips, splitClip, clipRecipe, reorderClip, patchClip } from '../src/core/clips';
import { changeInstance, effectiveVolume } from '../src/core/effect-instances';
import { existingEffectTarget } from '../src/core/effect-actions';
import { effectLibrary } from '../src/core/effect-library';
import { parseEdit } from '../src/core/project';
import { buildExportArgs } from '../src/core/export-plan';
import { editedDuration } from '../src/core/timeline';
import { framePreviewArgs } from '../src/core/frame-preview';
import { ffmpegPath } from '../electron/native';
import { burnedCues, recipeFiles, resourcePaths } from '../src/core/resources';
import { sourceRecipes } from '../src/core/effect-instances';
import { overlayIntervals } from '../src/core/overlays';
import { previewAudioArgs } from '../src/core/audio-preview';
const exec = promisify(execFile), ffmpeg = ffmpegPath()!;
const asset: MediaAsset = { id: 'test', name: 'track.mp4', kind: 'video', duration: 6, hasAudio: true, width: 64, height: 64, size: 1, previewUrl: '' };
const add = (edit: EditSettings, id: Parameters<typeof addTimelineEffect>[2], current = 0) => ({ ...edit, ...addTimelineEffect(edit, asset, id, current) });
const split = (edit: EditSettings, time = 3) => ({ ...edit, ...splitClip(edit, editClips(edit)[0].id, time) });
it('preserves a previously saved clip fade across a new split without restarting it', () => {
  let edit = defaultSettings(asset);
  edit = { ...edit, ...patchClip(edit, editClips(edit)[0].id, { audioFadeOut: 2, addedEffects: ['audioFadeOut'] }) };
  edit = split(edit, 5);
  expect(edit.effectInstances).toHaveLength(1);
  expect(edit.effectInstances![0].range).toEqual({ start: 4, end: 6 });
  expect(edit.clips!.every(clip => !clip.effects.audioFadeOut)).toBe(true);
  const graph = buildExportArgs(asset, { ...edit, format: 'wav' }, 'in.mp4', 'out.wav').join(' ');
  expect(graph.match(/afade=t=out/g)).toHaveLength(1);
  expect(graph).toContain('afade=t=out:st=4:d=2');
});
it('keeps a whole-track fade at the output end after splitting without cloning it', () => {
  let edit = add(defaultSettings(asset), 'videoFadeOut');
  const original = structuredClone(edit.effectInstances);
  edit = split(edit); edit = split(edit, 1);
  expect(edit.effectInstances).toEqual(original);
  expect(edit.clips!.every(clip => !clip.effects.effectInstances && !clip.effects.videoFadeOut)).toBe(true);
  expect(timelineEffectRows(edit)).toHaveLength(1);
  const graph = buildExportArgs(asset, edit, 'in.mp4', 'out.mp4').join(' ');
  expect(graph.match(/fade=t=out/g)).toHaveLength(1);
  expect(graph).toContain('fade=t=out:st=5.5:d=0.5');
  expect(graph.indexOf('fade=t=out')).toBeGreaterThan(graph.indexOf('concat=n=3'));
  expect(timelineFadeGain(edit.effectInstances![0], 2.9)).toBe(1);
  expect(timelineFadeGain(edit.effectInstances![0], 5.75)).toBe(.5);
});
it('allows overlapping EQs and fades on separate rows across splits with independent changes and persistence', () => {
  let edit = split(defaultSettings(asset));
  for (const id of ['equalizer', 'equalizer', 'audioFadeOut', 'audioFadeOut'] as const) edit = add(edit, id, 2);
  expect(timelineEffectRows(edit).map(row => [row.effect.id, row.ordinal])).toEqual([['equalizer', 1], ['equalizer', 2], ['audioFadeOut', 1], ['audioFadeOut', 2]]);
  const first = edit.effectInstances![0], fade = edit.effectInstances![2];
  edit = { ...edit, ...changeInstance(edit, first.id, edit.clips![0].id, { equalizer: { bass: 3, mid: 0, treble: 0 } }, { start: 2, end: 4 }) };
  edit = { ...edit, ...changeInstance(edit, fade.id, edit.clips![0].id, {}, { start: 2, end: 4 }) };
  expect(edit.effectInstances![1].settings.equalizer!.bass).toBe(0);
  expect(edit.effectInstances![2].settings.audioFadeOut).toBe(2);
  expect(edit.clips!.every(clip => Object.keys(clip.effects).length === 0)).toBe(true);
  expect(parseEdit(JSON.parse(JSON.stringify(edit)), asset).effectInstances).toEqual(edit.effectInstances);
  const removed = { ...edit, ...changeInstance(edit, first.id, null, 'remove') };
  expect(removed.effectInstances!.map(item => item.id)).not.toContain(first.id);
  expect(removed.effectInstances!.find(item => item.id === fade.id)).toEqual(edit.effectInstances![2]);
  expect(existingEffectTarget(edit, asset, effectLibrary.find(e => e.id === 'audioFadeOut')!, null)).toBeNull();
});
it('uses output timing through trimmed, reordered and speed-adjusted clips', () => {
  let edit = add({ ...defaultSettings(asset), start: 1 }, 'speed');
  edit = { ...edit, ...changeInstance(edit, edit.effectInstances![0].id, null, { speed: 2 }) };
  edit = split(edit); edit = { ...edit, ...reorderClip(edit, edit.clips![1].id, 0) };
  edit = add(edit, 'volume');
  const gain = edit.effectInstances!.at(-1)!;
  edit = { ...edit, ...changeInstance(edit, gain.id, null, { volume: .5 }, { start: .5, end: 2 }) };
  expect(editedDuration(edit)).toBe(2.5);
  expect(effectiveVolume(clipRecipe(edit, edit.clips![0]), 4, 0)).toBe(1);
  expect(effectiveVolume(clipRecipe(edit, edit.clips![0]), 4, 1)).toBe(.5);
  const graph = buildExportArgs(asset, edit, 'in.mp4', 'out.mp4').join(' ');
  expect(graph.match(/volume=0.5/g)).toHaveLength(1);
  expect(graph).toContain("volume=0.5:enable='gte(t,0.5)*lt(t,2)'");
  expect(graph.match(/atempo=2/g)).toHaveLength(2);
});
it('accepts an output fade longer than the original source when the track is slowed down', () => {
  let edit = add(defaultSettings(asset), 'speed');
  edit = { ...edit, ...changeInstance(edit, edit.effectInstances![0].id, null, { speed: .25 }) };
  edit = add(edit, 'audioFadeOut'); edit = { ...edit, ...changeInstance(edit, edit.effectInstances!.at(-1)!.id, null, { audioFadeOut: 12 }) };
  expect(parseEdit(JSON.parse(JSON.stringify(edit)), asset).effectInstances!.at(-1)!.range).toEqual({ start: 12, end: 24 });
  expect(buildExportArgs(asset, { ...edit, format: 'wav' }, 'in.mp4', 'out.wav').join(' ')).toContain('afade=t=out:st=12:d=12');
});
it('keeps new captions and watermarks continuous across splits, order changes, previews and shorter outputs', () => {
  let edit = add(add({ ...defaultSettings(asset), start: 1 }, 'captions', 3), 'watermark', 3);
  edit = split(edit); edit = { ...edit, ...reorderClip(edit, edit.clips![1].id, 0) };
  const original = structuredClone(edit.effectInstances);
  expect(burnedCues(edit)).toEqual([{ start: 2, end: 4, text: 'New caption' }]);
  expect(overlayIntervals(sourceRecipes(edit, 'watermark')[1].recipe)).toEqual([{ start: 2, end: 4 }]);
  expect(parseEdit(JSON.parse(JSON.stringify(edit)), asset).effectInstances).toEqual(original);
  const frame = framePreviewArgs(asset, edit, 1.5, 'in.mp4', 'out.png').join(' ');
  expect(frame).toContain('subtitles=filename=frame-captions.srt-burned.ass');
  expect(recipeFiles(edit, resourcePaths(), asset).find(file => file.path.endsWith('-burned.ass'))!.text).toContain('0:00:02.00,0:00:04.00');
  edit = add(edit, 'speed'); edit = { ...edit, ...changeInstance(edit, edit.effectInstances!.at(-1)!.id, null, { speed: 2 }) };
  edit = { ...edit, effectInstances: fitTimelineEffects(edit) };
  expect(burnedCues(edit)[0]).toMatchObject({ start: .5, end: 2.5 });
  expect(edit.effectInstances![1].settings.overlays!.range).toEqual({ start: .5, end: 2.5 });
  const audio = previewAudioArgs(asset, add(edit, 'equalizer'), 'in.mp4', 'out.wav').join(' ');
  expect(audio).toContain('concat=n=2');
});
it('renders only the intended fade ranges across splits, including multiple fades and frame preview', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-timeline-fades-'));
  try {
    const input = join(directory, 'white.mp4');
    await exec(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'color=white:s=64x64:r=30:d=6', '-f', 'lavfi', '-i', 'sine=frequency=1000:sample_rate=48000:duration=6', '-c:v', 'libx264', '-c:a', 'aac', input]);
    let edit = add(add(defaultSettings(asset), 'audioFadeOut'), 'videoFadeOut'); edit = split(edit);
    const wav = join(directory, 'fade.wav'), mp4 = join(directory, 'fade.mp4');
    await exec(ffmpeg, buildExportArgs(asset, { ...edit, format: 'wav', wavDepth: 32 }, input, wav));
    await exec(ffmpeg, buildExportArgs(asset, edit, input, mp4));
    async function energy(path: string, time: number) {
      const { stdout } = await exec(ffmpeg, ['-v', 'error', '-ss', String(time), '-i', path, '-t', '0.02', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], { encoding: 'buffer' });
      let sum = 0; for (let i = 0; i < stdout.length; i += 4) sum += stdout.readFloatLE(i)**2; return sum;
    }
    expect(await energy(wav, 2.75) / await energy(input, 2.75)).toBeCloseTo(1, 2);
    expect(await energy(wav, 5.75) / await energy(input, 5.75)).toBeCloseTo(.23, 1);
    async function pixel(path: string, time: number) {
      const { stdout } = await exec(ffmpeg, ['-v', 'error', '-ss', String(time), '-i', path, '-frames:v', '1', '-vf', 'scale=1:1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], { encoding: 'buffer' }); return stdout[0];
    }
    expect(await pixel(mp4, 2.75)).toBeGreaterThan(245);
    expect(await pixel(mp4, 5.75)).toBeLessThan(160);
    edit = add(edit, 'audioFadeOut', 2); edit = add(edit, 'videoFadeOut', 2);
    for (const instance of edit.effectInstances!.slice(-2)) edit = { ...edit, ...changeInstance(edit, instance.id, null, {}, { start: 2, end: 4 }) };
    await exec(ffmpeg, buildExportArgs(asset, { ...edit, format: 'wav', wavDepth: 32 }, input, wav));
    expect(await energy(wav, 2.99) / await energy(input, 2.99)).toBeCloseTo(.25, 1);
    expect(await energy(wav, 4.5) / await energy(input, 4.5)).toBeCloseTo(1, 2);
    const frame = join(directory, 'frame.png'); await exec(ffmpeg, framePreviewArgs(asset, edit, 3, input, frame));
    expect(await pixel(frame, 0)).toBeLessThan(150);
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 30000);
