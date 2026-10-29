/**
 * File protocol between Frame and its Lexicon DJ plugin. Lexicon plugins run in a sandbox
 * that can only read and write text files in the plugin's own Files folder, so both sides
 * exchange small JSON documents there. Everything read from that folder is untrusted.
 */
export const LEXICON_PLUGIN_FILE = 'Frame.zip';
/** The plugin's current request; Frame reports its state in the same document. */
export const LEXICON_REQUEST_FILE = 'frame-request.json';
/** Outputs Frame saved for the current request. */
export const LEXICON_EXPORTS_FILE = 'frame-exports.json';
/** Lexicon's plugin import is limited by Frame's own import limit. */
export const LEXICON_MAX_TRACKS = 2000;
/** How often Frame confirms it is still working on an open request. */
export const LEXICON_HEARTBEAT = 5000;
const MAX_EXPORTS = 10000;

export interface LexiconTrackRef {
  id: number;
  location: string;
}
/** edit opens Frame's editor, convert its quick converter. */
export type LexiconRequestKind = 'edit' | 'convert';
export type LexiconRequestStatus = 'pending' | 'opened' | 'done' | 'failed';
export interface LexiconRequest {
  version: 1;
  requestId: string;
  createdAt: number;
  kind: LexiconRequestKind;
  status: LexiconRequestStatus;
  tracks: LexiconTrackRef[];
  /** Last time Frame confirmed the request is still open. */
  seenAt?: number;
  error?: string;
}
export interface LexiconExport {
  id: number;
  output: string;
  format: string;
  size: number;
  savedAt: number;
}
export interface LexiconExports {
  version: 1;
  requestId: string;
  exports: LexiconExport[];
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

export function parseRequest(value: unknown): LexiconRequest {
  const data = value as LexiconRequest;
  if (
    !data ||
    data.version !== 1 ||
    !validRequestId(data.requestId) ||
    !Number.isFinite(data.createdAt) ||
    !['edit', 'convert'].includes(data.kind) ||
    !['pending', 'opened', 'done', 'failed'].includes(data.status) ||
    !Array.isArray(data.tracks) ||
    data.tracks.length > LEXICON_MAX_TRACKS ||
    !data.tracks.every((track) => track && validId(track.id) && validPath(track.location)) ||
    (data.seenAt !== undefined && !Number.isFinite(data.seenAt))
  )
    throw new Error('Invalid Lexicon request.');
  return {
    version: 1,
    requestId: data.requestId,
    createdAt: data.createdAt,
    kind: data.kind,
    status: data.status,
    tracks: data.tracks.map(({ id, location }) => ({ id, location })),
    ...(data.seenAt !== undefined ? { seenAt: data.seenAt } : {}),
    ...(typeof data.error === 'string' ? { error: data.error.slice(0, 500) } : {}),
  };
}

export function parseExports(value: unknown): LexiconExports {
  const data = value as LexiconExports;
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
    )
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
  };
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

/**
 * Adds a saved output to the request's export list when its source is one of the requested
 * tracks. Returns null when the output does not belong to an open request.
 */
export function recordLexiconExport(
  request: LexiconRequest,
  previous: LexiconExports | null,
  saved: { source: string; output: string; format: string; size: number; savedAt: number },
  platform: string,
): LexiconExports | null {
  if (request.status !== 'opened' || saved.savedAt < request.createdAt) return null;
  const track = request.tracks.find((item) => sameLocation(item.location, saved.source, platform));
  if (!track) return null;
  const output = lexiconLocation(saved.output),
    exports = previous?.requestId === request.requestId ? previous.exports : [];
  return {
    version: 1,
    requestId: request.requestId,
    exports: [
      ...exports.filter((entry) => !sameLocation(entry.output, output, platform)),
      { id: track.id, output, format: saved.format, size: saved.size, savedAt: saved.savedAt },
    ].slice(-MAX_EXPORTS),
  };
}

/** Whether every requested track has at least one saved output. */
export function everyTrackSaved(request: LexiconRequest, exports: LexiconExports) {
  const saved = new Set(exports.exports.map((entry) => entry.id));
  return request.tracks.every((track) => saved.has(track.id));
}
