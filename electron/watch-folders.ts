import { recordExport } from './export-history';
import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { readFile, writeFile, rename, rm, lstat, realpath, stat } from 'node:fs/promises';
import { join, basename, dirname, relative, isAbsolute, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseWatchDraft, type WatchFolder } from '../src/core/watch-folders';
import { taggedNamingAsset } from '../src/core/media-tags';
import { conversionName, conversionSettings, canConvert } from '../src/core/conversion';
import { buildExportArgs } from '../src/core/export-plan';
import { editedDuration } from '../src/core/timeline';
import { WatchRunner, validateWatchPaths, validateWatchNetwork } from './watch-runner';
import { MediaJobs } from './jobs';
import { probeFile, runFfmpeg } from './native';
import { withResources } from './resources';
import { safeOutputPath, publishOutput } from './output-files';

export function configureWatchFolders(trusted: (event: IpcMainInvokeEvent) => void) {
  const config = join(app.getPath('userData'), 'watch-folders.json'), receipts = join(app.getPath('userData'), 'watch-receipts.json');
  const selections = new WeakMap<WebContents, { input: string; output: string }>();
  const jobs = new MediaJobs(); let writes = Promise.resolve(), mutations = Promise.resolve();
  async function atomic(path: string, data: unknown) {
    const temporary = `${path}.${randomUUID()}.tmp`;
    try { await writeFile(temporary, JSON.stringify(data), { mode: 0o600 }); await rename(temporary, path); }
    finally { await rm(temporary, { force: true }); }
  }
  const runner = new WatchRunner(async work => {
    const original = await lstat(work.path), source = await realpath(work.path), relation = relative(work.watch.input, source);
    if (original.isSymbolicLink() || !original.isFile() || relation.startsWith(`..${sep}`) || relation === '..' || isAbsolute(relation)) throw new Error('The source moved outside its watched folder.');
    return jobs.run(async execute => {
      const cancel = () => jobs.cancel(); work.signal.addEventListener('abort', cancel, { once: true });
      if (work.signal.aborted) cancel(); let temporary: string | undefined;
      try {
        const asset = { ...await probeFile(source, { rawOnly: true, signal: jobs.signal }), id: randomUUID(), name: basename(source), relativePath: work.relativePath, previewUrl: '' };
        if (!canConvert(asset, work.watch.settings)) throw new Error(`This source cannot be converted to ${work.watch.settings.format.toUpperCase()}.`);
        const edit = conversionSettings(asset, { ...work.watch.settings, acceleration: 'software' });
        const name = conversionName(taggedNamingAsset(asset, edit.outputTags), edit.format, work.watch.keepFolders, work.watch.namingTemplate);
        const destination = await safeOutputPath(work.watch.output, name); temporary = join(dirname(destination), `.frame-watch-${randomUUID()}.${edit.format}`);
        await withResources([edit], async paths => execute(runFfmpeg(buildExportArgs(asset, edit, source, temporary!, paths[0]), editedDuration(edit), work.progress)), [asset]);
        if (jobs.cancelled) throw new Error('Conversion cancelled.');
        const current = await lstat(source);
        if (current.size !== original.size || current.mtimeMs !== original.mtimeMs) throw new Error('The source changed while converting. Frame will retry when it is stable.');
        const path = await publishOutput(temporary, work.watch.output, name); await recordExport({ name: basename(path), path, size: (await stat(path)).size }, 'watch', asset.name, edit.format); return path;
      } finally { work.signal.removeEventListener('abort', cancel); if (temporary) await rm(temporary, { force: true }); }
    });
  }, persist);
  function persist() {
    const data = runner.status().watches, records = runner.receipts();
    const task = writes.then(async () => { await atomic(receipts, { version: 1, receipts: records }); await atomic(config, { version: 1, watches: data }); });
    writes = task.catch(() => {}); return task;
  }
  const ready = (async () => {
    try {
      const text = await readFile(config, 'utf8'); if (text.length > 1000000) throw new Error('Watch configuration is too large.');
      const data = JSON.parse(text); if (data.version !== 1 || !Array.isArray(data.watches) || data.watches.length > 10) throw new Error('Invalid watch configuration.');
      const ids = new Set<string>(); const watches: WatchFolder[] = data.watches.map((value: WatchFolder) => {
        if (typeof value.id !== 'string' || value.id.length > 100 || ids.has(value.id) || typeof value.enabled !== 'boolean') throw new Error('Invalid saved watch.'); ids.add(value.id);
        return { ...parseWatchDraft(value), id: value.id, enabled: value.enabled };
      });
      const textReceipts = await readFile(receipts, 'utf8').catch(() => '{"version":1,"receipts":{}}');
      if (textReceipts.length > 5000000) throw new Error('Saved watch receipts are too large.');
      const records = JSON.parse(textReceipts); const valid = Object.fromEntries(watches.map(watch => [watch.id, Object.fromEntries(Object.entries(records.receipts?.[watch.id] ?? {}).filter(([path, fingerprint]) => path.length <= 4096 && typeof fingerprint === 'string' && fingerprint.length < 100))]));
      runner.restore(watches, valid as Record<string, Record<string, string>>);
    } catch (issue) { if ((issue as NodeJS.ErrnoException).code !== 'ENOENT') runner.error = `Could not restore watch folders: ${(issue as Error).message}`; }
  })();
  const mutate = (action: () => Promise<void>) => { const task = mutations.then(async () => { await ready; await action(); await persist(); return runner.status(); }); mutations = task.then(() => {}, () => {}); return task; };
  const find = (id: string) => { const watch = runner.watches.find(item => item.id === id); if (!watch) throw new Error('This watch folder no longer exists.'); return watch; };
  ipcMain.handle('watch:status', async event => { trusted(event); await ready; return runner.status(); });
  ipcMain.handle('watch:choose', async event => {
    trusted(event); selections.delete(event.sender); const window = BrowserWindow.fromWebContents(event.sender); if (!window) return null;
    const source = await dialog.showOpenDialog(window, { title: 'Choose a folder to watch', properties: ['openDirectory'] }); if (source.canceled) return null;
    const output = await dialog.showOpenDialog(window, { title: 'Choose where converted files are saved', properties: ['openDirectory', 'createDirectory'] }); if (output.canceled) return null;
    const paths = await validateWatchPaths(source.filePaths[0], output.filePaths[0]); selections.set(event.sender, paths); return paths;
  });
  ipcMain.handle('watch:add', (event, value: unknown) => { trusted(event); return mutate(async () => {
    if (runner.watches.length >= 10) throw new Error('You can watch up to 10 folders.');
    const draft = parseWatchDraft(value), selected = selections.get(event.sender);
    if (!selected || draft.input !== selected.input || draft.output !== selected.output) throw new Error('Choose the watch folders using the native folder picker first.');
    const paths = await validateWatchPaths(draft.input, draft.output);
    if (paths.input !== selected.input || paths.output !== selected.output) throw new Error('A selected folder moved. Choose the folders again.');
    if (runner.watches.some(item => item.input === paths.input)) throw new Error('This source folder already has a watch.');
    validateWatchNetwork([...runner.watches, paths]);
    if (draft.namingTemplate.includes('{index}')) throw new Error('Watch folders support {name}, {format} and {folder}. Use the batch converter for numbered files.');
    const watch = { ...draft, ...paths, id: randomUUID(), enabled: true }; await runner.initialize(watch); runner.watches.push(watch); selections.delete(event.sender);
  }); });
  ipcMain.handle('watch:enabled', (event, id: string, enabled: unknown) => { trusted(event); return mutate(async () => { if (typeof enabled !== 'boolean') throw new Error('Choose whether the watch is enabled.'); find(id).enabled = enabled; if (!enabled) runner.cancel(id); }); });
  ipcMain.handle('watch:remove', (event, id: string) => { trusted(event); return mutate(async () => { find(id); runner.cancel(id); runner.watches = runner.watches.filter(item => item.id !== id); }); });
  ipcMain.handle('watch:retry', (event, id: string) => { trusted(event); return mutate(async () => { find(id); runner.retry(id); }); });
  ipcMain.handle('watch:open', async (event, id: string) => { trusted(event); await ready; const result = await shell.openPath(find(id).output); if (result) throw new Error(result); });
  const timer = setInterval(() => { void ready.then(() => runner.tick()).catch(issue => { runner.error = (issue as Error).message; }); }, 2000); timer.unref();
  return async () => { clearInterval(timer); runner.stop(); jobs.cancel(); await runner.settled(); await mutations; await writes; };
}
