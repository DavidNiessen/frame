import type { DesktopCapabilities, PreviewProxy } from '../core/hardware';
import type { SilenceOptions } from '../core/silence';
import type { EditSettings, ExportProgress, ExportResult, MediaAsset, TimeRange } from '../core/types';
import type { ProjectDocument } from '../core/project';
import type { WaveformPoint } from '../core/waveform';
import type { OutputSettings } from '../core/presets';
import type { TransitionSettings } from '../core/transitions';
export interface DesktopBridge {
  desktopCapabilities(): Promise<DesktopCapabilities>;
  previewProxy(id: string): Promise<PreviewProxy>;
  releaseProxy(id: string): Promise<void>;
  importFiles(files?: File[]): Promise<MediaAsset[]>;
  importSample(): Promise<MediaAsset[]>;
  export(id: string, settings: EditSettings, batchToken?: string): Promise<ExportResult | null>;
  saveProject(project: ProjectDocument): Promise<boolean>;
  merge(clips: { id: string; edit: EditSettings }[], settings: OutputSettings, transition?: TransitionSettings): Promise<ExportResult | null>;
  detectSilence(id: string, options: SilenceOptions): Promise<TimeRange[]>;
  previewFrame(id: string, edit: EditSettings, time: number): Promise<Uint8Array>;
  previewAudio(id: string, edit: EditSettings): Promise<Uint8Array>;
  thumbnails(id: string): Promise<Uint8Array>;
  waveform(id: string): Promise<WaveformPoint[]>;
  beginBatch(): Promise<string | null>;
  endBatch(token: string): Promise<void>;
  cancel(): void;
  release(id: string): Promise<void>;
  onProgress(callback: (progress: ExportProgress) => void): () => void;
}
declare global { interface Window { frameDesktop?: DesktopBridge } }
