import type { EditSettings, ExportProgress, ExportResult, MediaAsset } from '../core/types';
export interface DesktopBridge {
  importFiles(files?: File[]): Promise<MediaAsset[]>;
  importSample(): Promise<MediaAsset[]>;
  export(id: string, settings: EditSettings): Promise<ExportResult | null>;
  cancel(): void;
  release(id: string): Promise<void>;
  onProgress(callback: (progress: ExportProgress) => void): () => void;
}
declare global { interface Window { frameDesktop?: DesktopBridge } }
