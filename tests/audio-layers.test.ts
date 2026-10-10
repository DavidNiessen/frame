import { expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ffmpegPath, probeFile } from '../electron/native';
import { defaultSettings } from '../src/core/types';
import { sourceIdentity, createProject, parseProject } from '../src/core/project';
import { buildExportArgs } from '../src/core/export-plan';
import { buildMergeArgs } from '../src/core/composition';
import { outputSettings } from '../src/core/presets';
import { parseAudioLayers, resolveAudioLayers, type AudioLayer } from '../src/core/audio-layers';
const exec = promisify(execFile);
it('exports delayed, looping audio with fades, muting and peak protection through cuts and merges', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-audio-layers-'));
  try {
    const basePath = join(directory, 'base.wav'), musicPath = join(directory, 'music.wav');
    await exec(ffmpegPath(), ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '4', basePath]);
    await exec(ffmpegPath(), ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1:sample_rate=48000', '-af', 'volume=15', '-c:a', 'pcm_f32le', musicPath]);
    const base = { ...await probeFile(basePath), id: 'base', name: 'base.wav', previewUrl: '' }, music = { ...await probeFile(musicPath), id: 'music', name: 'music.wav', previewUrl: '' };
    const layer: AudioLayer = { id: 'music-track', source: sourceIdentity(music), start: 1, end: 3, sourceStart: .1, sourceEnd: .6, loop: true, muted: false, volume: 1, fadeIn: .1, fadeOut: .2 };
    const edit = { ...defaultSettings(base), format: 'wav' as const, audioLayers: [layer], clips: [{ id: 'end', start: 2, end: 4, effects: {} }, { id: 'start', start: 0, end: 2, effects: {} }] };
    const layers = resolveAudioLayers(edit, [{ asset: music, path: musicPath }]);
    const output = join(directory, 'mix.wav'); await exec(ffmpegPath(), buildExportArgs(base, edit, basePath, output, undefined, layers));
    const pcm = join(directory, 'mix.raw'); await exec(ffmpegPath(), ['-y', '-i', output, '-ar', '48000', '-ac', '2', '-f', 'f32le', pcm]); const bytes = await readFile(pcm);
    const peak = (start: number, end: number) => { let max = 0; for (let i = Math.round(start * 48000 * 2); i < Math.min(bytes.length / 4, Math.round(end * 48000 * 2)); i++) max = Math.max(max, Math.abs(bytes.readFloatLE(i * 4))); return max; };
    expect(peak(0, .95)).toBeLessThan(.001); expect(peak(1.2, 2.7)).toBeGreaterThan(.8); expect(peak(1.2, 2.7)).toBeLessThanOrEqual(.951); expect(peak(3.1, 4)).toBeLessThan(.001); expect(peak(2.99, 3)).toBeLessThan(.2);
    const mutedEdit = { ...edit, audioLayers: [{ ...layer, muted: true }] }; await exec(ffmpegPath(), buildExportArgs(base, mutedEdit, basePath, join(directory, 'muted.wav'), undefined, resolveAudioLayers(mutedEdit, [{ asset: music, path: musicPath }])));
    const clips = [{ asset: base, edit }, { asset: base, edit: { ...defaultSettings(base), format: 'wav' as const } }]; const merge = join(directory, 'merge.wav'); await exec(ffmpegPath(), buildMergeArgs(clips, outputSettings(edit), [basePath, basePath], merge, undefined, undefined, undefined, [layers, []])); expect((await probeFile(merge)).duration).toBeCloseTo(8, 2);
    const videoPath = resolve('public/sample.mp4'), video = { ...await probeFile(videoPath), id: 'video', name: 'video.mp4', previewUrl: '' }; const videoEdit = { ...defaultSettings(video), audioLayers: [layer], format: 'mp4' as const }; await exec(ffmpegPath(), buildExportArgs(video, videoEdit, videoPath, join(directory, 'video.mp4'), undefined, layers)); expect((await probeFile(join(directory, 'video.mp4'))).hasAudio).toBe(true);
    const silentPath = join(directory, 'silent.mp4'); await exec(ffmpegPath(), ['-y', '-i', videoPath, '-c:v', 'copy', '-an', silentPath]); const silent = { ...await probeFile(silentPath), id: 'silent', name: 'silent.mp4', previewUrl: '' }; const silentEdit = { ...defaultSettings(silent), format: 'wav' as const, audioLayers: [layer], clips: [{ id: 'silent-a', start: 0, end: 3, effects: {} }, { id: 'silent-b', start: 3, end: 6, effects: {} }] }; await exec(ffmpegPath(), buildExportArgs(silent, silentEdit, silentPath, join(directory, 'silent-mix.wav'), undefined, layers)); expect((await probeFile(join(directory, 'silent-mix.wav'))).hasAudio).toBe(true);
    const project = createProject('Mix', [base, music], id => id === 'base' ? edit : defaultSettings(music), 'base'); expect(parseProject(JSON.parse(JSON.stringify(project))).sources[0].edit.audioLayers).toEqual([layer]);
    expect(() => resolveAudioLayers(edit, [])).toThrow('Import'); expect(() => parseAudioLayers([{ ...layer, sourceStart: -.1 }])).toThrow(); expect(() => parseAudioLayers([layer, layer])).toThrow('identifier');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
