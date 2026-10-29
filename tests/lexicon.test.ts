import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { strFromU8, unzipSync } from 'fflate';
import {
  LEXICON_EXPORTS_FILE,
  LEXICON_PLUGIN_FILE,
  LEXICON_REQUEST_FILE,
  everyTrackSaved,
  lexiconLocation,
  parseExports,
  parseRequest,
  recordLexiconExport,
  type LexiconExport,
  type LexiconRequest,
} from '../src/core/lexicon';
import {
  LEXICON_ADD,
  LEXICON_IMPORT_MODE,
  LEXICON_STALE_AFTER,
  convertInFrame,
  editInFrame,
  type LexiconPluginApi,
  type LexiconTrack,
} from '../src/core/lexicon-plugin';
import {
  LexiconRequests,
  installLexiconPlugin,
  lexiconPluginStatus,
  lexiconPluginsFolder,
} from '../electron/lexicon-plugin';
// @ts-expect-error The build scripts are plain JavaScript modules.
import { lexiconSandboxViolations, toLexiconSandbox } from '../scripts/lexicon-sandbox.mjs';
// @ts-expect-error The build scripts are plain JavaScript modules.
import { prepareLexiconPlugin } from '../scripts/prepare-lexicon-plugin.mjs';

const request = (overrides: Partial<LexiconRequest> = {}): LexiconRequest => ({
  version: 1,
  requestId: '1000-42',
  createdAt: 1000,
  kind: 'convert',
  status: 'opened',
  tracks: [
    { id: 1, location: 'C:/Music/Song.flac' },
    { id: 2, location: 'C:/Music/Other.wav' },
  ],
  ...overrides,
});
const saved = (source: string, output: string, savedAt = 2000) => ({
  source,
  output,
  format: 'mp3',
  size: 10,
  savedAt,
});
const output = (id: number, path: string, savedAt = 2000): LexiconExport => ({
  id,
  output: path,
  format: 'mp3',
  size: 1,
  savedAt,
});

/**
 * An in-memory Lexicon. `frame` runs whenever an action waits, standing in for Frame
 * answering through the shared files.
 */
function fakeLexicon(tracks: LexiconTrack[]) {
  const files: Record<string, string> = {},
    reports: string[] = [],
    created: string[][] = [],
    settings: Record<string, string> = {},
    lexicon = { frame: () => {}, clock: 1000 };
  const api: LexiconPluginApi = {
    selectedTracks: () => tracks,
    createTracks: async (locations) => created.push(locations),
    listFiles: () => Object.keys(files),
    readFile: (name) => files[name],
    writeFile: (name, contents) => {
      files[name] = contents;
    },
    setting: (name) => settings[name],
    report: (message) => reports.push(message),
    log: () => {},
    progress: () => {},
    wait: async (milliseconds) => {
      lexicon.clock += milliseconds;
      lexicon.frame();
    },
    now: () => lexicon.clock,
    random: () => 0.5,
  };
  const sent = () => JSON.parse(files[LEXICON_REQUEST_FILE]) as LexiconRequest;
  const answer = (changes: Partial<LexiconRequest>, exports?: LexiconExport[]) => {
    files[LEXICON_REQUEST_FILE] = JSON.stringify({ ...sent(), ...changes });
    if (exports)
      files[LEXICON_EXPORTS_FILE] = JSON.stringify({
        version: 1,
        requestId: sent().requestId,
        exports,
      });
  };
  return { api, files, reports, created, settings, lexicon, sent, answer };
}

