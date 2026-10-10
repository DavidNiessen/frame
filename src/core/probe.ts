import type { MediaAsset } from './types';
interface Stream {
  index: number; codec_type: string; width?: number; height?: number; duration?: string;
  channels?: number; sample_rate?: string; codec_name?: string; avg_frame_rate?: string; r_frame_rate?: string;
  disposition?: { attached_pic?: number };
  tags?: { rotate?: string };
  side_data_list?: { rotation?: number }[];
}
export interface ProbeData { error?: { string?: string }; streams?: Stream[]; format?: { duration?: string; size?: string; tags?: Record<string, unknown> } }
export function parseFrameRate(value?: string): number | undefined {
  if (!value) return;
  const parts = value.split('/');
  if (parts.length > 2) return;
  const rate = Number(parts[0]) / (parts.length === 2 ? Number(parts[1]) : 1);
  return Number.isFinite(rate) && rate > 0 && rate <= 1000 ? rate : undefined;
}
function metadata(tags?: Record<string, unknown>) {
  const allowed = new Set(['title', 'artist', 'album', 'album_artist', 'track', 'date', 'genre', 'comment', 'copyright']);
  return Object.fromEntries(Object.entries(tags ?? {}).filter(([key, value]) => allowed.has(key.toLowerCase()) && typeof value === 'string').map(([key, value]) => [key.toLowerCase(), String(value).slice(0, 2000)]));
}
export function parseProbe(data: ProbeData): Omit<MediaAsset, 'id' | 'name' | 'size' | 'previewUrl'> {
  if (data.error) throw new Error(data.error.string || 'Unable to read this media file.');
  const streams = data.streams ?? [];
  const video = streams.find(s => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const audio = streams.find(s => s.codec_type === 'audio');
  const duration = Number(data.format?.duration ?? video?.duration ?? audio?.duration);
  if (!video && !audio) throw new Error('No supported video or audio stream found.');
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('This file has no readable duration. Try another file.');
  // FFmpeg and media elements autorotate phone footage; crop in that displayed frame.
  const rotation = Number(video?.side_data_list?.find(s => s.rotation !== undefined)?.rotation ?? video?.tags?.rotate ?? 0);
  const swapped = Math.abs(rotation) % 180 === 90;
  return { kind: video ? 'video' : 'audio', duration, width: swapped ? video?.height : video?.width, height: swapped ? video?.width : video?.height,
    hasAudio: Boolean(audio), audioChannels: audio?.channels, audioSampleRate: audio?.sample_rate ? Number(audio.sample_rate) : undefined, artworkIndex: streams.find(s => s.disposition?.attached_pic)?.index,
    frameRate: parseFrameRate(video?.avg_frame_rate) ?? parseFrameRate(video?.r_frame_rate), videoCodec: video?.codec_name?.slice(0, 60), audioCodec: audio?.codec_name?.slice(0, 60), metadata: metadata(data.format?.tags) };
}
