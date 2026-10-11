import { expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildExportArgs } from '../src/core/export-plan';
import { buildMergeArgs } from '../src/core/composition';
import { resourcePaths, recipeFiles } from '../src/core/resources';
import { outputSettings } from '../src/core/presets';
import { sourceIdentity } from '../src/core/project';
import {
  chapterText,
  serializeChapters,
  timelineChapters,
  mergedChapters,
} from '../src/core/chapters';
import { defaultSettings } from '../src/core/types';
import { ffmpegPath, ffprobePath, probeFile } from '../electron/native';
const exec = promisify(execFile);
it('maps chapters through cut order and speed and escapes real embedded metadata', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-chapters-'));
  try {
    const input = resolve('tests/fixtures/sample.mp4'),
      asset = { ...(await probeFile(input)), id: 'source', name: 'source.mp4', previewUrl: '' };
    const title = 'Second = scene; #notes\\path\nnew line',
      edit = {
        ...defaultSettings(asset),
        markers: [
          { id: 'early', name: 'First', time: 1, color: 'violet' as const },
          { id: 'late', name: title, time: 4, color: 'blue' as const },
          { id: 'cut', name: 'Removed', time: 2.5, color: 'mint' as const },
        ],
        clips: [
          { id: 'late', start: 3, end: 6, effects: { speed: 2 } },
          { id: 'early', start: 0, end: 2, effects: {} },
        ],
      };
    const chapters = timelineChapters(edit);
    expect(chapters.map((chapter) => chapter.start)).toEqual([0, 0.5, 2.5]);
    expect(chapters.at(-1)?.end).toBe(3.5);
    expect(chapterText(chapters)).toContain('00:00:00.500 Second = scene; #notes\\path new line');
    const metadata = join(directory, 'chapters.ffmetadata'),
      output = join(directory, 'chapters.mp4');
    await writeFile(metadata, serializeChapters(chapters));
    await exec(ffmpegPath(), [
      '-y',
      '-i',
      input,
      '-f',
      'ffmetadata',
      '-i',
      metadata,
      '-map',
      '0',
      '-map_chapters',
      '1',
      '-c',
      'copy',
      output,
    ]);
    const { stdout } = await exec(ffprobePath(), [
      '-v',
      'error',
      '-show_chapters',
      '-of',
      'json',
      output,
    ]);
    const loaded = JSON.parse(stdout).chapters;
    expect(loaded).toHaveLength(3);
    expect(loaded[1].tags.title).toBe(title);
    expect(Number(loaded[1].start_time)).toBe(0.5);
    const resources = resourcePaths(join(directory, 'recipe'));
    const withChapters = {
      ...edit,
      includeChapters: true,
      subtitles: {
        mode: 'embed' as const,
        cues: [{ start: 3.2, end: 4, text: 'Chapter caption' }],
      },
      audioLayers: [
        {
          id: 'music',
          source: sourceIdentity(asset),
          start: 0,
          end: 3.5,
          sourceStart: 0,
          sourceEnd: 2,
          volume: 0.2,
          loop: true,
          muted: false,
          fadeIn: 0,
          fadeOut: 0,
        },
      ],
    };
    for (const file of recipeFiles(withChapters, resources, asset))
      await writeFile(file.path, file.text);
    for (const format of ['mp4', 'mkv', 'm4a', 'mov'] as const) {
      const planned = join(directory, `planned.${format}`);
      await exec(
        ffmpegPath(),
        buildExportArgs(asset, { ...withChapters, format }, input, planned, resources, [
          { layer: withChapters.audioLayers[0], path: input },
        ]),
      );
      const { stdout: checked } = await exec(ffprobePath(), [
        '-v',
        'error',
        '-show_chapters',
        '-show_streams',
        '-of',
        'json',
        planned,
      ]);
      const info = JSON.parse(checked);
      expect(
        info.chapters.map((chapter: { start_time: string }) => Number(chapter.start_time)),
      ).toEqual([0, 0.5, 2.5]);
      expect(
        info.streams.some((stream: { codec_type: string }) => stream.codec_type === 'audio'),
      ).toBe(true);
    }
    const mergedOutput = join(directory, 'merged.mp4'),
      clipList = [
        { asset, edit: withChapters },
        { asset, edit: withChapters },
      ],
      mergedCaptionPath = join(directory, 'merge.srt');
    await writeFile(mergedCaptionPath, '1\n00:00:00,000 --> 00:00:01,000\nMerged caption\n');
    await writeFile(
      `${mergedCaptionPath}-chapters.ffmetadata`,
      serializeChapters(mergedChapters(clipList)),
    );
    await exec(
      ffmpegPath(),
      buildMergeArgs(
        clipList,
        outputSettings(withChapters),
        [input, input],
        mergedOutput,
        undefined,
        [resources, resources],
        mergedCaptionPath,
        [
          [{ layer: withChapters.audioLayers[0], path: input }],
          [{ layer: withChapters.audioLayers[0], path: input }],
        ],
      ),
    );
    const { stdout: mergeInfo } = await exec(ffprobePath(), [
      '-v',
      'error',
      '-show_chapters',
      '-of',
      'json',
      mergedOutput,
    ]);
    expect(JSON.parse(mergeInfo).chapters).toHaveLength(6);
    const merged = mergedChapters(
      [
        { asset, edit },
        { asset, edit },
      ],
      { type: 'fade', duration: 0.25 },
    );
    expect(merged.at(-1)?.end).toBe(6.75);
    expect(merged.map((chapter) => chapter.start)).toContain(3.25);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
