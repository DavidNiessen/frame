import type { EditSettings, ExportProgress, ExportResult, MediaAsset } from '../core/types';
import type { ProjectDocument } from '../core/project';
export interface DesktopBridge {
  importFiles(files?: File[]): Promise<MediaAsset[]>;
  importSample(): Promise<MediaAsset[]>;
  export(id: string, settings: EditSettings): Promise<ExportResult | null>;
  saveProject(project: ProjectDocument): Promise<boolean>;
  cancel(): void;
  release(id: string): Promise<void>;
  onProgress(callback: (progress: ExportProgress) => void): () => void;
}
declare global { interface Window { frameDesktop?: DesktopBridge } }