describe('Lexicon protocol', () => {
  it('validates requests and outputs read from the plugin folder', () => {
    expect(parseRequest(request({ seenAt: 5 }))).toEqual(request({ seenAt: 5 }));
    for (const value of [
      null,
      { ...request(), version: 2 },
      { ...request(), requestId: '../escape' },
      { ...request(), kind: 'export' },
      { ...request(), status: 'converting' },
      { ...request(), tracks: [{ id: -1, location: 'a.mp3' }] },
      { ...request(), tracks: [{ id: 1, location: 'a\0.mp3' }] },
      { ...request(), tracks: Array.from({ length: 2001 }, (_, id) => ({ id, location: 'a' })) },
      { ...request(), seenAt: 'now' },
    ])
      expect(() => parseRequest(value)).toThrow();
    expect(() => parseExports({ version: 1, requestId: 'x', exports: [{ id: 1 }] })).toThrow();
  });

  it('records outputs of requested tracks, matching locations by platform', () => {
    const first = recordLexiconExport(
      request(),
      null,
      saved('c:\\music\\song.flac', 'C:\\Out\\Song.mp3'),
      'win32',
    );
    expect(first?.exports).toEqual([
      { id: 1, output: 'C:/Out/Song.mp3', format: 'mp3', size: 10, savedAt: 2000 },
    ]);
    const again = recordLexiconExport(
      request(),
      first,
      saved('C:/Music/Song.flac', 'C:/Out/Song.mp3', 3000),
      'win32',
    );
    expect(again?.exports.map((entry) => entry.savedAt)).toEqual([3000]);
    for (const [current, source, savedAt, platform] of [
      [request(), 'c:/music/song.flac', 2000, 'linux'],
      [request(), 'C:/Music/Song.flac', 999, 'win32'],
      [request({ status: 'done' }), 'C:/Music/Song.flac', 2000, 'win32'],
      [request(), 'C:/Music/Unrelated.flac', 2000, 'win32'],
    ] as const)
      expect(
        recordLexiconExport(current, null, saved(source, 'out.mp3', savedAt), platform),
      ).toBeNull();
    expect(everyTrackSaved(request(), first!)).toBe(false);
    expect(lexiconLocation('C:\\a\\b.mp3')).toBe('C:/a/b.mp3');
  });
});

describe('Lexicon plugin actions', () => {
  it('waits while tracks are converted in Frame, then relinks them to the newest files', async () => {
    const tracks: LexiconTrack[] = [
      { id: 1, type: '0', location: 'C:/Music/Song.flac' },
      { id: 2, location: 'C:/Music/Other.wav' },
      { id: 3, type: '1' },
    ];
    const lexicon = fakeLexicon(tracks);
    let ticks = 0;
    lexicon.lexicon.frame = () => {
      ticks++;
      const seenAt = lexicon.lexicon.clock;
      if (ticks === 1) lexicon.answer({ status: 'opened', seenAt });
      // The user converts one track twice, then closes the converter.
      if (ticks === 3)
        lexicon.answer({ seenAt }, [
          output(1, 'C:/Music/Song.mp3', 2000),
          output(1, 'C:/Music/Song.wav', 3000),
        ]);
      if (ticks === 5) lexicon.answer({ status: 'done' });
    };
    await convertInFrame(lexicon.api);
    expect(lexicon.sent()).toMatchObject({
      kind: 'convert',
      tracks: [
        { id: 1, location: 'C:/Music/Song.flac' },
        { id: 2, location: 'C:/Music/Other.wav' },
      ],
    });
    expect(tracks.map((track) => track.location)).toEqual([
      'C:/Music/Song.wav',
      'C:/Music/Other.wav',
      undefined,
    ]);
    expect(lexicon.reports).toEqual([
      'Skipped 1 streaming track(s).',
      'Relinked 1 track(s) to the files saved in Frame.',
      '1 track(s) were not saved in Frame and stay unchanged.',
    ]);
  });

  it('adds edits as new tracks when chosen, and stops when Frame quits', async () => {
    const lexicon = fakeLexicon([{ id: 1, location: 'C:/Music/Song.flac' }]);
    lexicon.settings[LEXICON_IMPORT_MODE] = LEXICON_ADD;
    let ticks = 0;
    lexicon.lexicon.frame = () => {
      // Frame opens the editor, saves once, then stops confirming: it has quit.
      if (++ticks === 1)
        lexicon.answer({ status: 'opened', seenAt: lexicon.lexicon.clock }, [
          output(1, 'C:/Edits/Song.wav'),
        ]);
    };
    await editInFrame(lexicon.api);
    expect(lexicon.sent().kind).toBe('edit');
    expect(lexicon.lexicon.clock).toBeGreaterThanOrEqual(1000 + LEXICON_STALE_AFTER);
    expect(lexicon.created).toEqual([['C:/Edits/Song.wav']]);
    expect(lexicon.reports).toEqual(['Added 1 file(s) saved in Frame to your library.']);
  });

  it('reports when Frame is closed, cannot open the files, or nothing is saved', async () => {
    const closed = fakeLexicon([{ id: 1, location: 'C:/Music/Song.flac' }]);
    await convertInFrame(closed.api);
    expect(closed.reports).toEqual(['Frame did not respond. Open Frame, then try again.']);

    const missing = fakeLexicon([{ id: 1, location: 'C:/Music/Song.flac' }]);
    missing.lexicon.frame = () => missing.answer({ status: 'failed', error: 'Files not found.' });
    await convertInFrame(missing.api);
    expect(missing.reports).toEqual(['Frame could not open the tracks: Files not found.']);

    const unchanged = fakeLexicon([{ id: 1, location: 'C:/Music/Song.flac' }]);
    unchanged.lexicon.frame = () => unchanged.answer({ status: 'done' });
    await editInFrame(unchanged.api);
    expect(unchanged.reports).toEqual([
      'Nothing was saved in Frame, so your library is unchanged.',
    ]);

    const none = fakeLexicon([{ id: 1, type: 1 }]);
    await convertInFrame(none.api);
    expect(none.files[LEXICON_REQUEST_FILE]).toBeUndefined();
  });
});

