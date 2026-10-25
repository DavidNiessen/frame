import { buildExportArgs } from './export-plan';
import { hasEditedAudio, type AudioLayerInput } from './audio-layers';
import { chapterFormats, timelineChapters } from './chapters';
import { effectiveSpeed } from './effect-instances';
import { videoFilters } from './filters';
import { getFormat } from './formats';
import { mediaTagArgs } from './media-tags';
import { embeddedCues, type RecipeResources } from './resources';
import type { EditSettings, MediaAsset } from './types';

/**
 * Smart rendering copies untouched H.264 between clean keyframes and re-encodes only the
 * frames between each cut and its nearest keyframe, like Premiere and Final Cut do for
 * trims and cuts without picture changes.
 */
export interface SmartSource {
  codec: string;
  profile: string;
  pixelFormat: string;
  /** Video stream time base denominator, e.g. 15360 for 1/15360. */
  timescale: number;
  rotated: boolean;
  interlaced: boolean;
}
/** One video packet in decode order, timed like -ss: relative to the container start. */
export interface SmartPacket {
  pts: number;
  key: boolean;
}
export interface SmartPiece {
  kind: 'encode' | 'copy';
  /** First frame's presentation time, in source seconds. */
  start: number;
  frames: number;
}
const profiles: Record<string, string> = {
  'Constrained Baseline': 'baseline',
  Baseline: 'baseline',
  Main: 'main',
  High: 'high',
};
// Half of the shortest plausible frame interval: separates neighbouring frames safely.
const epsilon = 0.0005;

/** Whether the recipe leaves every kept frame untouched, so only cut points need encoding. */
export function smartRenderable(
  asset: MediaAsset,
  edit: EditSettings,
  resources: RecipeResources,
): boolean {
  const format = getFormat(edit.format);
  return (
    asset.kind === 'video' &&
    asset.videoCodec === 'h264' &&
    ['mp4', 'mov', 'mkv'].includes(edit.format) &&
    format.videoCodec === 'libx264' &&
    !edit.clips &&
    !edit.mediaLayers?.length &&
    edit.videoBitrate === null &&
    edit.targetSizeMb === null &&
    effectiveSpeed(edit) === 1 &&
    !embeddedCues(edit).length &&
    !(
      edit.includeChapters &&
      chapterFormats.includes(edit.format) &&
      timelineChapters(edit).length
    ) &&
    (asset.width ?? 1) % 2 === 0 &&
    (asset.height ?? 1) % 2 === 0 &&
    videoFilters(asset, edit, resources).length === 0
  );
}
export function smartSourceSupported(source: SmartSource): boolean {
  return (
    source.codec === 'h264' &&
    !!profiles[source.profile] &&
    source.pixelFormat === 'yuv420p' &&
    source.timescale > 0 &&
    !source.rotated &&
    !source.interlaced
  );
}

/**
 * Splits each kept range into re-encoded edges and a copied middle. A keyframe is a clean cut
 * point only when no packet on either side of it in decode order is displayed across it, so the
 * copied run never references frames from outside itself.
 */
