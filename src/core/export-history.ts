import type { FormatId } from './types';
import { getFormat } from './formats';
export type ExportHistoryKind = 'export' | 'conversion' | 'batch' | 'merge' | 'watch';
export interface ExportHistoryEntry {
  id: string;
  name: string;
  path: string;
  source: string;
  size: number;
  format: FormatId;
  kind: ExportHistoryKind;
  savedAt: number;
}
export interface ExportHistoryStatus {
  entries: ExportHistoryEntry[];
  error: string;
}
export function parseExportHistory(value: unknown): ExportHistoryEntry[] {
  const data = value as { version: number; entries: ExportHistoryEntry[] };
  if (!data || data.version !== 1 || !Array.isArray(data.entries) || data.entries.length > 100)
    throw new Error('Invalid recent-export list.');
  const ids = new Set<string>();
  return data.entries.map((entry) => {
    if (
      !entry ||
      typeof entry.id !== 'string' ||
      !entry.id ||
      entry.id.length > 120 ||
      ids.has(entry.id) ||
      typeof entry.name !== 'string' ||
      !entry.name ||
      entry.name.length > 255 ||
      typeof entry.path !== 'string' ||
      !entry.path ||
      entry.path.length > 4096 ||
      entry.path.includes('\0') ||
      typeof entry.source !== 'string' ||
      entry.source.length > 255 ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      !Number.isFinite(entry.savedAt) ||
      entry.savedAt < 0 ||
      !['export', 'conversion', 'batch', 'merge', 'watch'].includes(entry.kind)
    )
      throw new Error('Invalid recent-export entry.');
    getFormat(entry.format);
    ids.add(entry.id);
    const { id, name, path, source, size, format, kind, savedAt } = entry;
    return { id, name, path, source, size, format, kind, savedAt };
  });
}

export interface ExportHistoryBridge {
  exportHistory(): Promise<ExportHistoryStatus>;
  clearExportHistory(): Promise<ExportHistoryStatus>;
  removeExportHistory(id: string): Promise<ExportHistoryStatus>;
  revealExport(id: string): Promise<void>;
}
