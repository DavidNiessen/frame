/**
 * Actions of the Lexicon DJ plugin that Frame installs. scripts/prepare-lexicon-plugin.mjs
 * bundles each action into one script and rewrites it for Lexicon's plugin sandbox, which has
 * no modules and rejects some syntax (do-while loops are the one rule the rewrite cannot fix).
 */
import {
  LEXICON_EXPORTS_FILE,
  LEXICON_HELLO_FILE,
  LEXICON_IMPORTED_FILE,
  LEXICON_MAX_TRACKS,
  LEXICON_PRESETS_FILE,
  LEXICON_REQUEST_FILE,
  parseExports,
  parsePresetChoices,
  parseRequest,
  type LexiconExport,
  type LexiconExports,
  type LexiconRequest,
  type LexiconRequestKind,
} from './lexicon';

export interface LexiconTrack {
  id: number;
  type?: string | number;
  location?: string;
}
export interface LexiconDialog {
  input: 'text' | 'select';
  message: string;
  options?: string[];
  default?: string;
  settingsKey?: string;
  confirmLabel?: string;
}
/** The part of Lexicon's plugin globals the actions use, so tests can supply fakes. */
export interface LexiconPluginApi {
  selectedTracks(): LexiconTrack[];
  selectedPlaylistTracks(): Promise<LexiconTrack[]>;
  totalTracks(): number;
  nextBatch(): Promise<LexiconTrack[]>;
  createTracks(locations: string[]): Promise<unknown>;
  listFiles(): string[];
  readFile(name: string): string;
  writeFile(name: string, contents: string): void;
  setting(name: string): string | undefined;
  ask(dialog: LexiconDialog): Promise<string | null>;
  report(message: string): void;
  log(message: string): void;
  progress(ratio: number): void;
  wait(milliseconds: number): Promise<void>;
  now(): number;
  random(): number;
}

export const LEXICON_IMPORT_MODE = 'After converting';
export const LEXICON_RELINK = 'Relink track to the new file';
export const LEXICON_ADD = 'Add as a new track';
export const LEXICON_PRESET = 'Preset';
export const LEXICON_EXPORT_FOLDER = 'Export folder';
/** How long to wait for Frame to pick up a request before assuming it is closed. */
export const LEXICON_ACK_TIMEOUT = 10000;
/** How long a conversion may go without progress before the action stops waiting. */
export const LEXICON_STALL_TIMEOUT = 5 * 60000;
const POLL_INTERVAL = 500;
const MAX_REPORTED_FAILURES = 10;

function readDocument<T>(api: LexiconPluginApi, name: string, parse: (value: unknown) => T) {
  if (!api.listFiles().includes(name)) return null;
  try {
    return parse(JSON.parse(api.readFile(name)));
  } catch (error) {
    api.log(`Ignoring ${name}: ${(error as Error).message}`);
    return null;
  }
}
const readRequest = (api: LexiconPluginApi) =>
  readDocument(api, LEXICON_REQUEST_FILE, parseRequest);
function readExports(api: LexiconPluginApi, request: LexiconRequest): LexiconExports {
  const data = readDocument(api, LEXICON_EXPORTS_FILE, parseExports);
  return data?.requestId === request.requestId
    ? data
    : { version: 1, requestId: request.requestId, exports: [], failures: [] };
}
interface Imported {
  requestId: string;
  outputs: string[];
}
function readImported(api: LexiconPluginApi, request: LexiconRequest) {
  const data = readDocument(api, LEXICON_IMPORTED_FILE, (value) => value as Partial<Imported>);
  return data?.requestId === request.requestId && Array.isArray(data.outputs) ? data.outputs : [];
}

/** The newest output of each track; older conversions of a track are never imported. */
export function newestExports(exports: LexiconExport[]) {
  const newest = new Map<number, LexiconExport>();
  for (const entry of exports) {
    const current = newest.get(entry.id);
    if (!current || entry.savedAt > current.savedAt) newest.set(entry.id, entry);
  }
  return [...newest.values()];
}

/** Local tracks Frame can read; streaming tracks have no file. */
function localTracks(api: LexiconPluginApi, tracks: LexiconTrack[]) {
  const local = tracks
    .filter((track) => String(track.type) !== '1' && !!track.location)
    .map((track) => ({ id: track.id, location: track.location! }));
  if (local.length < tracks.length)
    api.report(`Skipped ${tracks.length - local.length} streaming track(s).`);
  if (!local.length) api.report('Select one or more local tracks first.');
  else if (local.length > LEXICON_MAX_TRACKS) {
    api.report(`Frame handles up to ${LEXICON_MAX_TRACKS} tracks at once; ${local.length} given.`);
    return [];
  }
  return local;
}

