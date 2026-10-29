/**
 * Actions of the Lexicon DJ plugin that Frame installs. scripts/prepare-lexicon-plugin.mjs
 * bundles each action into one script and rewrites it for Lexicon's plugin sandbox, which has
 * no modules and rejects some syntax (do-while loops are the one rule the rewrite cannot fix).
 */
import {
  LEXICON_EXPORTS_FILE,
  LEXICON_HEARTBEAT,
  LEXICON_MAX_TRACKS,
  LEXICON_REQUEST_FILE,
  lexiconJson,
  parseExports,
  parseLexiconJson,
  parseRequest,
  type LexiconExport,
  type LexiconRequest,
  type LexiconRequestKind,
} from './lexicon';

export interface LexiconTrack {
  id: number;
  type?: string | number;
  location?: string;
}
/** The part of Lexicon's plugin globals the actions use, so tests can supply fakes. */
export interface LexiconPluginApi {
  selectedTracks(): LexiconTrack[];
  createTracks(locations: string[]): Promise<unknown>;
  listFiles(): string[];
  readFile(name: string): string;
  writeFile(name: string, contents: string): void;
  setting(name: string): string | undefined;
  log(message: string): void;
  progress(ratio: number): void;
  wait(milliseconds: number): Promise<void>;
  now(): number;
  random(): number;
}

export const LEXICON_IMPORT_MODE = 'After saving in Frame';
export const LEXICON_RELINK = 'Relink track to the new file';
export const LEXICON_ADD = 'Add as a new track';
/** How long to wait for Frame to pick up a request before assuming it is closed. */
export const LEXICON_ACK_TIMEOUT = 10000;
/** Frame confirms open requests every few seconds; silence for longer means it has quit. */
export const LEXICON_STALE_AFTER = 6 * LEXICON_HEARTBEAT;
const POLL_INTERVAL = 500;

function readDocument<T>(api: LexiconPluginApi, name: string, parse: (value: unknown) => T) {
  if (!api.listFiles().includes(name)) return null;
  try {
    return parse(parseLexiconJson(api.readFile(name)));
  } catch (error) {
    api.log(`Ignoring ${name}: ${(error as Error).message}`);
    return null;
  }
}
function readExports(api: LexiconPluginApi, request: LexiconRequest) {
  const data = readDocument(api, LEXICON_EXPORTS_FILE, parseExports);
  return data?.requestId === request.requestId ? data.exports : [];
}

/** The newest output of each track; older saves of a track are never used. */
export function newestExports(exports: LexiconExport[]) {
  const newest = new Map<number, LexiconExport>();
  for (const entry of exports) {
    const current = newest.get(entry.id);
    if (!current || entry.savedAt > current.savedAt) newest.set(entry.id, entry);
  }
  return [...newest.values()];
}

/**
 * Sends the selected local tracks to Frame and waits while they are open there. The actions
 * are silent when they succeed, so problems are thrown for Lexicon to show as an error.
 */
async function openInFrame(api: LexiconPluginApi, kind: LexiconRequestKind) {
  const selected = api.selectedTracks(),
    tracks = selected
      .filter((track) => String(track.type) !== '1' && !!track.location)
      .map((track) => ({ id: track.id, location: track.location! }));
  if (tracks.length < selected.length)
    api.log(`Skipped ${selected.length - tracks.length} streaming track(s).`);
  if (!tracks.length) throw new Error('Select one or more local tracks first.');
  if (tracks.length > LEXICON_MAX_TRACKS)
    throw new Error(
      `Frame opens up to ${LEXICON_MAX_TRACKS} tracks at once; ${tracks.length} are selected.`,
    );
  const createdAt = api.now();
  const request: LexiconRequest = {
    version: 1,
    requestId: `${createdAt}-${Math.floor(api.random() * 1e9)}`,
    createdAt,
    kind,
    status: 'pending',
    tracks,
  };
  api.writeFile(LEXICON_REQUEST_FILE, lexiconJson(request));

  for (;;) {
    await api.wait(POLL_INTERVAL);
    const current = readDocument(api, LEXICON_REQUEST_FILE, parseRequest),
      now = api.now();
    if (current?.requestId !== request.requestId)
      throw new Error('Another request to Frame replaced this one.');
    if (current.status === 'failed')
      throw new Error(`Frame could not open the tracks: ${current.error}`);
    if (current.status === 'pending' && now - createdAt >= LEXICON_ACK_TIMEOUT)
      throw new Error('Frame did not respond. Open Frame, then try again.');
    // Done when every track is saved or its Frame window closed; or Frame quit.
    if (current.status === 'done' || now - (current.seenAt ?? now) >= LEXICON_STALE_AFTER)
      return current;
    const saved = newestExports(readExports(api, current)).length;
    api.progress(saved / tracks.length);
  }
}

/** Relinks the selected tracks to the files saved in Frame, or adds those files as tracks. */
async function applySaved(api: LexiconPluginApi, request: LexiconRequest) {
  const saved = newestExports(readExports(api, request));
  if (!saved.length) return api.log('Nothing was saved in Frame; the library is unchanged.');
  if (api.setting(LEXICON_IMPORT_MODE) === LEXICON_ADD) {
    await api.createTracks(saved.map((entry) => entry.output));
    api.log(`Added ${saved.length} file(s) saved in Frame to the library.`);
  } else {
    const byTrack = new Map(saved.map((entry) => [entry.id, entry]));
    let relinked = 0;
    for (const track of api.selectedTracks()) {
      const entry = byTrack.get(track.id);
      if (!entry) continue;
      // Lexicon only lets plugins change the location; it reads the new file's details itself.
      track.location = entry.output;
      relinked++;
    }
    api.log(`Relinked ${relinked} track(s) to the files saved in Frame.`);
  }
  const unsaved = request.tracks.length - saved.length;
  if (unsaved) api.log(`${unsaved} track(s) were not saved in Frame and stay unchanged.`);
}

/** Opens the selected tracks in Frame's converter and relinks them to what you convert. */
export async function convertInFrame(api: LexiconPluginApi) {
  await applySaved(api, await openInFrame(api, 'convert'));
}

/** Opens the selected tracks in Frame's editor and relinks them to the edits you save. */
export async function editInFrame(api: LexiconPluginApi) {
  await applySaved(api, await openInFrame(api, 'edit'));
}
