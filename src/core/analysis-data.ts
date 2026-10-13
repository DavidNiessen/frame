import { clipFilterGraph } from './clip-filters';
import { editClips } from './clips';
import { buildExportArgs } from './export-plan';
import { frameDimensions } from './geometry';
import { editedDuration } from './timeline';
import type { AudioLayerInput } from './audio-layers';
import type { RecipeResources } from './resources';
import type { EditSettings, MediaAsset } from './types';
export interface AnalysisOptions {
  kind: 'tracking' | 'speech';
  start: number;
  end: number;
}
export function parseAnalysisOptions(value: unknown, edit: EditSettings): AnalysisOptions {
  const options = value as AnalysisOptions;
  if (
    !options ||
    !['tracking', 'speech'].includes(options.kind) ||
    !Number.isFinite(options.start) ||
    !Number.isFinite(options.end) ||
    options.start < 0 ||
    options.end <= options.start ||
    options.end > editedDuration(edit) + 0.001 ||
    options.end - options.start > (options.kind === 'tracking' ? 30 : 600)
  )
    throw new Error(
      'Choose up to 30 seconds for motion tracking or 10 minutes for transcription within the sequence.',
    );
  return { kind: options.kind, start: options.start, end: options.end };
}
export function trackingDimensions(asset: MediaAsset, edit: EditSettings) {
  const dimensions = frameDimensions(asset, edit),
    ratio = Math.min(320 / dimensions.width, 240 / dimensions.height);
  return {
    width: Math.max(2, Math.round((dimensions.width * ratio) / 2) * 2),
    height: Math.max(2, Math.round((dimensions.height * ratio) / 2) * 2),
    fps: 8,
  };
}
/** Extract the output sequence, including cuts and speed changes, into bounded worker inputs. */
export function analysisDataArgs(
  asset: MediaAsset,
  edit: EditSettings,
  value: AnalysisOptions,
  input: string,
  output: string,
  paths: RecipeResources,
  layers: AudioLayerInput[] = [],
) {
  const options = parseAnalysisOptions(value, edit);
  if (options.kind === 'speech') {
    const plan = buildExportArgs(
      asset,
      {
        ...edit,
        format: 'wav',
        includeArtwork: false,
        includeChapters: false,
        keepMetadata: false,
        targetSizeMb: null,
        audioSampleRate: 16000,
        audioChannels: 1,
        wavDepth: 16,
      },
      input,
      output,
      paths,
      layers,
    );
    plan.splice(
      plan.length - 1,
      0,
      '-ss',
      String(options.start),
      '-t',
      String(options.end - options.start),
    );
    return plan;
  }
  if (asset.kind !== 'video') throw new Error('Motion tracking requires video.');
  const recipe = { ...edit, clips: editClips(edit), cuts: [], splits: [] },
    dims = trackingDimensions(asset, edit);
  const graph = clipFilterGraph(asset, recipe, '0', 'tracking', paths, true, false).graph;
  graph.push(
    `[trackingv]trim=start=${options.start}:end=${options.end},setpts=PTS-STARTPTS,fps=${dims.fps},scale=${dims.width}:${dims.height},format=gray[frames]`,
  );
  return [
    '-y',
    '-ss',
    String(edit.start),
    '-t',
    String(edit.end - edit.start),
    '-i',
    input,
    '-filter_complex',
    graph.join(';'),
    '-map',
    '[frames]',
    '-an',
    '-c:v',
    'rawvideo',
    '-pix_fmt',
    'gray',
    '-f',
    'rawvideo',
    '-threads',
    '1',
    output,
  ];
}