/** Frame's presets, asking Frame for them when it has not found the plugin's folder yet. */
async function loadPresets(api: LexiconPluginApi) {
  let presets = readDocument(api, LEXICON_PRESETS_FILE, parsePresetChoices);
  if (presets?.length) return presets;
  api.writeFile(LEXICON_HELLO_FILE, JSON.stringify({ version: 1, at: api.now() }));
  for (let waited = 0; waited < LEXICON_ACK_TIMEOUT && !presets?.length; waited += POLL_INTERVAL) {
    await api.wait(POLL_INTERVAL);
    presets = readDocument(api, LEXICON_PRESETS_FILE, parsePresetChoices);
  }
  if (!presets?.length) api.report('Frame did not respond. Open Frame, then try again.');
  return presets ?? [];
}

async function choosePreset(api: LexiconPluginApi, message: string) {
  const presets = await loadPresets(api);
  if (!presets.length) return null;
  const names = presets.map((preset) => preset.name),
    previous = api.setting(LEXICON_PRESET);
  const name = await api.ask({
    input: 'select',
    message,
    options: names,
    default: previous && names.includes(previous) ? previous : names[0],
    settingsKey: LEXICON_PRESET,
    confirmLabel: 'Convert',
  });
  return presets.find((preset) => preset.name === name) ?? null;
}

function sendRequest(
  api: LexiconPluginApi,
  kind: LexiconRequestKind,
  tracks: LexiconRequest['tracks'],
  details: Pick<LexiconRequest, 'presetId' | 'destination'> = {},
) {
  const createdAt = api.now();
  const request: LexiconRequest = {
    version: 1,
    requestId: `${createdAt}-${Math.floor(api.random() * 1e9)}`,
    createdAt,
    kind,
    status: 'pending',
    tracks,
    ...details,
  };
  api.writeFile(LEXICON_REQUEST_FILE, JSON.stringify(request));
  return request;
}

/**
 * Waits until Frame finishes the request: done, opened, or failed. Returns null when Frame
 * does not pick it up or stops making progress.
 */
async function awaitRequest(api: LexiconPluginApi, request: LexiconRequest) {
  let lastChange = api.now(),
    lastProgress = -1;
  for (;;) {
    await api.wait(POLL_INTERVAL);
    const current = readRequest(api);
    if (current?.requestId !== request.requestId) return null;
    if (current.status === 'done' || current.status === 'opened' || current.status === 'failed')
      return current;
    const progress = current.status === 'converting' ? (current.progress ?? 0) : -1;
    if (progress !== lastProgress) {
      lastProgress = progress;
      lastChange = api.now();
      api.progress(Math.max(0, progress));
    }
    const timeout = current.status === 'pending' ? LEXICON_ACK_TIMEOUT : LEXICON_STALL_TIMEOUT;
    if (api.now() - lastChange >= timeout) return null;
  }
}

function reportFailures(api: LexiconPluginApi, exports: LexiconExports) {
  if (!exports.failures.length) return;
  api.report(`${exports.failures.length} track(s) could not be converted:`);
  for (const failure of exports.failures.slice(0, MAX_REPORTED_FAILURES))
    api.report(`• Track ${failure.id}: ${failure.error}`);
}

/**
 * Brings outputs into the library and remembers them, so each is imported once. Relinking
 * looks the tracks up in `tracks`, which pages through the candidates until it is empty.
 */
async function applyOutputs(
  api: LexiconPluginApi,
  request: LexiconRequest,
  tracks: () => Promise<LexiconTrack[]>,
) {
  const imported = readImported(api, request),
    pending = newestExports(readExports(api, request).exports).filter(
      (entry) => !imported.includes(entry.output),
    );
  if (!pending.length) return 0;
  let applied = 0;
  if (api.setting(LEXICON_IMPORT_MODE) === LEXICON_ADD) {
    await api.createTracks(pending.map((entry) => entry.output));
    applied = pending.length;
    api.report(`Added ${applied} converted file(s) to your library.`);
  } else {
    const byTrack = new Map(pending.map((entry) => [entry.id, entry])),
      total = api.totalTracks();
    let seen = 0;
    for (let batch = await tracks(); batch.length; batch = await tracks()) {
      for (const track of batch) {
        const entry = byTrack.get(track.id);
        if (!entry) continue;
        // Lexicon only lets plugins change the location; it reads the new file's details itself.
        track.location = entry.output;
        applied++;
      }
      seen += batch.length;
      if (total) api.progress(Math.min(1, seen / total));
      if (applied === pending.length) break;
    }
    api.report(`Relinked ${applied} track(s) to their converted files.`);
    if (applied < pending.length)
      api.report(`${pending.length - applied} track(s) are no longer in your library.`);
  }
  const outputs = [...imported, ...pending.map((entry) => entry.output)];
  api.writeFile(
    LEXICON_IMPORTED_FILE,
    JSON.stringify({ requestId: request.requestId, outputs } satisfies Imported),
  );
  api.log(`Imported ${applied} file(s) from Frame for request ${request.requestId}`);
  return applied;
}