describe('Lexicon integration', () => {
  async function fixture() {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'frame-lexicon-')));
    const documents = join(root, 'Documents'),
      music = join(root, 'Music'),
      bundled = join(root, LEXICON_PLUGIN_FILE),
      plugins = lexiconPluginsFolder(documents),
      folder = join(plugins, 'Frame', 'Files'),
      opened: [string[], string][] = [],
      clock = { now: 10000 };
    await mkdir(music, { recursive: true });
    await mkdir(folder, { recursive: true });
    await writeFile(join(music, 'Song.flac'), 'audio');
    await writeFile(join(music, 'Other.flac'), 'audio');
    await writeFile(bundled, 'plugin v2');
    const requests = new LexiconRequests({
      pluginsFolder: plugins,
      open: (paths, workflow) => opened.push([paths, workflow]),
      now: () => clock.now,
    });
    const tracks = [
      { id: 1, location: lexiconLocation(join(music, 'Song.flac')) },
      { id: 2, location: lexiconLocation(join(music, 'Other.flac')) },
      { id: 3, location: lexiconLocation(join(music, 'Missing.wav')) },
    ];
    const send = (changes: Partial<LexiconRequest> = {}) =>
      writeFile(
        join(folder, LEXICON_REQUEST_FILE),
        JSON.stringify(request({ status: 'pending', createdAt: 0, tracks, ...changes })),
      );
    const read = async (name: string) => JSON.parse(await readFile(join(folder, name), 'utf8'));
    return { documents, music, bundled, plugins, opened, clock, requests, tracks, send, read };
  }

  it('installs, updates and removes the plugin in Lexicon', async () => {
    const { documents, bundled, plugins } = await fixture();
    await rm(join(documents, 'Lexicon'), { recursive: true });
    expect((await lexiconPluginStatus(documents, bundled)).state).toBe('no-lexicon');
    await expect(installLexiconPlugin(documents, bundled, false)).rejects.toThrow(/Lexicon DJ/);
    await mkdir(join(documents, 'Lexicon'), { recursive: true });
    expect((await lexiconPluginStatus(documents, bundled)).state).toBe('not-installed');
    await installLexiconPlugin(documents, bundled, false);
    expect(await readFile(join(plugins, LEXICON_PLUGIN_FILE), 'utf8')).toBe('plugin v2');
    expect((await lexiconPluginStatus(documents, bundled)).state).toBe('installed');
    await writeFile(join(plugins, LEXICON_PLUGIN_FILE), 'plugin v1');
    expect((await lexiconPluginStatus(documents, bundled)).state).toBe('outdated');
    await installLexiconPlugin(documents, bundled, true);
    expect((await lexiconPluginStatus(documents, bundled)).state).toBe('not-installed');
  });

  it('opens existing tracks once, confirms the request, and finishes when all are saved', async () => {
    const { music, opened, clock, requests, tracks, send, read } = await fixture();
    await send();
    await requests.poll();
    await requests.poll();
    expect(opened).toEqual([[[tracks[0].location, tracks[1].location], 'convert']]);
    expect(await read(LEXICON_REQUEST_FILE)).toMatchObject({ status: 'opened', seenAt: 10000 });
    clock.now += 6000;
    await requests.poll();
    expect((await read(LEXICON_REQUEST_FILE)).seenAt).toBe(16000);

    await requests.record(saved(join(music, 'Song.flac'), join(music, 'Song.mp3')));
    await requests.record(saved(join(music, 'Unrelated.flac'), join(music, 'Unrelated.mp3')));
    expect((await read(LEXICON_REQUEST_FILE)).status).toBe('opened');
    expect(parseExports(await read(LEXICON_EXPORTS_FILE)).exports.map((entry) => entry.id)).toEqual(
      [1],
    );
    // The missing track can never be saved, so the request finishes when its window closes.
    await requests.record(saved(join(music, 'Other.flac'), join(music, 'Other.mp3')));
    expect((await read(LEXICON_REQUEST_FILE)).status).toBe('opened');
    await requests.finish('edit');
    expect((await read(LEXICON_REQUEST_FILE)).status).toBe('opened');
    await requests.finish('convert');
    expect((await read(LEXICON_REQUEST_FILE)).status).toBe('done');
  });

  it('finishes as soon as every track is saved, and fails requests without files', async () => {
    const { music, opened, requests, send, read } = await fixture();
    await send({
      kind: 'edit',
      tracks: [{ id: 1, location: lexiconLocation(join(music, 'Song.flac')) }],
    });
    await requests.poll();
    expect(opened[0][1]).toBe('edit');
    await requests.record(saved(join(music, 'Song.flac'), join(music, 'Song (edit).wav')));
    expect((await read(LEXICON_REQUEST_FILE)).status).toBe('done');

    await send({ requestId: '2-2', tracks: [{ id: 1, location: '/nowhere/Song.flac' }] });
    await requests.poll();
    expect(await read(LEXICON_REQUEST_FILE)).toMatchObject({
      status: 'failed',
      error: expect.stringMatching(/files were found/),
    });
  });
});

