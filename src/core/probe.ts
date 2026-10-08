import type { MediaAsset } from './types';
interface Stream {
  index: number; codec_type: string; width?: number; height?: number; duration?: string;
  channels?: number; sample_rate?: string;
  disposition?: { attached_pic?: number };
  tags?: { rotate?: string };
  side_data_list?: { rotation?: number }[];
}
export interface ProbeData { error?: { string?: string }; streams?: Stream[]; format?: { duration?: string; size?: string } }
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
    hasAudio: Boolean(audio), audioChannels: audio?.channels, audioSampleRate: audio?.sample_rate ? Number(audio.sample_rate) : undefined, artworkIndex: streams.find(s => s.disposition?.attached_pic)?.index };
}
