import { sampleRates, type AudioOutput } from '../core/audio-output';
import type { FormatId } from '../core/types';
export function AudioOutputControls({
  settings,
  update,
}: {
  settings: AudioOutput & { format: FormatId };
  update: (patch: Partial<AudioOutput>) => void;
}) {
  return (
    <div className="audio-output-controls">
      <label className="stacked-label">
        Sample rate
        <select
          aria-label="Audio sample rate"
          value={settings.audioSampleRate ?? ''}
          onChange={(event) =>
            update({ audioSampleRate: event.target.value ? Number(event.target.value) : null })
          }
        >
          <option value="">Automatic</option>
          {sampleRates(settings.format).map((rate) => (
            <option value={rate} key={rate}>
              {rate / 1000} kHz
            </option>
          ))}
        </select>
      </label>
      <label className="stacked-label">
        Channels
        <select
          aria-label="Audio channels"
          value={settings.audioChannels ?? ''}
          onChange={(event) =>
            update({ audioChannels: event.target.value ? Number(event.target.value) : null })
          }
        >
          <option value="">Automatic</option>
          <option value="1">Mono</option>
          <option value="2">Stereo</option>
        </select>
      </label>
      {settings.format === 'wav' && (
        <label className="stacked-label">
          WAV precision
          <select
            aria-label="WAV bit depth"
            value={settings.wavDepth}
            onChange={(event) =>
              update({ wavDepth: Number(event.target.value) as AudioOutput['wavDepth'] })
            }
          >
            <option value="16">16-bit integer</option>
            <option value="24">24-bit integer</option>
            <option value="32">32-bit float</option>
          </select>
        </label>
      )}
      <p className="field-note">
        Resampling or increasing precision cannot restore detail missing from the original.
      </p>
    </div>
  );
}
