import { randomUUID } from 'node:crypto';
import { copyFile, lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  LEXICON_EXPORTS_FILE,
  LEXICON_HEARTBEAT,
  LEXICON_PLUGIN_FILE,
  LEXICON_REQUEST_FILE,
  everyTrackSaved,
  parseExports,
  parseRequest,
  recordLexiconExport,
  type LexiconExports,
  type LexiconPluginStatus,
  type LexiconRequest,
  type LexiconRequestKind,
} from '../src/core/lexicon';
import type { Workflow } from '../src/core/launch';

export interface LexiconExportRecord {
  source: string;
  output: string;
  format: string;
  size: number;
  savedAt: number;
}
export interface LexiconRequestOptions {
  pluginsFolder: string;
  open: (paths: string[], workflow: Workflow) => void;
  platform?: string;
  now?: () => number;
}
const MAX_PLUGIN_FOLDERS = 200;

export function lexiconPluginsFolder(documents: string) {
  return join(documents, 'Lexicon', 'Plugins');
}

const exists = (path: string) =>
  lstat(path).then(
    () => true,
    () => false,
  );

async function writeJson(path: string, data: unknown) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(data, null, 2));
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function lexiconPluginStatus(
  documents: string,
  bundled: string,
): Promise<LexiconPluginStatus> {
  const pluginsFolder = lexiconPluginsFolder(documents);
  if (!(await exists(join(documents, 'Lexicon'))))
    return {
      available: false,
      state: 'no-lexicon',
      pluginsFolder,
      detail: 'Lexicon DJ was not found. Install and open Lexicon once, then refresh.',
    };
  const [installed, current] = await Promise.all([
    readFile(join(pluginsFolder, LEXICON_PLUGIN_FILE)).catch(() => null),
    readFile(bundled),
  ]);
  const state = !installed ? 'not-installed' : installed.equals(current) ? 'installed' : 'outdated';
  return {
    available: true,
    state,
    pluginsFolder,
    detail:
      state === 'installed'
        ? 'In Lexicon, select tracks and choose Plugins → Convert In Frame or Edit In Frame. Restart Lexicon if the actions are missing.'
        : state === 'outdated'
          ? 'An older version of the Frame plugin is installed. Update it, then restart Lexicon.'
          : 'Adds Convert In Frame and Edit In Frame to Lexicon. Restart Lexicon after installing.',
  };
}

export async function installLexiconPlugin(documents: string, bundled: string, remove: boolean) {
  const pluginsFolder = lexiconPluginsFolder(documents);
  const target = join(pluginsFolder, LEXICON_PLUGIN_FILE);
  if (remove) {
    await rm(target, { force: true });
    return;
  }
  if (!(await exists(join(documents, 'Lexicon'))))
    throw new Error('Install and open Lexicon DJ before adding the Frame plugin.');
  await mkdir(pluginsFolder, { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    await copyFile(bundled, temporary);
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

/**
 * Lexicon gives each plugin a Files folder below the plugins folder. Its exact name depends on
 * how the plugin was added, so look for folders holding a request, one or two levels down.
 */
export async function lexiconFilesFolders(pluginsFolder: string) {
  const folders: string[] = [];
  const directories = async (path: string) =>
    (await readdir(path, { withFileTypes: true }).catch(() => []))
      .filter((entry) => entry.isDirectory())
      .slice(0, MAX_PLUGIN_FOLDERS)
      .map((entry) => join(path, entry.name));
  for (const plugin of await directories(pluginsFolder))
    for (const candidate of [plugin, ...(await directories(plugin))]) {
      const files = join(candidate, 'Files');
      if (await exists(join(files, LEXICON_REQUEST_FILE))) folders.push(files);
    }
  return folders;
}

async function readRequest(folder: string): Promise<LexiconRequest | null> {
  try {
    return parseRequest(JSON.parse(await readFile(join(folder, LEXICON_REQUEST_FILE), 'utf8')));
  } catch {
    return null;
  }
}
async function readExports(folder: string): Promise<LexiconExports | null> {
  try {
    return parseExports(JSON.parse(await readFile(join(folder, LEXICON_EXPORTS_FILE), 'utf8')));
  } catch {
    return null;
  }
}

/**
 * Opens tracks Lexicon sends in the editor or converter, records the files saved from them,
 * and tells the plugin when the request is done so it can relink the tracks.
 */
export class LexiconRequests {
  private queue = Promise.resolve();
  constructor(private options: LexiconRequestOptions) {}
  private get platform() {
    return this.options.platform ?? process.platform;
  }
  private now() {
    return this.options.now?.() ?? Date.now();
  }
  /** File changes are serialized so state updates and saved outputs never interleave. */
  private serial(task: () => Promise<void>) {
    const result = this.queue.then(task);
    this.queue = result.catch(() => {});
    return result;
  }
  private async each(change: (folder: string, request: LexiconRequest) => Promise<void>) {
    for (const folder of await lexiconFilesFolders(this.options.pluginsFolder)) {
      const request = await readRequest(folder);
      if (request) await change(folder, request);
    }
  }
  private update(folder: string, request: LexiconRequest, changes: Partial<LexiconRequest>) {
    return writeJson(join(folder, LEXICON_REQUEST_FILE), { ...request, ...changes });
  }
  /** Opens new requests and confirms open ones, so the plugin knows Frame is still running. */
  poll() {
    return this.serial(() =>
      this.each(async (folder, request) => {
        const now = this.now();
        if (request.status === 'opened' && now - (request.seenAt ?? 0) >= LEXICON_HEARTBEAT)
          return this.update(folder, request, { seenAt: now });
        if (request.status !== 'pending') return;
        const paths: string[] = [];
        for (const track of request.tracks)
          if (await exists(track.location)) paths.push(track.location);
        if (!paths.length)
          return this.update(folder, request, {
            status: 'failed',
            error: 'None of the selected files were found on this computer.',
          });
        this.options.open(paths, request.kind);
        await this.update(folder, request, { status: 'opened', seenAt: now });
      }),
    );
  }
  /** Records an output saved from a track Lexicon sent; finishes once every track is saved. */
  record(saved: LexiconExportRecord) {
    return this.serial(() =>
      this.each(async (folder, request) => {
        const next = recordLexiconExport(request, await readExports(folder), saved, this.platform);
        if (!next) return;
        await writeJson(join(folder, LEXICON_EXPORTS_FILE), next);
        if (everyTrackSaved(request, next)) await this.update(folder, request, { status: 'done' });
      }),
    );
  }
  /** Finishes open requests of a kind, or all of them, when their Frame window closes. */
  finish(kind?: LexiconRequestKind) {
    return this.serial(() =>
      this.each(async (folder, request) => {
        if (request.status === 'opened' && (!kind || request.kind === kind))
          await this.update(folder, request, { status: 'done' });
      }),
    );
  }
}
