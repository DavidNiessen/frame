import type { EditSettings, ExportProgress, ExportResult, MediaAsset } from '../core/types';
import type { ProjectDocument } from '../core/project';
import type { WaveformPoint } from '../core/waveform';
export interface DesktopBridge {
  importFiles(files?: File[]): Promise<MediaAsset[]>;
  importSample(): Promise<MediaAsset[]>;
  export(id: string, settings: EditSettings, batchToken?: string): Promise<ExportResult | null>;
  saveProject(project: ProjectDocument): Promise<boolean>;
  waveform(id: string): Promise<WaveformPoint[]>;
  beginBatch(): Promise<string | null>;
  endBatch(token: string): Promise<void>;
  cancel(): void;
  release(id: string): Promise<void>;
  onProgress(callback: (progress: ExportProgress) => void): () => void;
}
declare global { interface Window { frameDesktop?: DesktopBridge } }
