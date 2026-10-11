import { timedFilter } from './timed-adjustments';
import type { EditSettings, MediaAsset } from './types';
export function validateAudioEffects(edit: EditSettings) {
  if (typeof edit.normalizeLoudness !== 'boolean' || typeof edit.reduceNoise !== 'boolean')
    throw new Error('Invalid audio cleanup settings.');
  if (!Number.isFinite(edit.targetLufs) || edit.targetLufs < -30 || edit.targetLufs > -5)
    throw new Error('Loudness target must be between -30 and -5 LUFS.');
  if (
    !Number.isFinite(edit.noiseStrength) ||
    edit.noiseStrength < 1 ||
    edit.noiseStrength > 30 ||
    !Number.isFinite(edit.noiseFloor) ||
    edit.noiseFloor < -80 ||
    edit.noiseFloor > -20
  )
    throw new Error('Choose a valid noise reduction amount and floor.');
  if (
    !edit.equalizer ||
    [edit.equalizer.bass, edit.equalizer.mid, edit.equalizer.treble].some(
      (g) => !Number.isFinite(g) || Math.abs(g) > 12,
    )
  )
    throw new Error('Equalizer gain must be between -12 and 12 dB.');
}
export function cleanupFilters(
  edit: EditSettings,
  asset?: MediaAsset,
  outputSpace = false,
): string[] {
  const filters: string[] = [];
  if (edit.reduceNoise)
    filters.push(
      timedFilter(
        `afftdn=nr=${edit.noiseStrength}:nf=${edit.noiseFloor}`,
        edit,
        edit.effectRanges?.noise,
        outputSpace,
      ),
    );
  if (edit.equalizer.bass)
    filters.push(
      timedFilter(
        `bass=g=${edit.equalizer.bass}:f=100`,
        edit,
        edit.effectRanges?.equalizer,
        outputSpace,
      ),
    );
  if (edit.equalizer.mid)
    filters.push(
      timedFilter(
        `equalizer=f=1000:t=q:w=1:g=${edit.equalizer.mid}`,
        edit,
        edit.effectRanges?.equalizer,
        outputSpace,
      ),
    );
  if (edit.equalizer.treble)
    filters.push(
      timedFilter(
        `treble=g=${edit.equalizer.treble}:f=8000`,
        edit,
        edit.effectRanges?.equalizer,
        outputSpace,
      ),
    );
  if (edit.normalizeLoudness) {
    const layout =
      (
        {
          1: 'mono',
          2: 'stereo',
          3: '2.1',
          4: 'quad',
          5: '5.0',
          6: '5.1',
          7: '6.1',
          8: '7.1',
        } as Record<number, string>
      )[asset?.audioChannels ?? 2] ?? 'stereo';
    filters.push(
      `aformat=channel_layouts=${layout}`,
      `loudnorm=I=${edit.targetLufs}:TP=-1:LRA=11`,
      'aresample=48000',
      `aformat=channel_layouts=${layout}`,
    );
  }
  return filters;
}
