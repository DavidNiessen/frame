import type { TranscriptionOptions } from '../core/transcription';
import type { SubtitleCue } from '../core/subtitles';
import type { AnalysisOptions } from '../core/analysis-data';
import type { ExportHistoryBridge } from '../core/export-history';
import type { UpdateBridge } from '../core/app-updates';
import type { LoudnessStats } from '../core/loudness';
import type { WatchFolderDraft, WatchStatus } from '../core/watch-folders';
import type { SceneOptions, SceneScan } from '../core/scenes';
import type { CompletionSummary, NotificationPreference } from '../core/completion-notifications';
import type { ContactSheetOptions } from '../core/contact-sheet';
import type { UrlImportOptions } from '../core/online-media';
import type { DesktopCapabilities, PreviewProxy } from '../core/hardware';
import type { SilenceOptions } from '../core/silence';
import type {
  BatchOptions,
  EditSettings,
  ExportProgress,
  ExportResult,
  ImportReport,
  MediaAsset,
  TimeRange,
} from '../core/types';
import type { ProjectDocument } from '../core/project';
import type { WaveformPoint } from '../core/waveform';
import type { OutputSettings } from '../core/presets';
import type { TransitionSettings } from '../core/transitions';
import type { DesktopLaunchRequest } from '../core/launch';
import type { ShellIntegrationStatus } from '../core/system-integration';
import type { WindowAction, WindowState } from '../core/window-controls';
export interface DesktopBridge extends ExportHistoryBridge, UpdateBridge {
  installedFonts(): Promise<string[]>;
  saveWorkspace(
    document: import('../core/autosave').AutosaveDocument,
    assetIds: string[],
  ): Promise<void>;
  recoverWorkspace(): Promise<import('../core/workspace-recovery').WorkspaceRecovery | null>;
  discardWorkspace(): Promise<void>;
  watchFoldersStatus(): Promise<WatchStatus>;
  chooseWatchFolders(): Promise<{ input: string; output: string } | null>;
  addWatchFolder(draft: WatchFolderDraft): Promise<WatchStatus>;
  setWatchFolderEnabled(id: string, enabled: boolean): Promise<WatchStatus>;
  removeWatchFolder(id: string): Promise<WatchStatus>;
  retryWatchFolder(id: string): Promise<WatchStatus>;
  openWatchFolderOutput(id: string): Promise<void>;
  miniConversion: boolean;
  readonly nativeWindowControls?: boolean;
  notificationPreference(): Promise<NotificationPreference>;
  setCompletionNotifications(enabled: boolean): Promise<NotificationPreference>;
  notifyCompletion(summary: CompletionSummary): Promise<void>;
  windowState(): Promise<WindowState>;
  setWindowChrome(expanded: boolean): Promise<WindowState>;
  windowAction(action: WindowAction): Promise<void>;
  onWindowState(callback: (state: WindowState) => void): () => void;
  setMiniExpanded(expanded: boolean, reducedMotion: boolean): Promise<void>;
  finishMini(): Promise<boolean>;
  dismissMini(): Promise<void>;
  shellIntegrationStatus(): Promise<ShellIntegrationStatus>;
  setShellIntegration(enabled: boolean): Promise<ShellIntegrationStatus>;
  changeShellCertificate(action: 'trust' | 'revoke'): Promise<ShellIntegrationStatus>;
  nextLaunch(): Promise<DesktopLaunchRequest | null>;
  importLaunch(id: string): Promise<ImportReport>;
  onLaunchAvailable(callback: () => void): () => void;
  desktopCapabilities(): Promise<DesktopCapabilities>;
  previewProxy(id: string): Promise<PreviewProxy>;
  releaseProxy(id: string): Promise<void>;
  joinedPreview(id: string, ranges: TimeRange[]): Promise<PreviewProxy>;
  effectPreview(id: string, edit: EditSettings): Promise<PreviewProxy>;
  cancelJoinedPreview(): void;
  onJoinedPreviewProgress(callback: (progress: ExportProgress) => void): () => void;
  importFiles(files?: File[]): Promise<ImportReport>;
  importUrl(url: string, options?: UrlImportOptions): Promise<ImportReport>;
  importFolder(): Promise<ImportReport>;
  export(id: string, settings: EditSettings, batchToken?: string): Promise<ExportResult | null>;
  saveProject(project: ProjectDocument): Promise<boolean>;
  merge(
    clips: { id: string; edit: EditSettings }[],
    settings: OutputSettings,
    transition?: TransitionSettings,
  ): Promise<ExportResult | null>;
  appendVideo(id: string, addedId: string): Promise<MediaAsset>;
  extractAudio(id: string): Promise<MediaAsset>;
  detectSilence(id: string, options: SilenceOptions): Promise<TimeRange[]>;
  transcribe(id: string, edit: EditSettings, options: TranscriptionOptions): Promise<SubtitleCue[]>;
  analysisData(id: string, edit: EditSettings, options: AnalysisOptions): Promise<Uint8Array>;
  previewFrame(id: string, edit: EditSettings, time: number): Promise<Uint8Array>;
  previewAudio(id: string, edit: EditSettings): Promise<Uint8Array>;
  measureLoudness(id: string, edit: EditSettings): Promise<LoudnessStats>;
  detectScenes(id: string, options: SceneOptions): Promise<SceneScan>;
  contactSheet(id: string, edit: EditSettings, options: ContactSheetOptions): Promise<Uint8Array>;
  cancelWaveform(): void;
  onWaveformProgress(callback: (progress: ExportProgress) => void): () => void;
  waveform(id: string): Promise<WaveformPoint[]>;
  beginBatch(options?: BatchOptions): Promise<string | null>;
  endBatch(token: string): Promise<void>;
  openBatchFolder(): Promise<void>;
  cancel(): void;
  release(id: string): Promise<void>;
  onProgress(callback: (progress: ExportProgress) => void): () => void;
}
declare global {
  interface Window {
    frameDesktop?: DesktopBridge;
  }
}