describe('Lexicon plugin build', () => {
  it('rewrites bundled code into syntax the Lexicon sandbox accepts', () => {
    const code = 'const a = 1;\nif (a) run();\nelse stop();\nfor (const b of c) d({ a });\n';
    expect(lexiconSandboxViolations(code)).toEqual([
      'line 2: if body without braces',
      'line 3: else body without braces',
      'line 4: loop body without braces',
      'line 4: shorthand property',
    ]);
    expect(lexiconSandboxViolations(toLexiconSandbox(code))).toEqual([]);
    expect(lexiconSandboxViolations('do { a(); } while (b);\nimport x from "y";')).toHaveLength(2);
  });

  it('packages actions that relink a track to the file converted in Frame', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'frame-lexicon-build-')));
    await prepareLexiconPlugin(root);
    const archive = unzipSync(await readFile(join(root, LEXICON_PLUGIN_FILE)));
    const manifest = JSON.parse(strFromU8(archive['config.json']));
    expect(manifest.author).toEqual({
      name: 'Frame',
      email: 'david@niessen.dev',
      discordUsername: 'david.niessen',
    });
    expect(manifest.actions.map((action: { name: string }) => action.name)).toEqual([
      'Convert In Frame',
      'Edit In Frame',
    ]);
    for (const action of manifest.actions) {
      // Lexicon rejects the whole plugin when an action asks to edit a read-only field.
      expect(action.config.permissions.track.modifyFields).toEqual(['location']);
      expect(lexiconSandboxViolations(strFromU8(archive[`${action.id}.js`]))).toEqual([]);
    }

    // Lexicon's side: a selected track and the plugin's Files folder, which Frame polls.
    const documents = join(root, 'Documents'),
      folder = join(lexiconPluginsFolder(documents), 'Frame', 'Files'),
      source = join(root, 'Song.flac'),
      converted = join(root, 'Song.mp3');
    await mkdir(folder, { recursive: true });
    await writeFile(source, 'audio');
    const library = [{ id: 7, type: '0', location: lexiconLocation(source) }];
    const frame = new LexiconRequests({
      pluginsFolder: lexiconPluginsFolder(documents),
      // The user converts the track in Frame's converter as soon as it opens.
      open: () =>
        void frame.record({
          source,
          output: converted,
          format: 'mp3',
          size: 9,
          savedAt: Date.now() + 1,
        }),
    });
    const reports: string[] = [];
    await runInNewContext(`(async () => {\n${strFromU8(archive['frame.convert.js'])}\n})()`, {
      _vars: { tracksSelected: library },
      _library: { track: { create: async () => {} } },
      _files: {
        list: () => readdirSync(folder),
        read: (name: string) => readFileSync(join(folder, name), 'utf8'),
        write: (name: string, contents: string) => writeFileSync(join(folder, name), contents),
      },
      _settings: {},
      _helpers: {
        Report: (message: string) => reports.push(message),
        Log: () => {},
        // While the action waits, Frame's timer handles the request.
        Wait: () => frame.poll(),
      },
      _ui: { progress: () => {} },
    });
    expect(library[0]).toEqual({ id: 7, type: '0', location: lexiconLocation(converted) });
    expect(reports).toEqual(['Relinked 1 track(s) to the files saved in Frame.']);
  });
});
