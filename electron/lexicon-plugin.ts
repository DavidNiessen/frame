import { randomUUID } from 'node:crypto';
import { copyFile, lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import {
  LEXICON_EXPORTS_FILE,
  LEXICON_FILES,
  LEXICON_PLUGIN_FILE,
  LEXICON_PRESETS_FILE,
  LEXICON_REQUEST_FILE,
  parseExports,
  parseRequest,
  recordLexiconExport,
  recordLexiconFailure,
  type LexiconExports,
  type LexiconPluginStatus,
  type LexiconPresets,
  type LexiconRequest,
} from '../src/core/lexicon';
import { presetChoices } from '../src/core/lexicon-presets';
import type { ExportPreset, OutputSettings } from '../src/core/presets';
import type { Workflow } from '../src/core/launch';

export interface LexiconExportRecord {
  source: string;
  output: string;
  format: string;
  size: number;
  savedAt: number;
}
export interface LexiconConversion {
  source: string;
  settings: OutputSettings;
  output: string;
  signal: AbortSignal;
  progress: (ratio: number) => void;
}
export interface LexiconRequestOptions {
  pluginsFolder: string;
  presets: () => ExportPreset[];
  open: (paths: string[], workflow: Workflow) => void;
  convert: (work: LexiconConversion) => Promise<{ path: string; size: number; format: string }>;
  platform?: string;
  now?: () => number;
  /** Minimum time between progress updates written for Lexicon. */
  progressInterval?: number;
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
        ? 'In Lexicon, select tracks and open the Plugins menu. Keep Frame open while converting. Restart Lexicon if the actions are missing.'
        : state === 'outdated'
          ? 'An older version of the Frame plugin is installed. Update it, then restart Lexicon.'
          : 'Adds Convert, Export and Edit with Frame to Lexicon. Restart Lexicon after installing.',
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
 * how the plugin was added, so look for folders holding a protocol file, one or two levels down.
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
      for (const name of LEXICON_FILES)
        if (await exists(join(files, name))) {
          folders.push(files);
          break;
        }
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
 * Serves the Lexicon plugin: publishes presets, opens tracks for editing, converts or exports
 * them in the background, and records saved outputs for the plugin to bring into the library.
 */
export class LexiconRequests {
  private queue = Promise.resolve();
  private active: { abort: AbortController; done: Promise<void> } | null = null;
  private stopped = false;
  constructor(private options: LexiconRequestOptions) {}
  private get platform() {
    return this.options.platform ?? process.platform;
  }
  private now() {
    return this.options.now?.() ?? Date.now();
  }
  /** File changes are serialized so progress, outputs and new requests never interleave. */
  private serial<T>(task: () => Promise<T>) {
    const result = this.queue.then(task);
    this.queue = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  poll() {
    return this.serial(async () => {
      if (this.stopped) return;
      const presets: LexiconPresets = {
        version: 1,
        presets: presetChoices(this.options.presets()),
      };
      for (const folder of await lexiconFilesFolders(this.options.pluginsFolder)) {
        const presetFile = join(folder, LEXICON_PRESETS_FILE),
          text = JSON.stringify(presets, null, 2);
        if ((await readFile(presetFile, 'utf8').catch(() => '')) !== text)
          await writeJson(presetFile, presets);
        const request = await readRequest(folder);
        if (request?.status === 'pending') await this.start(folder, request);
      }
    });
  }
  private async start(folder: string, request: LexiconRequest) {
    const paths: string[] = [];
    for (const track of request.tracks)
      if (await exists(track.location)) paths.push(track.location);
    const fail = (error: string) =>
      writeJson(join(folder, LEXICON_REQUEST_FILE), { ...request, status: 'failed', error });
    if (!paths.length) return fail('None of the selected files were found on this computer.');
    if (request.kind === 'edit') {
      this.options.open(paths, 'edit');
      return writeJson(join(folder, LEXICON_REQUEST_FILE), { ...request, status: 'opened' });
    }
    // One background conversion at a time; later requests wait for their turn.
    if (this.active) return;
    const preset = this.options.presets().find((item) => item.id === request.presetId);
    if (!preset) return fail('This preset is no longer available in Frame. Choose another one.');
    if (request.kind === 'export' && !isAbsolute(request.destination!))
      return fail('Choose a complete export folder path, such as D:\\Music for USB.');
    const converting: LexiconRequest = { ...request, status: 'converting', progress: 0 };
    await writeJson(join(folder, LEXICON_REQUEST_FILE), converting);
    const abort = new AbortController();
    this.active = {
      abort,
      done: this.convert(folder, converting, preset, abort.signal).finally(() => {
        this.active = null;
      }),
    };
  }
  private async convert(
    folder: string,
    request: LexiconRequest,
    preset: ExportPreset,
    signal: AbortSignal,
  ) {
    const total = request.tracks.length;
    let lastProgress = 0;
    const update = (changes: Partial<LexiconRequest>) =>
      this.serial(() => writeJson(join(folder, LEXICON_REQUEST_FILE), { ...request, ...changes }));
    try {
      if (request.destination) await mkdir(request.destination, { recursive: true });
      for (const [index, track] of request.tracks.entries()) {
        if (signal.aborted) break;
        const report = async (ratio: number) => {
          const now = this.now();
          if (now - lastProgress < (this.options.progressInterval ?? 1000)) return;
          lastProgress = now;
          await update({ progress: Math.min(1, (index + ratio) / total) });
        };
        try {
          if (!(await exists(track.location))) throw new Error('The file was not found.');
          signal.throwIfAborted();
          const result = await this.options.convert({
            source: track.location,
            settings: preset.settings,
            output: request.destination ?? dirname(track.location),
            signal,
            progress: (ratio) => void report(ratio),
          });
          await this.store(folder, request, (previous) =>
            recordLexiconExport(
              request,
              previous,
              {
                source: track.location,
                output: result.path,
                format: result.format,
                size: result.size,
                savedAt: this.now(),
              },
              this.platform,
            ),
          );
        } catch (error) {
          if (signal.aborted) break;
          await this.store(folder, request, (previous) =>
            recordLexiconFailure(request, previous, {
              id: track.id,
              error: (error as Error).message,
            }),
          );
        }
      }
      await update(
        signal.aborted
          ? { status: 'failed', error: 'Frame closed before the conversion finished.' }
          : { status: 'done', progress: 1 },
      );
    } catch (error) {
      await update({ status: 'failed', error: (error as Error).message });
    }
  }
  private store(
    folder: string,
    request: LexiconRequest,
    change: (previous: LexiconExports | null) => LexiconExports | null,
  ) {
    return this.serial(async () => {
      const next = change(await readExports(folder));
      if (next) await writeJson(join(folder, LEXICON_EXPORTS_FILE), next);
    });
  }
  /** Records an output saved from Frame's editor for the request that opened its source. */
  record(saved: LexiconExportRecord) {
    return this.serial(async () => {
      for (const folder of await lexiconFilesFolders(this.options.pluginsFolder)) {
        const request = await readRequest(folder);
        if (request?.kind !== 'edit') continue;
        const next = recordLexiconExport(request, await readExports(folder), saved, this.platform);
        if (next) await writeJson(join(folder, LEXICON_EXPORTS_FILE), next);
      }
    });
  }
  /** Waits for the background conversion, if any, to finish. */
  settled() {
    return this.active?.done ?? Promise.resolve();
  }
  async stop() {
    this.stopped = true;
    this.active?.abort.abort();
    await this.settled();
    await this.queue;
  }
}
