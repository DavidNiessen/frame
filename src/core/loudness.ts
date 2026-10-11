import { hasEditedAudio, type AudioLayerInput } from './audio-layers';
import { buildExportArgs } from './export-plan';
import type { EditSettings, MediaAsset } from './types';
export interface LoudnessStats {
  integrated: number | null;
  range: number | null;
  truePeak: number | null;
}
export function loudnessArgs(
  asset: MediaAsset,
  edit: EditSettings,
  input: string,
  layers: AudioLayerInput[] = [],
): string[] {
  if (!hasEditedAudio(asset, edit)) throw new Error('This source has no audio to measure.');
  const settings = {
    ...edit,
    format: 'wav' as const,
    audioSampleRate: 48000,
    wavDepth: 32 as const,
    targetSizeMb: null,
    includeArtwork: false,
    keepMetadata: false,
  };
  const args = buildExportArgs(asset, settings, input, '-', undefined, layers),
    complex = args.indexOf('-filter_complex'),
    map = args.indexOf('-map'),
    simple = args.indexOf('-af');
  if (complex >= 0) {
    args[complex + 1] += `;${args[map + 1]}ebur128=peak=true[measured]`;
    args[map + 1] = '[measured]';
  } else if (simple >= 0) args[simple + 1] += ',ebur128=peak=true';
  args.unshift('-loglevel', 'info');
  args.splice(args.length - 1, 0, '-f', 'null');
  return args;
}
export class LoudnessCollector {
  private stats: LoudnessStats = { integrated: null, range: null, truePeak: null };
  private seen = false;
  push(line: string) {
    const definitions = [
      ['integrated', /^\s*I:\s*([\d.+-]+|-inf)\s*LUFS/],
      ['range', /^\s*LRA:\s*([\d.+-]+|-inf)\s*LU/],
      ['truePeak', /^\s*Peak:\s*([\d.+-]+|-inf)\s*dBFS/],
    ] as const;
    for (const [key, regex] of definitions) {
      const match = line.match(regex);
      if (!match) continue;
      this.seen = true;
      const value = Number(match[1]);
      this.stats[key] = Number.isFinite(value) ? value : null;
    }
  }
  finish(): LoudnessStats {
    if (!this.seen) throw new Error('No loudness measurements were returned.');
    return {
      ...this.stats,
      integrated: this.stats.truePeak === null ? null : this.stats.integrated,
    };
  }
}
