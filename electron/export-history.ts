import { app, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import { readFile, writeFile, rename, rm, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, isAbsolute } from 'node:path';
import {
  parseExportHistory,
  type ExportHistoryEntry,
  type ExportHistoryKind,
  type ExportHistoryStatus,
} from '../src/core/export-history';
import type { ExportResult, FormatId } from '../src/core/types';
let record: ((entry: ExportHistoryEntry) => Promise<void>) | undefined;
export async function recordExport(
  result: ExportResult,
  kind: ExportHistoryKind,
  source: string,
  format: FormatId,
) {
  if (!result.path || !record) return;
  // A history-storage failure must never turn a successfully saved file into an export failure.
  await record({
    id: randomUUID(),
    name: result.name,
    path: result.path,
    size: result.size,
    source,
    format,
    kind,
    savedAt: Date.now(),
  }).catch(() => {});
}
export function configureExportHistory(trusted: (event: IpcMainInvokeEvent) => void) {
  const path = join(app.getPath('userData'), 'recent-exports.json');
  let entries: ExportHistoryEntry[] = [],
    error = '',
    writes = Promise.resolve();
  const ready = readFile(path, 'utf8')
    .then((text) => {
      if (text.length > 600000) throw new Error('Recent-export list is too large.');
      entries = parseExportHistory(JSON.parse(text)).filter((entry) => isAbsolute(entry.path));
    })
    .catch((issue) => {
      if (issue.code !== 'ENOENT') error = 'Could not restore the recent-export list.';
    });
  const status = (): ExportHistoryStatus => ({ entries: structuredClone(entries), error });
  function mutate(update: () => void) {
    const task = writes.then(async () => {
      await ready;
      update();
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify({ version: 1, entries }), { mode: 0o600 });
        await rename(temporary, path);
        error = '';
      } catch (issue) {
        error = `Could not save recent exports: ${(issue as Error).message}`;
      } finally {
        await rm(temporary, { force: true });
      }
    });
    writes = task.catch(() => {});
    return task;
  }
  record = (entry) =>
    mutate(() => {
      parseExportHistory({ version: 1, entries: [entry] });
      entries = [entry, ...entries.filter((item) => item.path !== entry.path)].slice(0, 100);
    });
  const find = (id: string) => {
    const entry = entries.find((item) => item.id === id);
    if (!entry) throw new Error('This recent export is no longer in the list.');
    return entry;
  };
  ipcMain.handle('history:status', async (event) => {
    trusted(event);
    await ready;
    await writes;
    return status();
  });
  ipcMain.handle('history:clear', async (event) => {
    trusted(event);
    await mutate(() => {
      entries = [];
    });
    return status();
  });
  ipcMain.handle('history:remove', async (event, id: string) => {
    trusted(event);
    await mutate(() => {
      find(id);
      entries = entries.filter((item) => item.id !== id);
    });
    return status();
  });
  ipcMain.handle('history:reveal', async (event, id: string) => {
    trusted(event);
    await ready;
    await writes;
    const entry = find(id);
    if (!(await stat(entry.path).catch(() => null))?.isFile())
      throw new Error('This output moved or was removed. Remove its entry from the list.');
    shell.showItemInFolder(entry.path);
  });
  return () => writes;
}
