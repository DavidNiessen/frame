import type { MediaAsset } from './types';
interface Stream {
  index: number; codec_type: string; width?: number; height?: number; duration?: string;
  disposition?: { attached_pic?: number };
}
export interface ProbeData { streams?: Stream[]; format?: { duration?: string; size?: string } }
export function parseProbe(data: ProbeData): Omit<MediaAsset, 'id' | 'name' | 'size' | 'previewUrl'> {
  const streams = data.streams ?? [];
  const video = streams.find(s => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const audio = streams.find(s => s.codec_type === 'audio');
  const duration = Number(data.format?.duration ?? video?.duration ?? audio?.duration);
  if (!video && !audio) throw new Error('No supported video or audio stream found.');
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('This file has no readable duration. Try another file.');
  return { kind: video ? 'video' : 'audio', duration, width: video?.width, height: video?.height,
    hasAudio: Boolean(audio), artworkIndex: streams.find(s => s.disposition?.attached_pic)?.index };
}
