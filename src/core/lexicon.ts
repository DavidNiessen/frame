/**
 * File protocol between Frame and its Lexicon DJ plugin. Lexicon plugins run in a sandbox
 * that can only read and write text files in the plugin's own Files folder, so both sides
 * exchange small JSON documents there. Everything read from that folder is untrusted.
 */
export const LEXICON_PLUGIN_FILE = 'Frame.zip';
/** The plugin's current request; Frame reports its progress in the same document. */
export const LEXICON_REQUEST_FILE = 'frame-request.json';
/** Outputs Frame saved for the current request. */
export const LEXICON_EXPORTS_FILE = 'frame-exports.json';
/** Outputs the plugin already brought into the library. */
export const LEXICON_IMPORTED_FILE = 'frame-imported.json';
/** Conversion presets Frame offers, written whenever Frame finds the plugin's folder. */
export const LEXICON_PRESETS_FILE = 'frame-presets.json';
/** Written by the plugin so Frame can find its folder before the first request. */
export const LEXICON_HELLO_FILE = 'frame-hello.json';
export const LEXICON_FILES = [
  LEXICON_REQUEST_FILE,
  LEXICON_EXPORTS_FILE,
  LEXICON_PRESETS_FILE,
  LEXICON_HELLO_FILE,
];
/** Lexicon's plugin import is limited by Frame's own import limit. */
export const LEXICON_MAX_TRACKS = 2000;
const MAX_EXPORTS = 10000;

export interface LexiconTrackRef {
  id: number;
  location: string;
}
/** edit opens the editor; convert and export run in the background with a preset. */
export type LexiconRequestKind = 'edit' | 'convert' | 'export';
export type LexiconRequestStatus = 'pending' | 'opened' | 'converting' | 'done' | 'failed';
export interface LexiconRequest {
  version: 1;
  requestId: string;
  createdAt: number;
  kind: LexiconRequestKind;
  status: LexiconRequestStatus;
  tracks: LexiconTrackRef[];
  presetId?: string;
  /** Export folder; conversions without one are saved next to their source. */
  destination?: string;
  /** Overall progress from 0 to 1 while converting. */
  progress?: number;
  error?: string;
}
export interface LexiconExport {
  id: number;
  output: string;
  format: string;
  size: number;
  savedAt: number;
}
export interface LexiconFailure {
  id: number;
  error: string;
}
export interface LexiconExports {
  version: 1;
  requestId: string;
  exports: LexiconExport[];
  failures: LexiconFailure[];
}
export interface LexiconPresetChoice {
  id: string;
  name: string;
  format: string;
}
export interface LexiconPresets {
  version: 1;
  presets: LexiconPresetChoice[];
}
export interface LexiconPluginStatus {
  available: boolean;
  state: 'no-lexicon' | 'not-installed' | 'installed' | 'outdated';
  pluginsFolder: string;
  detail: string;
}

const validPath = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 4096 && !value.includes('\0');
const validId = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;
const validRequestId = (value: unknown): value is string =>
  typeof value === 'string' && /^[\w-]{1,80}$/.test(value);
