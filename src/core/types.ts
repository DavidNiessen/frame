import { defaultRetouch, type RetouchSettings } from './retouch';
import {
  defaultImageMetadata,
  type ImageMetadataOutput,
  type ImageSourceMetadata,
} from './image-metadata';
import type { ShapeSettings } from './shapes';
import { defaultCurves, type Curves } from './curves';
import { defaultImageResize, type ImageResize } from './image-resize';
import type { ImageLayerStack } from './image-layers';
import { defaultPainting, type PaintingSettings } from './painting';
import { defaultVisual, type VisualSettings } from './visual-settings';
import { defaultImageOutput, type ImageOutput } from './image-settings';
import type { EffectRanges } from './timed-adjustments';
import type { EffectInstance } from './effect-instances';
import type { EffectId } from './effect-ids';
import type { MediaTagOverrides } from './media-tags';
import type { AudioLayer } from './audio-layers';
import type { LoudnessStats } from './loudness';
import type { SceneOptions, SceneScan } from './scenes';
import type { ContactSheetOptions } from './contact-sheet';
import type { LegacyChapterPoint } from './legacy-chapters';
import type { TimelineClip } from './clips';
import type { UrlImportOptions } from './online-media';
import {
  parseAcceleration,
  type Acceleration,
  type DesktopCapabilities,
  type PreviewProxy,
} from './hardware';
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
export type MediaKind = 'video' | 'audio' | 'image';
export type FormatId =
  | 'mp4'
  | 'webm'
  | 'mov'
  | 'mkv'
  | 'gif'
  | 'mp3'
  | 'wav'
  | 'flac'
  | 'ogg'
  | 'm4a'
  | 'png'
  | 'jpeg'
  | 'webp'
  | 'bmp'
  | 'tiff';
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
  imageMetadata?: ImageSourceMetadata;
  artworkIndex?: number;
  previewUrl: string;
  relativePath?: string;
  fingerprint?: string;
}
interface ImportIssue {
  name: string;
  message: string;
}
export interface ImportReport {
  assets: MediaAsset[];
  issues: ImportIssue[];
  skipped: number;
  folderName?: string;
}
export interface BatchOptions {
  conversion?: boolean;
  keepFolders?: boolean;
  namingTemplate?: string;
  order?: string[];
}
export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface TimeRange {
  start: number;
  end: number;
}
export interface EditSettings {
  imageLayers?: ImageLayerStack;
  curves?: Curves;
  shape?: ShapeSettings | null;
  retouch?: RetouchSettings;
  imageResize?: ImageResize;
  imageMetadata?: ImageMetadataOutput;
  imageOutput?: ImageOutput;
  visual?: VisualSettings;
  painting?: PaintingSettings;
  addedEffects?: EffectId[];
  effectInstances?: EffectInstance[];
  effectRanges?: EffectRanges;
  silenceOptions?: SilenceOptions;
  audioLayers?: AudioLayer[];
  audioMixProtectPeaks?: boolean;
  audioDucking?: boolean;
  clips?: TimelineClip[];
  /** Read-only chapter points imported from older Frame projects. */
  markers?: LegacyChapterPoint[];
  color: ColorSettings;
  geometry: Geometry;
  overlays: Overlays;
  subtitles: Subtitles;
  start: number;
  end: number;
  volume: number;
  speed: number;
  preservePitch: boolean;
  normalizeLoudness: boolean;
  targetLufs: number;
  reduceNoise: boolean;
  noiseStrength: number;
  noiseFloor: number;
  equalizer: { bass: number; mid: number; treble: number };
  audioFadeIn: number;
  audioFadeOut: number;
  videoFadeIn: number;
  videoFadeOut: number;
  cuts: TimeRange[];
  splits: number[];
  crop: Crop | null;
  format: FormatId;
  quality: 'high' | 'balanced' | 'small';
  acceleration: Acceleration;
  targetSizeMb: number | null;
  videoBitrate: number | null;
  audioBitrate: number;
  audioSampleRate: number | null;
  audioChannels: number | null;
  wavDepth: 16 | 24 | 32;
  fps: number;
  gifLoop: number;
  gifColors: number;
  gifDither: 'sierra2_4a' | 'bayer' | 'none';
  gifWidth: number | null;
  outputTags?: MediaTagOverrides;
  includeChapters?: boolean;
  customArtwork?: string | null;
  includeArtwork: boolean;
  keepMetadata: boolean;
}
export interface ExportProgress {
  ratio: number;
  message: string;
}
export interface ExportResult {
  name: string;
  url?: string;
  path?: string;
  size: number;
  relativePath?: string;
}
export interface MediaEngine {
  platform: 'desktop' | 'web';
  saveWorkspace?(
    document: import('./autosave').AutosaveDocument,
    assetIds: string[],
  ): Promise<void>;
  recoverWorkspace?(
    onProgress: (p: ExportProgress) => void,
  ): Promise<import('./workspace-recovery').WorkspaceRecovery | null>;
  discardWorkspace?(): Promise<void>;
  desktopCapabilities?(onProgress: (p: ExportProgress) => void): Promise<DesktopCapabilities>;
  previewProxy?(asset: MediaAsset, onProgress: (p: ExportProgress) => void): Promise<PreviewProxy>;
  releaseProxy?(id: string): Promise<void>;
  joinedPreview?(
    asset: MediaAsset,
    ranges: TimeRange[],
    progress: (p: ExportProgress) => void,
  ): Promise<PreviewProxy>;
  effectPreview?(
    asset: MediaAsset,
    edit: EditSettings,
    progress: (p: ExportProgress) => void,
  ): Promise<PreviewProxy>;
  cancelJoinedPreview?(): void;
  importFiles(files?: File[], onProgress?: (p: ExportProgress) => void): Promise<ImportReport>;
  importUrl(
    url: string,
    onProgress?: (p: ExportProgress) => void,
    options?: UrlImportOptions,
  ): Promise<ImportReport>;
  importFolder?(onProgress?: (p: ExportProgress) => void): Promise<ImportReport>;
  importLaunch?(id: string, onProgress?: (p: ExportProgress) => void): Promise<ImportReport>;
  export(
    asset: MediaAsset,
    settings: EditSettings,
    onProgress: (p: ExportProgress) => void,
    batchToken?: string,
  ): Promise<ExportResult | null>;
  merge(
    clips: MediaClip[],
    output: OutputSettings,
    onProgress: (p: ExportProgress) => void,
    transition?: TransitionSettings,
  ): Promise<ExportResult | null>;
  appendVideo(
    base: MediaAsset,
    source: MediaAsset,
    onProgress: (p: ExportProgress) => void,
  ): Promise<MediaAsset>;
  extractAudio(asset: MediaAsset, onProgress: (p: ExportProgress) => void): Promise<MediaAsset>;
  detectSilence(
    asset: MediaAsset,
    options: SilenceOptions,
    onProgress: (p: ExportProgress) => void,
  ): Promise<TimeRange[]>;
  previewFrame(
    asset: MediaAsset,
    edit: EditSettings,
    time: number,
    onProgress: (p: ExportProgress) => void,
  ): Promise<string>;
  previewAudio(
    asset: MediaAsset,
    edit: EditSettings,
    onProgress: (p: ExportProgress) => void,
  ): Promise<string>;
  measureLoudness(
    asset: MediaAsset,
    edit: EditSettings,
    onProgress: (p: ExportProgress) => void,
  ): Promise<LoudnessStats>;
  detectScenes(
    asset: MediaAsset,
    options: SceneOptions,
    onProgress: (p: ExportProgress) => void,
  ): Promise<SceneScan>;
  contactSheet(
    asset: MediaAsset,
    edit: EditSettings,
    options: ContactSheetOptions,
    onProgress: (p: ExportProgress) => void,
  ): Promise<string>;
  cancelWaveform?(): void;
  waveform(asset: MediaAsset, onProgress: (p: ExportProgress) => void): Promise<WaveformPoint[]>;
  beginBatch(options?: BatchOptions): Promise<string | null>;
  endBatch(token: string): Promise<void>;
  openBatchFolder?(): Promise<void>;
  cancel(): void;
  release(asset: MediaAsset): Promise<void>;
}
export { supportedExtensions };
export const acceptMedia = supportedExtensions.map((ext) => `.${ext}`).join(',');
export function defaultSettings(asset: MediaAsset): EditSettings {
  return {
    shape: null,
    retouch: defaultRetouch(),
    curves: defaultCurves(),
    imageResize: defaultImageResize(),
    imageMetadata: defaultImageMetadata(),
    imageOutput: defaultImageOutput(),
    visual: defaultVisual(),
    painting: defaultPainting(),
    effectInstances: [],
    silenceOptions: { threshold: -35, minimum: 0.5, padding: 0.1 },
    audioLayers: [],
    audioMixProtectPeaks: true,
    audioDucking: false,
    markers: [],
    clips: undefined,
    color: defaultColor(),
    geometry: defaultGeometry(),
    overlays: defaultOverlays(),
    subtitles: { mode: 'none', cues: [] },
    start: 0,
    end: asset.duration,
    volume: 1,
    speed: 1,
    preservePitch: true,
    normalizeLoudness: false,
    targetLufs: -16,
    reduceNoise: false,
    noiseStrength: 12,
    noiseFloor: -50,
    equalizer: { bass: 0, mid: 0, treble: 0 },
    audioFadeIn: 0,
    audioFadeOut: 0,
    videoFadeIn: 0,
    videoFadeOut: 0,
    cuts: [],
    splits: [],
    crop: null,
    format: asset.kind === 'image' ? 'png' : asset.kind === 'audio' ? 'mp3' : 'mp4',
    quality: 'balanced',
    acceleration: parseAcceleration(undefined),
    targetSizeMb: null,
    videoBitrate: null,
    audioBitrate: 192,
    audioSampleRate: null,
    audioChannels: null,
    wavDepth: 16,
    fps: 15,
    gifLoop: 0,
    gifColors: 256,
    gifDither: 'sierra2_4a',
    gifWidth: null,
    outputTags: {},
    includeChapters: false,
    customArtwork: null,
    includeArtwork: true,
    keepMetadata: true,
  };
}
