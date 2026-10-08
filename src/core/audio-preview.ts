import { buildExportArgs, validateEdit } from './export-plan';
import { keptRanges } from './timeline';
import type { EditSettings, MediaAsset } from './types';
export function previewAudioArgs(asset: MediaAsset, edit: EditSettings, input: string, output: string): string[] {
  validateEdit(asset, edit);
  if (!asset.hasAudio) throw new Error('This file has no audio to preview.');
  const ranges = keptRanges(edit); const range = ranges.reduce((longest, r) => r.end - r.start > longest.end - longest.start ? r : longest, ranges[0]);
  const preview: EditSettings = { ...edit, start: range.start, end: Math.min(range.end, range.start + 10 * edit.speed), cuts: [], splits: [],
    format: 'wav', includeArtwork: false, keepMetadata: false, audioFadeIn: 0, audioFadeOut: 0, videoFadeIn: 0, videoFadeOut: 0 };
  const args = buildExportArgs(asset, preview, input, output); args.splice(args.length - 1, 0, '-ac', '2', '-ar', '48000'); return args;
}