export function planSmartRender(
  packets: SmartPacket[],
  ranges: { start: number; end: number }[],
): SmartPiece[] {
  const count = packets.length;
  const before = new Array<number>(count);
  const after = new Array<number>(count);
  let highest = -Infinity;
  for (let i = 0; i < count; i++) {
    before[i] = highest;
    highest = Math.max(highest, packets[i].pts);
  }
  let lowest = Infinity;
  for (let i = count - 1; i >= 0; i--) {
    after[i] = lowest;
    lowest = Math.min(lowest, packets[i].pts);
  }
  const clean: number[] = [];
  for (let i = 0; i < count; i++)
    if (packets[i].key && before[i] < packets[i].pts && after[i] > packets[i].pts) clean.push(i);
  const sorted = packets.map((packet) => packet.pts).sort((a, b) => a - b);
  const framesBetween = (start: number, end: number) =>
    lowerBound(sorted, end - epsilon) - lowerBound(sorted, start - epsilon);
  const firstFrame = (start: number) => sorted[lowerBound(sorted, start - epsilon)];
  const pieces: SmartPiece[] = [];
  const push = (piece: SmartPiece) => {
    if (piece.frames > 0) pieces.push(piece);
  };
  for (const range of ranges) {
    const inside = clean.filter(
      (i) => packets[i].pts >= range.start - epsilon && packets[i].pts <= range.end + epsilon,
    );
    if (inside.length < 2) {
      push({
        kind: 'encode',
        start: firstFrame(range.start),
        frames: framesBetween(range.start, range.end),
      });
      continue;
    }
    const first = inside[0];
    const last = inside[inside.length - 1];
    const copyStart = packets[first].pts;
    const copyEnd = packets[last].pts;
    push({
      kind: 'encode',
      start: firstFrame(range.start),
      frames: framesBetween(range.start, copyStart),
    });
    push({ kind: 'copy', start: copyStart, frames: last - first });
    push({ kind: 'encode', start: copyEnd, frames: framesBetween(copyEnd, range.end) });
  }
  return pieces;
}
function lowerBound(values: number[], target: number): number {
  let low = 0,
    high = values.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (values[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** Arguments that write one piece as an MP4 the concat demuxer can join. */
export function smartPieceArgs(
  piece: SmartPiece,
  source: SmartSource,
  input: string,
  output: string,
  quality: EditSettings['quality'],
): string[] {
  // Seek just under the first frame. Copies drop packets shown before it and so start on the keyframe.
  const seek = Math.max(0, piece.start - epsilon);
  const video =
    piece.kind === 'copy'
      ? ['-c:v', 'copy', '-copypriorss', '0']
      : [
          '-c:v',
          'libx264',
          '-profile:v',
          profiles[source.profile],
          '-pix_fmt',
          source.pixelFormat,
          // Short edge pieces sit beside original frames; keep them at least High quality.
          '-crf',
          String(Math.min(18, { high: 18, balanced: 23, small: 30 }[quality])),
          '-preset',
          'fast',
          '-fps_mode',
          'passthrough',
        ];
  return [
    '-y',
    '-ss',
    String(seek),
    '-i',
    input,
    '-map',
    '0:V:0',
    '-frames:v',
    String(piece.frames),
    '-an',
    '-sn',
    '-dn',
    '-map_metadata',
    '-1',
    ...video,
    '-video_track_timescale',
    String(source.timescale),
    '-f',
    'mp4',
    output,
  ];
}

/** Renders the edited soundtrack alone; audio encodes quickly next to video. */
export function smartAudioArgs(
  asset: MediaAsset,
  edit: EditSettings,
  input: string,
  output: string,
  resources: RecipeResources,
  layers: AudioLayerInput[] = [],
): string[] | null {
  if (!hasEditedAudio(asset, edit)) return null;
  return buildExportArgs(
    asset,
    {
      ...edit,
      format: 'm4a',
      includeArtwork: false,
      includeChapters: false,
      keepMetadata: false,
      outputTags: {},
    },
    input,
    output,
    resources,
    layers,
  );
}

/** Joins the pieces losslessly and adds the soundtrack, metadata and tags. */
export function smartMuxArgs(
  edit: EditSettings,
  list: string,
  source: string,
  audio: string | null,
  output: string,
): string[] {
  const args = ['-y', '-f', 'concat', '-safe', '0', '-i', list];
  if (audio) args.push('-i', audio);
  if (edit.keepMetadata) args.push('-i', source);
  args.push('-map', '0:v:0');
  if (audio) args.push('-map', '1:a:0');
  args.push(
    '-map_metadata',
    edit.keepMetadata ? String(audio ? 2 : 1) : '-1',
    '-map_chapters',
    '-1',
    ...mediaTagArgs(edit.outputTags),
    '-c',
    'copy',
  );
  if (['mp4', 'mov'].includes(edit.format)) args.push('-movflags', '+faststart');
  args.push(output);
  return args;
}
export function smartFrameCount(pieces: SmartPiece[]): number {
  return pieces.reduce((sum, piece) => sum + piece.frames, 0);
}
