import { parseOutputSettings, type OutputSettings } from './presets';
import { validateNamingTemplate } from './output-naming';
export interface WatchFolderDraft {
  name: string;
  input: string;
  output: string;
  settings: OutputSettings;
  keepFolders: boolean;
  recursive: boolean;
  includeExisting: boolean;
  namingTemplate: string;
}
export interface WatchFolder extends WatchFolderDraft {
  id: string;
  enabled: boolean;
}
export interface WatchActivity {
  id: string;
  watchId: string;
  name: string;
  status: 'queued' | 'converting' | 'done' | 'failed' | 'cancelled';
  progress: number;
  path?: string;
  error?: string;
}
export interface WatchStatus {
  watches: WatchFolder[];
  activity: WatchActivity[];
  error: string;
}
export function parseWatchDraft(value: unknown): WatchFolderDraft {
  const draft = value as WatchFolderDraft;
  if (
    !draft ||
    typeof draft.name !== 'string' ||
    !draft.name.trim() ||
    draft.name.length > 60 ||
    ![draft.input, draft.output].every(
      (path) =>
        typeof path === 'string' && path.length > 0 && path.length <= 4096 && !path.includes('\0'),
    ) ||
    ![draft.keepFolders, draft.recursive, draft.includeExisting].every(
      (value) => typeof value === 'boolean',
    )
  )
    throw new Error('Choose a name, source folder, destination and valid watch options.');
  validateNamingTemplate(draft.namingTemplate);
  return {
    name: draft.name.trim(),
    input: draft.input,
    output: draft.output,
    settings: parseOutputSettings(draft.settings),
    keepFolders: draft.keepFolders,
    recursive: draft.recursive,
    includeExisting: draft.includeExisting,
    namingTemplate: draft.namingTemplate,
  };
}
/** A file must remain unchanged across scans before encoding; successful receipts survive restarts. */
export class StableWatchFiles {
  private observed = new Map<string, { fingerprint: string; firstSeen: number }>();
  private failed = new Map<string, string>();
  constructor(
    private completed = new Map<string, string>(),
    private stableMs = 2000,
  ) {}
  observe(path: string, fingerprint: string, now: number): boolean {
    if (this.completed.get(path) === fingerprint || this.failed.get(path) === fingerprint)
      return false;
    const previous = this.observed.get(path);
    if (!previous || previous.fingerprint !== fingerprint) {
      this.observed.set(path, { fingerprint, firstSeen: now });
      return false;
    }
    return now - previous.firstSeen >= this.stableMs;
  }
  finish(path: string, fingerprint: string) {
    this.completed.set(path, fingerprint);
    this.observed.delete(path);
    this.failed.delete(path);
  }
  fail(path: string, fingerprint: string) {
    this.failed.set(path, fingerprint);
    this.observed.delete(path);
  }
  retry() {
    this.failed.clear();
  }
  reconcile(paths: Set<string>) {
    for (const map of [this.completed, this.failed, this.observed])
      for (const path of map.keys()) if (!paths.has(path)) map.delete(path);
  }
  receipts() {
    return Object.fromEntries(this.completed);
  }
}
