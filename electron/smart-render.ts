import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AudioLayerInput } from '../src/core/audio-layers';
import type { RecipeResources } from '../src/core/resources';
import {
  planSmartRender,
  smartAudioArgs,
  smartFrameCount,
  smartMuxArgs,
  smartPieceArgs,
  smartRenderable,
  smartSourceSupported,
  type SmartPacket,
  type SmartSource,
} from '../src/core/smart-render';
import { editedDuration, keptRanges } from '../src/core/timeline';
import type { EditSettings, MediaAsset } from '../src/core/types';
import type { MediaJobs } from './jobs';
import { ffprobePath, runFfmpeg } from './native';
type Execute = Parameters<Parameters<MediaJobs['run']>[0]>[0];

function probe(args: string[], signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) =>
    execFile(
      ffprobePath(),
      ['-v', 'error', ...args],
      { signal, windowsHide: true, maxBuffer: 256 * 1024 * 1024, timeout: 120000 },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    ),
  );
}
async function inspect(
  input: string,
  signal: AbortSignal,
): Promise<{ source: SmartSource; packets: SmartPacket[] } | null> {
  const info = JSON.parse(
    await probe(
      [
        '-select_streams',
        'V:0',
        // Whole sections: older bundled FFprobe builds reject side-data entry filters.
        '-show_streams',
        '-show_format',
        '-of',
        'json',
        input,
      ],
      signal,
    ),
  );
  const stream = info.streams?.[0];
  if (!stream) return null;
  const source: SmartSource = {
    codec: stream.codec_name,
    profile: stream.profile,
    pixelFormat: stream.pix_fmt,
    timescale: Number(String(stream.time_base ?? '').split('/')[1]),
    rotated:
      !!Number(stream.tags?.rotate ?? 0) ||
      (stream.side_data_list ?? []).some((data: { rotation?: number }) => !!data.rotation),
    interlaced: !['progressive', 'unknown', undefined].includes(stream.field_order),
  };
  if (!smartSourceSupported(source)) return null;
  const startTime = Number(info.format?.start_time ?? 0) || 0;
  const packets: SmartPacket[] = [];
  for (const line of (
    await probe(
      ['-select_streams', 'V:0', '-show_entries', 'packet=pts_time,flags', '-of', 'csv=p=0', input],
      signal,
    )
  ).split('\n')) {
    if (!line.trim()) continue;
    const [time, flags = ''] = line.split(',');
    const pts = Number(time);
    if (time === 'N/A' || !Number.isFinite(pts)) return null;
    packets.push({ pts: pts - startTime, key: flags.includes('K') });
  }
  return packets.length ? { source, packets } : null;
}

/**
 * Exports trims and cuts without picture changes by copying the original H.264 between
 * keyframes. Returns false when the recipe or source needs a full render.
 */
export async function smartRender(
  asset: MediaAsset,
  edit: EditSettings,
  input: string,
  output: string,
  resources: RecipeResources,
  layers: AudioLayerInput[],
  execute: Execute,
  jobs: MediaJobs,
  progress: (ratio: number, message: string) => void,
): Promise<boolean> {
  if (!smartRenderable(asset, edit, resources)) return false;
  const inspected = await inspect(input, jobs.signal);
  if (!inspected) return false;
  const pieces = planSmartRender(inspected.packets, keptRanges(edit));
  if (!pieces.some((piece) => piece.kind === 'copy')) return false;
  const directory = await mkdtemp(join(tmpdir(), 'frame-smart-'));
  try {
    const total = smartFrameCount(pieces);
    const encoded = pieces
      .filter((piece) => piece.kind === 'encode')
      .reduce((sum, piece) => sum + piece.frames, 0);
    // Encoded frames dominate the work; copying and the soundtrack take a small share.
    const weight = (frames: number) => (frames / Math.max(1, encoded)) * 0.8;
    let done = 0;
    const names: string[] = [];
    for (const [index, piece] of pieces.entries()) {
      if (jobs.cancelled) throw new Error('Export cancelled.');
      const name = `piece-${index}.mp4`;
      names.push(name);
      const share = piece.kind === 'encode' ? weight(piece.frames) : 0;
      const before = done;
      await execute(
        runFfmpeg(
          smartPieceArgs(piece, inspected.source, input, join(directory, name), edit.quality),
          piece.frames / Math.max(1, total / editedDuration(edit)),
          (ratio) => progress(before + ratio * share, 'Copying unchanged video…'),
          undefined,
          { allCores: true },
        ),
      );
      done += share;
    }
    const audioPath = join(directory, 'audio.m4a');
    const audio = smartAudioArgs(asset, edit, input, audioPath, resources, layers);
    if (audio)
      await execute(
        runFfmpeg(
          audio,
          editedDuration(edit),
          (ratio) => progress(done + ratio * 0.15, 'Rendering the soundtrack…'),
          undefined,
          { allCores: true },
        ),
      );
    const list = join(directory, 'pieces.txt');
    await writeFile(list, names.map((name) => `file '${name}'\n`).join(''));
    await execute(
      runFfmpeg(
        smartMuxArgs(edit, list, input, audio ? audioPath : null, output),
        editedDuration(edit),
        (ratio) => progress(0.95 + ratio * 0.04, 'Joining video…'),
        undefined,
        { allCores: true },
      ),
    );
    const written = Number(
      (
        await probe(
          [
            '-select_streams',
            'v:0',
            '-count_packets',
            '-show_entries',
            'stream=nb_read_packets',
            '-of',
            'csv=p=0',
            output,
          ],
          jobs.signal,
        )
      ).trim(),
    );
    if (written !== total) throw new Error('Smart rendering produced an unexpected frame count.');
    return true;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
