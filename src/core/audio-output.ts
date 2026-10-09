import { getFormat } from './formats';
import type { EditSettings, FormatId } from './types';
export type AudioOutput = Pick<EditSettings, 'audioSampleRate' | 'audioChannels' | 'wavDepth'>;
export function sampleRates(format: FormatId): number[] {
  if (format === 'webm') return [8000, 16000, 24000, 48000];
  return [8000, 16000, 22050, 24000, 32000, 44100, 48000, ...(['wav', 'flac', 'ogg', 'm4a', 'mp4', 'mov', 'mkv'].includes(format) ? [96000] : [])];
}
export function validateAudioOutput(edit: AudioOutput & { format: FormatId }) {
  if (edit.audioSampleRate !== null && !sampleRates(edit.format).includes(edit.audioSampleRate)) throw new Error('Choose a supported audio sample rate for this format.');
  if (edit.audioChannels !== null && ![1, 2].includes(edit.audioChannels)) throw new Error('Choose source, mono or stereo audio channels.');
  if (![16, 24, 32].includes(edit.wavDepth)) throw new Error('Choose a supported WAV bit depth.');
}
export function audioOutputArgs(edit: AudioOutput): string[] {
  return [...(edit.audioSampleRate ? ['-ar', String(edit.audioSampleRate)] : []), ...(edit.audioChannels ? ['-ac', String(edit.audioChannels)] : [])];
}
export function outputAudioCodec(edit: AudioOutput & { format: FormatId }) {
  return edit.format === 'wav' ? { 16: 'pcm_s16le', 24: 'pcm_s24le', 32: 'pcm_f32le' }[edit.wavDepth] : getFormat(edit.format).audioCodec!;
}
