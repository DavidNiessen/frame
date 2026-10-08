import type { FormatId, MediaKind } from './types';
export interface OutputFormat {
  id: FormatId; label: string; kind: MediaKind; mime: string; description: string;
  videoCodec?: string; audioCodec?: string; artwork: boolean;
}
// Register new output formats here; engines share the same export planner.
export const formats: OutputFormat[] = [
  { id: 'mp4', label: 'MP4', kind: 'video', mime: 'video/mp4', description: 'Best compatibility', videoCodec: 'libx264', audioCodec: 'aac', artwork: false },
  { id: 'webm', label: 'WebM', kind: 'video', mime: 'video/webm', description: 'Made for the web', videoCodec: 'libvpx-vp9', audioCodec: 'libopus', artwork: false },
  { id: 'mov', label: 'MOV', kind: 'video', mime: 'video/quicktime', description: 'QuickTime video', videoCodec: 'libx264', audioCodec: 'aac', artwork: false },
  { id: 'mkv', label: 'MKV', kind: 'video', mime: 'video/x-matroska', description: 'Flexible container', videoCodec: 'libx264', audioCodec: 'aac', artwork: false },
  { id: 'gif', label: 'GIF', kind: 'video', mime: 'image/gif', description: 'Animated, no audio', artwork: false },
  { id: 'mp3', label: 'MP3', kind: 'audio', mime: 'audio/mpeg', description: 'Everywhere audio', audioCodec: 'libmp3lame', artwork: true },
  { id: 'wav', label: 'WAV', kind: 'audio', mime: 'audio/wav', description: 'Uncompressed audio', audioCodec: 'pcm_s16le', artwork: false },
  { id: 'flac', label: 'FLAC', kind: 'audio', mime: 'audio/flac', description: 'Lossless compression', audioCodec: 'flac', artwork: true },
  { id: 'ogg', label: 'OGG', kind: 'audio', mime: 'audio/ogg', description: 'Open, compact audio', audioCodec: 'libvorbis', artwork: false },
  { id: 'm4a', label: 'M4A', kind: 'audio', mime: 'audio/mp4', description: 'AAC audio', audioCodec: 'aac', artwork: true },
];
export const getFormat = (id: FormatId) => {
  const result = formats.find(f => f.id === id);
  if (!result) throw new Error('Unsupported output format.');
  return result;
};
export const availableFormats = (asset: { kind: MediaKind; hasAudio: boolean }) =>
  formats.filter(f => f.kind === 'video' ? asset.kind === 'video' : asset.hasAudio);