const validText = (value: unknown, length: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= length;

export function parseRequest(value: unknown): LexiconRequest {
  const data = value as LexiconRequest;
  if (
    !data ||
    data.version !== 1 ||
    !validRequestId(data.requestId) ||
    !Number.isFinite(data.createdAt) ||
    !['edit', 'convert', 'export'].includes(data.kind) ||
    !['pending', 'opened', 'converting', 'done', 'failed'].includes(data.status) ||
    !Array.isArray(data.tracks) ||
    data.tracks.length > LEXICON_MAX_TRACKS ||
    !data.tracks.every((track) => track && validId(track.id) && validPath(track.location)) ||
    (data.kind !== 'edit' && !validText(data.presetId, 100)) ||
    (data.kind === 'export' && !validPath(data.destination)) ||
    (data.progress !== undefined &&
      !(Number.isFinite(data.progress) && data.progress >= 0 && data.progress <= 1))
  )
    throw new Error('Invalid Lexicon request.');
  return {
    version: 1,
    requestId: data.requestId,
    createdAt: data.createdAt,
    kind: data.kind,
    status: data.status,
    tracks: data.tracks.map(({ id, location }) => ({ id, location })),
    ...(data.kind !== 'edit' ? { presetId: data.presetId } : {}),
    ...(data.kind === 'export' ? { destination: data.destination } : {}),
    ...(data.progress !== undefined ? { progress: data.progress } : {}),
    ...(typeof data.error === 'string' ? { error: data.error.slice(0, 500) } : {}),
  };
}

export function parseExports(value: unknown): LexiconExports {
  const data = value as LexiconExports;
  const failures = data?.failures ?? [];
  if (
    !data ||
    data.version !== 1 ||
    !validRequestId(data.requestId) ||
    !Array.isArray(data.exports) ||
    data.exports.length > MAX_EXPORTS ||
    !data.exports.every(
      (entry) =>
        entry &&
        validId(entry.id) &&
        validPath(entry.output) &&
        typeof entry.format === 'string' &&
        Number.isSafeInteger(entry.size) &&
        Number.isFinite(entry.savedAt),
    ) ||
    !Array.isArray(failures) ||
    failures.length > MAX_EXPORTS ||
    !failures.every((entry) => entry && validId(entry.id) && typeof entry.error === 'string')
  )
    throw new Error('Invalid Lexicon export list.');
  return {
    version: 1,
    requestId: data.requestId,
    exports: data.exports.map(({ id, output, format, size, savedAt }) => ({
      id,
      output,
      format,
      size,
      savedAt,
    })),
    failures: failures.map(({ id, error }) => ({ id, error: error.slice(0, 500) })),
  };
}

export function parsePresetChoices(value: unknown): LexiconPresetChoice[] {
  const data = value as LexiconPresets;
  if (
    !data ||
    data.version !== 1 ||
    !Array.isArray(data.presets) ||
    data.presets.length > 100 ||
    !data.presets.every(
      (preset) =>
        preset &&
        validText(preset.id, 100) &&
        validText(preset.name, 60) &&
        validText(preset.format, 10),
    )
  )
    throw new Error('Invalid Frame preset list.');
  return data.presets.map(({ id, name, format }) => ({ id, name, format }));
}

/** Lexicon stores locations with forward slashes on every platform. */
export function lexiconLocation(path: string) {
  return path.replace(/\\/g, '/');
}

export function sameLocation(a: string, b: string, platform: string) {
  const normal = (path: string) => {
    const slashes = lexiconLocation(path).normalize('NFC');
    return platform === 'win32' || platform === 'darwin' ? slashes.toLowerCase() : slashes;
  };
  return normal(a) === normal(b);
}

const emptyExports = (request: LexiconRequest, previous: LexiconExports | null): LexiconExports =>
  previous?.requestId === request.requestId
    ? previous
    : { version: 1, requestId: request.requestId, exports: [], failures: [] };

/**
 * Adds a saved output to the request's export list when its source is one of the requested
 * tracks. Returns null when the output does not belong to an active request.
 */
export function recordLexiconExport(
  request: LexiconRequest,
  previous: LexiconExports | null,
  saved: { source: string; output: string; format: string; size: number; savedAt: number },
  platform: string,
): LexiconExports | null {
  if (!['opened', 'converting'].includes(request.status) || saved.savedAt < request.createdAt)
    return null;
  const track = request.tracks.find((item) => sameLocation(item.location, saved.source, platform));
  if (!track) return null;
  const output = lexiconLocation(saved.output),
    current = emptyExports(request, previous);
  return {
    ...current,
    exports: [
      ...current.exports.filter((entry) => !sameLocation(entry.output, output, platform)),
      { id: track.id, output, format: saved.format, size: saved.size, savedAt: saved.savedAt },
    ].slice(-MAX_EXPORTS),
  };
}

export function recordLexiconFailure(
  request: LexiconRequest,
  previous: LexiconExports | null,
  failure: LexiconFailure,
): LexiconExports {
  const current = emptyExports(request, previous);
  return { ...current, failures: [...current.failures, failure].slice(-MAX_EXPORTS) };
}
