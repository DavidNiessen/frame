import { captionItems } from './caption-items';
import { captionLimit, extraInstances } from './effect-instances';
import { parseAnalysisOptions } from './analysis-data';
import { parseSubtitles, type SubtitleCue } from './subtitles';
import type { EditSettings } from './types';
export const speechModel = {
  id: 'onnx-community/whisper-tiny',
  revision: 'ff4177021cc41f7db950912b73ea4fdf7d01d8e7',
  downloadMegabytes: 42,
};
export const speechLanguages = [
  'auto',
  'english',
  'german',
  'spanish',
  'french',
  'italian',
  'portuguese',
  'dutch',
  'japanese',
  'korean',
  'chinese',
] as const;
export interface TranscriptionOptions {
  start: number;
  end: number;
  language: (typeof speechLanguages)[number];
}
export interface SpeechChunk {
  text: string;
  timestamp: [number | null, number | null];
}
export function parseTranscriptionOptions(
  value: unknown,
  edit: EditSettings,
): TranscriptionOptions {
  const options = value as TranscriptionOptions;
  parseAnalysisOptions({ ...options, kind: 'speech' }, edit);
  if (!speechLanguages.includes(options.language))
    throw new Error('Choose a supported speech language.');
  return { start: options.start, end: options.end, language: options.language };
}
/** FFmpeg prepares uncompressed mono PCM16 WAV, so decoding requires no browser audio context. */
export function speechSamples(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    text = (at: number, length: number) => String.fromCharCode(...bytes.subarray(at, at + length));
  if (bytes.length < 44 || text(0, 4) !== 'RIFF' || text(8, 4) !== 'WAVE')
    throw new Error('Invalid speech audio.');
  let pcm = false,
    data: Uint8Array | undefined;
  for (let at = 12; at + 8 <= bytes.length;) {
    const length = view.getUint32(at + 4, true),
      body = at + 8;
    if (body + length > bytes.length) throw new Error('Incomplete speech audio.');
    if (text(at, 4) === 'fmt ')
      pcm =
        length >= 16 &&
        view.getUint16(body, true) === 1 &&
        view.getUint16(body + 2, true) === 1 &&
        view.getUint32(body + 4, true) === 16000 &&
        view.getUint16(body + 14, true) === 16;
    if (text(at, 4) === 'data') data = bytes.subarray(body, body + length);
    at = body + length + (length % 2);
  }
  if (!pcm || !data?.length || data.length % 2 || data.length > 16000 * 600 * 2)
    throw new Error('Speech audio must be mono 16 kHz PCM16, up to 10 minutes.');
  const samples = new Float32Array(data.length / 2),
    pcmView = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i < samples.length; i++) samples[i] = pcmView.getInt16(i * 2, true) / 32768;
  return samples;
}
/** Segment timestamps refer to the edited output; they must never be interpreted as source time. */
export function transcriptionCues(
  chunks: SpeechChunk[],
  start: number,
  duration: number,
): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index],
      text = chunk.text.trim().replace(/\s+/g, ' '),
      from = chunk.timestamp?.[0],
      to = chunk.timestamp?.[1] ?? chunks[index + 1]?.timestamp?.[0] ?? duration;
    if (!text || !Number.isFinite(from) || !Number.isFinite(to)) continue;
    const a = Math.max(0, from!),
      b = Math.min(duration, to!);
    if (b - a < 0.05) continue;
    const groups: string[] = [];
    let line = '';
    for (const word of text.split(' ')) {
      if (line && (line + ' ' + word).length > 70) {
        groups.push(line);
        line = '';
      }
      line += (line ? ' ' : '') + word;
    }
    if (line) groups.push(line);
    let elapsed = 0;
    const characters = groups.reduce((sum, value) => sum + value.length, 0);
    for (const line of groups) {
      const end = elapsed + (line.length / characters) * (b - a);
      if (end - elapsed >= 0.05)
        cues.push({ start: start + a + elapsed, end: start + a + end, text: line });
      elapsed = end;
    }
  }
  return parseSubtitles({ mode: 'burn', cues }).cues;
}
export function addTranscription(edit: EditSettings, cues: SubtitleCue[]): Partial<EditSettings> {
  const parsed = parseSubtitles({ mode: 'burn', cues }).cues;
  if (captionItems(edit).length + parsed.length > captionLimit)
    throw new Error(
      'The generated captions exceed the 1,000-caption project limit. Transcribe a shorter selection.',
    );
  return {
    addedEffects: [...new Set([...(edit.addedEffects ?? []), 'captions' as const])],
    effectInstances: [
      ...extraInstances(edit),
      ...parsed.map((cue) => ({
        id: crypto.randomUUID(),
        effect: 'captions' as const,
        timeSpace: 'output' as const,
        settings: { subtitles: { mode: 'burn' as const, cues: [cue] } },
      })),
    ],
  };
}
