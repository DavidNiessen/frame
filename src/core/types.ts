import type { AudioLayer } from './audio-layers';
import type { LoudnessStats } from './loudness';
import type { SceneOptions, SceneScan } from './scenes';
import type { ContactSheetOptions } from './contact-sheet';
import type { TimelineMarker } from './markers';
import type { TimelineClip } from './clips';
import type { UrlImportOptions } from './youtube';
import { parseAcceleration, type Acceleration, type DesktopCapabilities, type PreviewProxy } from './hardware';
import type { SilenceOptions } from './silence';
import { defaultColor, type ColorSettings } from './color';
import { defaultGeometry, type Geometry } from './geometry';
import type { Overlays } from './overlays';
import { defaultOverlays } from './overlays';
import type { Subtitles } from './subtitles';
import type { WaveformPoint } from './waveform';
import type { MediaClip } from './composition';
import type { OutputSettings } from './presets';
import type { TransitionSettings } from './transitions';
import supportedExtensions from './media-extensions.json';
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
  audioChannels?: number;
  audioSampleRate?: number;
  frameRate?: number;
  videoCodec?: string;
  audioCodec?: string;
  metadata?: Record<string, string>;
  artworkIndex?: number;
  previewUrl: string;
  relativePath?: string;
}
export interface ImportIssue { name: string; message: string }
export interface ImportReport { assets: MediaAsset[]; issues: ImportIssue[]; skipped: number; folderName?: string }
export interface BatchOptions { conversion?: boolean; keepFolders?: boolean; namingTemplate?: string; order?: string[] }
export interface Crop { x: number; y: number; width: number; height: number }
export interface TimeRange { start: number; end: number }
export interface EditSettings {
  audioLayers?: AudioLayer[];
  audioMixProtectPeaks?: boolean;
  clips?: TimelineClip[];
  markers?: TimelineMarker[];
  color: ColorSettings;
  geometry: Geometry;
  overlays: Overlays;
  subtitles: Subtitles;
  start: number;
  end: number;
  volume: number;
  speed: number;
  preservePitch: boolean;
  normalizeLoudness: boolean; targetLufs: number; reduceNoise: boolean; noiseStrength: number; noiseFloor: number; equalizer: { bass: number; mid: number; treble: number };
  audioFadeIn: number; audioFadeOut: number; videoFadeIn: number; videoFadeOut: number;
  cuts: TimeRange[];
  splits: number[];
  crop: Crop | null;
  format: FormatId;
  quality: 'high' | 'balanced' | 'small';
  acceleration: Acceleration;
  targetSizeMb: number | null;
  videoBitrate: number | null;
  audioBitrate: number;
  audioSampleRate: number | null; audioChannels: number | null; wavDepth: 16 | 24 | 32;
  fps: number;
  gifLoop: number; gifColors: number; gifDither: 'sierra2_4a' | 'bayer' | 'none'; gifWidth: number | null;
  includeChapters?: boolean;
  includeArtwork: boolean;
  keepMetadata: boolean;
}
export interface ExportProgress { ratio: number; message: string }
export interface ExportResult { name: string; url?: string; path?: string; size: number; relativePath?: string }
export interface MediaEngine {
  platform: 'desktop' | 'web';
  desktopCapabilities?(onProgress: (p: ExportProgress) => void): Promise<DesktopCapabilities>;
  previewProxy?(asset: MediaAsset, onProgress: (p: ExportProgress) => void): Promise<PreviewProxy>;
  releaseProxy?(id: string): Promise<void>;
  importFiles(files?: File[], onProgress?: (p: ExportProgress) => void): Promise<ImportReport>;
  importUrl(url: string, onProgress?: (p: ExportProgress) => void, options?: UrlImportOptions): Promise<ImportReport>;
  importFolder?(onProgress?: (p: ExportProgress) => void): Promise<ImportReport>;
  importLaunch?(id: string, onProgress?: (p: ExportProgress) => void): Promise<ImportReport>;
  importSample(): Promise<ImportReport>;
  export(asset: MediaAsset, settings: EditSettings, onProgress: (p: ExportProgress) => void, batchToken?: string): Promise<ExportResult | null>;
  merge(clips: MediaClip[], output: OutputSettings, onProgress: (p: ExportProgress) => void, transition?: TransitionSettings): Promise<ExportResult | null>;
  detectSilence(asset: MediaAsset, options: SilenceOptions, onProgress: (p: ExportProgress) => void): Promise<TimeRange[]>;
  previewFrame(asset: MediaAsset, edit: EditSettings, time: number, onProgress: (p: ExportProgress) => void): Promise<string>;
  previewAudio(asset: MediaAsset, edit: EditSettings, onProgress: (p: ExportProgress) => void): Promise<string>;
  measureLoudness(asset: MediaAsset, edit: EditSettings, onProgress: (p: ExportProgress) => void): Promise<LoudnessStats>;
  detectScenes(asset: MediaAsset, options: SceneOptions, onProgress: (p: ExportProgress) => void): Promise<SceneScan>;
  contactSheet(asset: MediaAsset, edit: EditSettings, options: ContactSheetOptions, onProgress: (p: ExportProgress) => void): Promise<string>;
  thumbnails(asset: MediaAsset, onProgress: (p: ExportProgress) => void): Promise<string>;
  cancelWaveform?(): void;
  waveform(asset: MediaAsset, onProgress: (p: ExportProgress) => void): Promise<WaveformPoint[]>;
  beginBatch(options?: BatchOptions): Promise<string | null>;
  endBatch(token: string): Promise<void>;
  openBatchFolder?(): Promise<void>;
  cancel(): void;
  release(asset: MediaAsset): Promise<void>;
}
export { supportedExtensions };
export const acceptMedia = supportedExtensions.map(ext => `.${ext}`).join(',');
export function defaultSettings(asset: MediaAsset): EditSettings {
  return { audioLayers: [], audioMixProtectPeaks: true, markers: [], clips: undefined, color: defaultColor(), geometry: defaultGeometry(), overlays: defaultOverlays(), subtitles: { mode: 'none', cues: [] }, start: 0, end: asset.duration, volume: 1, speed: 1, preservePitch: true, normalizeLoudness: false, targetLufs: -16, reduceNoise: false, noiseStrength: 12, noiseFloor: -50, equalizer: { bass: 0, mid: 0, treble: 0 }, audioFadeIn: 0, audioFadeOut: 0, videoFadeIn: 0, videoFadeOut: 0, cuts: [], splits: [], crop: null,
    format: asset.kind === 'audio' ? 'mp3' : 'mp4', quality: 'balanced',
    acceleration: parseAcceleration(undefined), targetSizeMb: null, videoBitrate: null, audioBitrate: 192, audioSampleRate: null, audioChannels: null, wavDepth: 16, fps: 15, gifLoop: 0, gifColors: 256, gifDither: 'sierra2_4a', gifWidth: null, includeChapters: false, includeArtwork: true, keepMetadata: true };
}