/** Converts the selected tracks with a Frame preset and relinks or adds the results. */
export async function convertWithFrame(api: LexiconPluginApi) {
  const tracks = localTracks(api, api.selectedTracks());
  if (!tracks.length) return;
  const preset = await choosePreset(api, `Convert ${tracks.length} track(s) with Frame to:`);
  if (!preset) return;
  const request = sendRequest(api, 'convert', tracks, { presetId: preset.id });
  const result = await awaitRequest(api, request);
  if (!result)
    return api.report(
      'Frame did not finish the conversion. Keep Frame open; when it is done, run "Import From Frame".',
    );
  if (result.status === 'failed') return api.report(`Frame could not convert: ${result.error}`);
  const selected = [api.selectedTracks()];
  const applied = await applyOutputs(api, request, async () => selected.shift() ?? []);
  if (!applied) api.report('Nothing was converted.');
  reportFailures(api, readExports(api, request));
}

/** Exports the selected tracks, or the selected playlist, to a folder with a Frame preset. */
export async function exportWithFrame(api: LexiconPluginApi) {
  const selected = api.selectedTracks(),
    tracks = localTracks(api, selected.length ? selected : await api.selectedPlaylistTracks());
  if (!tracks.length) return;
  const destination = (
    await api.ask({
      input: 'text',
      message: 'Export to which folder? Use a complete path, such as a USB drive.',
      default: api.setting(LEXICON_EXPORT_FOLDER) ?? '',
      settingsKey: LEXICON_EXPORT_FOLDER,
      confirmLabel: 'Next',
    })
  )?.trim();
  if (!destination) return;
  const preset = await choosePreset(api, `Export ${tracks.length} track(s) with Frame as:`);
  if (!preset) return;
  const request = sendRequest(api, 'export', tracks, { presetId: preset.id, destination });
  const result = await awaitRequest(api, request);
  if (!result) return api.report('Frame did not finish the export. Keep Frame open and try again.');
  if (result.status === 'failed') return api.report(`Frame could not export: ${result.error}`);
  const exports = readExports(api, request);
  api.report(`Exported ${newestExports(exports.exports).length} file(s) to ${destination}.`);
  reportFailures(api, exports);
}

/** Opens the selected tracks in Frame's editor; "Import From Frame" brings saved edits back. */
export async function editInFrame(api: LexiconPluginApi) {
  const tracks = localTracks(api, api.selectedTracks());
  if (!tracks.length) return;
  const request = sendRequest(api, 'edit', tracks);
  const result = await awaitRequest(api, request);
  if (!result) api.report('Frame did not respond. Open Frame, then try again.');
  else if (result.status === 'failed')
    api.report(`Frame could not open the tracks: ${result.error}`);
  else {
    api.report(`Opened ${tracks.length} track(s) in Frame's editor.`);
    api.report('Save your edits in Frame, then run "Import From Frame".');
  }
}

/** Imports edits saved in Frame, or conversions the convert action stopped waiting for. */
export async function importFromFrame(api: LexiconPluginApi) {
  const request = readRequest(api);
  if (!request || request.kind === 'export')
    return api.report('Nothing to import. Use "Edit In Frame" or "Convert With Frame" first.');
  const applied = await applyOutputs(api, request, () => api.nextBatch());
  if (!applied)
    api.report(
      readImported(api, request).length
        ? 'Everything from Frame is already imported.'
        : 'Nothing saved in Frame yet. Save your edits there, then try again.',
    );
}

export function frameStatus(api: LexiconPluginApi) {
  const request = readRequest(api);
  if (!request) return api.report('Nothing was sent to Frame yet.');
  const sent = new Date(request.createdAt).toLocaleString(),
    exports = readExports(api, request),
    task = { edit: 'opened for editing', convert: 'converted', export: 'exported' }[request.kind];
  api.report(`${request.tracks.length} track(s) to be ${task}, sent ${sent}.`);
  if (request.status === 'pending') api.report('Waiting for Frame. Open Frame to continue.');
  else if (request.status === 'converting')
    api.report(`Frame is working: ${Math.round((request.progress ?? 0) * 100)}% done.`);
  else if (request.status === 'failed') api.report(`Frame reported a problem: ${request.error}`);
  api.report(
    `${newestExports(exports.exports).length} file(s) saved, ` +
      `${readImported(api, request).length} imported, ${exports.failures.length} failed.`,
  );
}
