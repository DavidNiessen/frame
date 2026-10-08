import type { WaveformPoint } from './waveform';
import type { MediaClip } from './composition';
import type { OutputSettings } from './presets';
export type MediaKind = 'video' | 'audio';
export type FormatId = 'mp4' | 'webm' | 'mov' | 'mkv' | 'gif' | 'mp3' | 'wav' | 'flac' | 'ogg' | 'm4a';
export interface MediaAsset {
  id: string;
  name: string;
  size: number;
  kind: MediaKind;
  duration: number;
  width?: number;
  height?: number;
  hasAudio: boolean;
  artworkIndex?: number;
  previewUrl: string;
}
export interface Crop { x: number; y: number; width: number; height: number }
export interface TimeRange { start: number; end: number }
export interface EditSettings {
  start: number;
  end: number;
  volume: number;
  speed: number;
  preservePitch: boolean;
  cuts: TimeRange[];
  splits: number[];
  crop: Crop | null;
  format: FormatId;
  quality: 'high' | 'balanced' | 'small';
  videoBitrate: number | null;
  audioBitrate: number;
  fps: number;
  includeArtwork: boolean;
  keepMetadata: boolean;
}
export interface ExportProgress { ratio: number; message: string }
export interface ExportResult { name: string; url?: string; path?: string; size: number }
export interface MediaEngine {
  platform: 'desktop' | 'web';
  importFiles(files?: File[]): Promise<MediaAsset[]>;
  importSample(): Promise<MediaAsset[]>;
  export(asset: MediaAsset, settings: EditSettings, onProgress: (p: ExportProgress) => void, batchToken?: string): Promise<ExportResult | null>;
  merge(clips: MediaClip[], output: OutputSettings, onProgress: (p: ExportProgress) => void): Promise<ExportResult | null>;
  thumbnails(asset: MediaAsset, onProgress: (p: ExportProgress) => void): Promise<string>;
  waveform(asset: MediaAsset, onProgress: (p: ExportProgress) => void): Promise<WaveformPoint[]>;
  beginBatch(): Promise<string | null>;
  endBatch(token: string): Promise<void>;
  cancel(): void;
  release(asset: MediaAsset): Promise<void>;
}
export const supportedExtensions = ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'gif', 'mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'opus', 'aiff'];
export const acceptMedia = supportedExtensions.map(ext => `.${ext}`).join(',');
export function defaultSettings(asset: MediaAsset): EditSettings {
  return { start: 0, end: asset.duration, volume: 1, speed: 1, preservePitch: true, cuts: [], splits: [], crop: null,
    format: asset.kind === 'audio' ? 'mp3' : 'mp4', quality: 'balanced',
    videoBitrate: null, audioBitrate: 192, fps: 15, includeArtwork: true, keepMetadata: true };
}
