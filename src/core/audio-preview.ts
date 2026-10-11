import { allAudioLayers, effectiveSpeed } from './effect-instances';
import { hasEditedAudio, type AudioLayerInput } from './audio-layers';
import { buildExportArgs, validateEdit } from './export-plan';
import { keptRanges, editedDuration } from './timeline';
import type { EditSettings, MediaAsset } from './types';
export function previewAudioArgs(
  asset: MediaAsset,
  edit: EditSettings,
  input: string,
  output: string,
  layers: AudioLayerInput[] = [],
): string[] {
  validateEdit(asset, edit);
  if (!hasEditedAudio(asset, edit)) throw new Error('This file has no audio to preview.');
  if (allAudioLayers(edit).length) {
    const args = buildExportArgs(
      asset,
      {
        ...edit,
        format: 'wav',
        audioSampleRate: 48000,
        audioChannels: 2,
        targetSizeMb: null,
        includeArtwork: false,
        keepMetadata: false,
      },
      input,
      output,
      undefined,
      layers,
    );
    args.splice(args.length - 1, 0, '-t', String(Math.min(10, editedDuration(edit))));
    return args;
  }
  if (edit.clips || edit.effectInstances?.some((instance) => instance.timeSpace === 'output')) {
    const preview: EditSettings = {
      ...edit,
      format: 'wav',
      audioSampleRate: 48000,
      audioChannels: 2,
      targetSizeMb: null,
      includeArtwork: false,
      keepMetadata: false,
      audioFadeIn: 0,
      audioFadeOut: 0,
      effectInstances: edit.effectInstances?.filter(
        (instance) => !instance.effect.includes('Fade'),
      ),
    };
    const args = buildExportArgs(asset, preview, input, output);
    args.splice(args.length - 1, 0, '-t', String(Math.min(10, editedDuration(edit))));
    return args;
  }
  const ranges = keptRanges(edit);
  const range = ranges.reduce(
    (longest, r) => (r.end - r.start > longest.end - longest.start ? r : longest),
    ranges[0],
  );
  const preview: EditSettings = {
    ...edit,
    start: range.start,
    end: Math.min(range.end, range.start + 10 * effectiveSpeed(edit)),
    cuts: [],
    splits: [],
    clips: undefined,
    format: 'wav',
    includeArtwork: false,
    keepMetadata: false,
    audioFadeIn: 0,
    audioFadeOut: 0,
    videoFadeIn: 0,
    videoFadeOut: 0,
  };
  const args = buildExportArgs(asset, preview, input, output);
  args.splice(args.length - 1, 0, '-ac', '2', '-ar', '48000');
  return args;
}
