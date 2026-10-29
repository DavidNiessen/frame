import { describe, expect, it } from 'vitest';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { strFromU8, unzipSync } from 'fflate';
import {
  LEXICON_EXPORTS_FILE,
  LEXICON_HELLO_FILE,
  LEXICON_IMPORTED_FILE,
  LEXICON_PLUGIN_FILE,
  LEXICON_PRESETS_FILE,
  LEXICON_REQUEST_FILE,
  lexiconLocation,
  parseExports,
  parseRequest,
  recordLexiconExport,
  recordLexiconFailure,
  type LexiconExports,
  type LexiconRequest,
} from '../src/core/lexicon';
import { lexiconBuiltInPresets, lexiconPresets, presetChoices } from '../src/core/lexicon-presets';
import { builtInPresets } from '../src/core/presets';
import {
  LEXICON_ADD,
  LEXICON_IMPORT_MODE,
  convertWithFrame,
  editInFrame,
  exportWithFrame,
  frameStatus,
  importFromFrame,
  type LexiconDialog,
  type LexiconPluginApi,
  type LexiconTrack,
} from '../src/core/lexicon-plugin';
import {
  LexiconRequests,
  installLexiconPlugin,
  lexiconPluginStatus,
  lexiconPluginsFolder,
  type LexiconRequestOptions,
} from '../electron/lexicon-plugin';
// @ts-expect-error The build scripts are plain JavaScript modules.
import { lexiconSandboxViolations, toLexiconSandbox } from '../scripts/lexicon-sandbox.mjs';
// @ts-expect-error The build scripts are plain JavaScript modules.
import { prepareLexiconPlugin } from '../scripts/prepare-lexicon-plugin.mjs';

const request = (overrides: Partial<LexiconRequest> = {}): LexiconRequest => ({
  version: 1,
  requestId: '1000-42',
  createdAt: 1000,
  kind: 'edit',
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
const choices = presetChoices(lexiconBuiltInPresets);
const publishedPresets = {
  [LEXICON_PRESETS_FILE]: JSON.stringify({ version: 1, presets: choices }),
};

/**
 * An in-memory Lexicon. `frame` runs whenever an action waits, standing in for Frame
 * answering through the shared files.
 */
function fakeLexicon(tracks: LexiconTrack[], files: Record<string, string> = {}) {
  const reports: string[] = [],
    dialogs: LexiconDialog[] = [],
    answers: (string | null)[] = [],
    created: string[][] = [],
    settings: Record<string, string> = {},
    lexicon = { frame: () => {}, playlist: [] as LexiconTrack[] };
  let batches = 0,
    clock = 1000;
  const api: LexiconPluginApi = {
    selectedTracks: () => tracks,
    selectedPlaylistTracks: async () => lexicon.playlist,
    totalTracks: () => tracks.length,
    // Lexicon pages through the library; return it in two batches.
    nextBatch: async () => [tracks.slice(0, 1), tracks.slice(1), []][Math.min(batches++, 2)],
    createTracks: async (locations) => created.push(locations),
    listFiles: () => Object.keys(files),
    readFile: (name) => files[name],
    writeFile: (name, contents) => {
      files[name] = contents;
    },
    setting: (name) => settings[name],
    ask: async (dialog) => {
      dialogs.push(dialog);
      return answers.length ? answers.shift()! : (dialog.default ?? null);
    },
    report: (message) => reports.push(message),
    log: () => {},
    progress: () => {},
    wait: async (milliseconds) => {
      clock += milliseconds;
      lexicon.frame();
    },
    now: () => clock,
    random: () => 0.5,
  };
  const sent = () => JSON.parse(files[LEXICON_REQUEST_FILE]) as LexiconRequest;
  const answer = (changes: Partial<LexiconRequest>, exports?: Partial<LexiconExports>) => {
    files[LEXICON_REQUEST_FILE] = JSON.stringify({ ...sent(), ...changes });
    if (exports)
      files[LEXICON_EXPORTS_FILE] = JSON.stringify({
        version: 1,
        requestId: sent().requestId,
        exports: [],
        failures: [],
        ...exports,
      });
  };
  return { api, files, reports, dialogs, answers, created, settings, lexicon, sent, answer };
}

describe('Lexicon protocol', () => {
  it('validates requests and outputs read from the plugin folder', () => {
    const convert = request({
      kind: 'convert',
      status: 'converting',
      presetId: 'p',
      progress: 0.5,
    });
    expect(parseRequest(request())).toEqual(request());
    expect(parseRequest(convert)).toEqual(convert);
    for (const value of [
      null,
      { ...request(), version: 2 },
      { ...request(), requestId: '../escape' },
      { ...request(), kind: 'delete' },
      { ...request(), status: 'done!' },
      { ...request(), tracks: [{ id: -1, location: 'a.mp3' }] },
      { ...request(), tracks: [{ id: 1, location: 'a\0.mp3' }] },
      { ...request(), tracks: Array.from({ length: 2001 }, (_, id) => ({ id, location: 'a' })) },
      { ...convert, presetId: undefined },
      { ...convert, kind: 'export' },
      { ...convert, progress: 2 },
    ])
      expect(() => parseRequest(value)).toThrow();
    expect(() => parseExports({ version: 1, requestId: 'x', exports: [{ id: 1 }] })).toThrow();
    expect(parseExports({ version: 1, requestId: 'x', exports: [] }).failures).toEqual([]);
  });

  it('records outputs and failures of requested tracks, matching locations by platform', () => {
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
      [request({ status: 'pending' }), 'C:/Music/Song.flac', 2000, 'win32'],
      [request(), 'C:/Music/Unrelated.flac', 2000, 'win32'],
    ] as const)
      expect(
        recordLexiconExport(current, null, saved(source, 'out.mp3', savedAt), platform),
      ).toBeNull();
    expect(recordLexiconFailure(request(), first, { id: 2, error: 'Broken' })).toMatchObject({
      exports: first!.exports,
      failures: [{ id: 2, error: 'Broken' }],
    });
    expect(lexiconLocation('C:\\a\\b.mp3')).toBe('C:/a/b.mp3');
  });

  it('offers DJ audio presets followed by saved audio presets', () => {
    expect(lexiconBuiltInPresets.map((preset) => preset.settings.format)).toEqual([
      'mp3',
      'm4a',
      'wav',
      'wav',
      'mp3',
      'flac',
    ]);
    expect(lexiconBuiltInPresets[0].settings.audioBitrate).toBe(320);
    expect(lexiconBuiltInPresets[2].settings).toMatchObject({
      wavDepth: 16,
      audioSampleRate: 44100,
    });
    const video = { ...builtInPresets[3], id: 'user:video', name: 'Video' },
      audio = { ...lexiconBuiltInPresets[0], id: 'user:audio', name: 'Mine' };
    expect(lexiconPresets([video, audio]).at(-1)).toBe(audio);
    expect(lexiconPresets([video, audio])).not.toContain(video);
  });
});

describe('Lexicon plugin actions', () => {
  it('converts with a chosen preset once Frame publishes presets, then relinks', async () => {
    const tracks: LexiconTrack[] = [
      { id: 1, type: '0', location: 'C:/Music/Song.flac', sizeBytes: 100 },
      { id: 2, location: 'C:/Music/Broken.wav' },
      { id: 3, type: '1' },
    ];
    const lexicon = fakeLexicon(tracks);
    lexicon.answers.push(choices[1].name);
    let ticks = 0;
    lexicon.lexicon.frame = () => {
      // Frame finds the hello file, publishes presets, then works through the request.
      if (!lexicon.files[LEXICON_PRESETS_FILE] && lexicon.files[LEXICON_HELLO_FILE])
        lexicon.files[LEXICON_PRESETS_FILE] = publishedPresets[LEXICON_PRESETS_FILE];
      if (!lexicon.files[LEXICON_REQUEST_FILE]) return;
      ticks++;
      if (ticks === 1) lexicon.answer({ status: 'converting', progress: 0.5 });
      if (ticks === 2)
        lexicon.answer(
          { status: 'done', progress: 1 },
          {
            exports: [{ id: 1, output: 'C:/Music/Song.m4a', format: 'm4a', size: 9, savedAt: 2 }],
            failures: [{ id: 2, error: 'Unsupported file.' }],
          },
        );
    };
    await convertWithFrame(lexicon.api);
    expect(lexicon.sent()).toMatchObject({
      kind: 'convert',
      presetId: choices[1].id,
      tracks: [
        { id: 1, location: 'C:/Music/Song.flac' },
        { id: 2, location: 'C:/Music/Broken.wav' },
      ],
    });
    expect(lexicon.dialogs[0]).toMatchObject({ input: 'select', settingsKey: 'Preset' });
    expect(tracks[0]).toMatchObject({ location: 'C:/Music/Song.m4a', sizeBytes: 9 });
    expect(lexicon.reports).toEqual([
      'Skipped 1 streaming track(s).',
      'Relinked 1 track(s) to their converted files.',
      '1 track(s) could not be converted:',
      '• Track 2: Unsupported file.',
    ]);
    // The convert action imported everything already; a manual import finds nothing new.
    lexicon.reports.length = 0;
    await importFromFrame(lexicon.api);
    expect(lexicon.reports).toEqual(['Everything from Frame is already imported.']);
  });

  it('stops cleanly when Frame is closed or the dialog is cancelled', async () => {
    const closed = fakeLexicon([{ id: 1, location: 'C:/Music/Song.flac' }]);
    await convertWithFrame(closed.api);
    expect(closed.files[LEXICON_REQUEST_FILE]).toBeUndefined();
    expect(closed.reports).toEqual(['Frame did not respond. Open Frame, then try again.']);

    const cancelled = fakeLexicon([{ id: 1, location: 'C:/Music/Song.flac' }], {
      ...publishedPresets,
    });
    cancelled.answers.push(null);
    await convertWithFrame(cancelled.api);
    expect(cancelled.files[LEXICON_REQUEST_FILE]).toBeUndefined();

    const unanswered = fakeLexicon([{ id: 1, location: 'C:/Music/Song.flac' }], {
      ...publishedPresets,
    });
    await convertWithFrame(unanswered.api);
    expect(unanswered.sent().status).toBe('pending');
    expect(unanswered.reports[0]).toMatch(/did not finish the conversion/);
  });

  it('exports the selected playlist to a folder without touching the library', async () => {
    const lexicon = fakeLexicon([], { ...publishedPresets });
    lexicon.lexicon.playlist = [{ id: 5, location: 'C:/Music/Set/Intro.flac' }];
    lexicon.settings['Export folder'] = 'E:/USB';
    lexicon.lexicon.frame = () =>
      lexicon.answer(
        { status: 'done' },
        { exports: [{ id: 5, output: 'E:/USB/Intro.wav', format: 'wav', size: 1, savedAt: 2 }] },
      );
    await exportWithFrame(lexicon.api);
    expect(lexicon.sent()).toMatchObject({
      kind: 'export',
      destination: 'E:/USB',
      presetId: choices[0].id,
    });
    expect(lexicon.reports).toEqual(['Exported 1 file(s) to E:/USB.']);
    expect(lexicon.files[LEXICON_IMPORTED_FILE]).toBeUndefined();
  });

  it('imports each edit saved in Frame once, using the newest file per track', async () => {
    const tracks: LexiconTrack[] = [
      { id: 2, location: 'C:/Music/Other.wav' },
      { id: 1, location: 'C:/Music/Song.flac', sizeBytes: 100 },
    ];
    const lexicon = fakeLexicon(tracks);
    lexicon.lexicon.frame = () => lexicon.answer({ status: 'opened' });
    await editInFrame(lexicon.api);
    expect(lexicon.reports[0]).toBe("Opened 2 track(s) in Frame's editor.");
    lexicon.answer(
      {},
      {
        exports: [
          { id: 1, output: 'C:/Out/Song.mp3', format: 'mp3', size: 5, savedAt: 2000 },
          { id: 1, output: 'C:/Out/Song.flac', format: 'flac', size: 9, savedAt: 3000 },
          { id: 3, output: 'C:/Out/Gone.mp3', format: 'mp3', size: 1, savedAt: 2000 },
        ],
      },
    );
    lexicon.reports.length = 0;
    await importFromFrame(lexicon.api);
    expect(tracks[1]).toEqual({ id: 1, location: 'C:/Out/Song.flac', sizeBytes: 9 });
    expect(lexicon.reports).toEqual([
      'Relinked 1 track(s) to their converted files.',
      '1 track(s) are no longer in your library.',
    ]);
    lexicon.reports.length = 0;
    await importFromFrame(lexicon.api);
    expect(lexicon.reports).toEqual(['Everything from Frame is already imported.']);

    const adding = fakeLexicon([], { ...lexicon.files });
    delete adding.files[LEXICON_IMPORTED_FILE];
    adding.settings[LEXICON_IMPORT_MODE] = LEXICON_ADD;
    await importFromFrame(adding.api);
    expect(adding.created).toEqual([['C:/Out/Song.flac', 'C:/Out/Gone.mp3']]);

    frameStatus(lexicon.api);
    expect(lexicon.reports.at(-1)).toBe('2 file(s) saved, 2 imported, 0 failed.');
  });
});

describe('Lexicon integration', () => {
  async function fixture(overrides: Partial<LexiconRequestOptions> = {}) {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'frame-lexicon-')));
    const documents = join(root, 'Documents'),
      music = join(root, 'Music'),
      bundled = join(root, LEXICON_PLUGIN_FILE),
      plugins = lexiconPluginsFolder(documents),
      folder = join(plugins, 'Frame', 'Files'),
      opened: [string[], string][] = [],
      converted: string[] = [];
    await mkdir(music, { recursive: true });
    await mkdir(folder, { recursive: true });
    await writeFile(join(music, 'Song.flac'), 'audio');
    await writeFile(bundled, 'plugin v2');
    const requests = new LexiconRequests({
      pluginsFolder: plugins,
      presets: () => lexiconBuiltInPresets,
      open: (paths, workflow) => opened.push([paths, workflow]),
      // Stands in for FFmpeg: the output is a copy named after the preset's format.
      convert: async (work) => {
        converted.push(work.source);
        work.progress(0.5);
        const path = join(work.output, `Song.${work.settings.format}`);
        await copyFile(work.source, path);
        return { path, size: 5, format: work.settings.format };
      },
      progressInterval: 0,
      ...overrides,
    });
    const send = (changes: Partial<LexiconRequest>) =>
      writeFile(
        join(folder, LEXICON_REQUEST_FILE),
        JSON.stringify(
          request({
            status: 'pending',
            createdAt: 0,
            tracks: [
              { id: 1, location: lexiconLocation(join(music, 'Song.flac')) },
              { id: 2, location: lexiconLocation(join(music, 'Missing.wav')) },
            ],
            ...changes,
          }),
        ),
      );
    const read = async (name: string) => JSON.parse(await readFile(join(folder, name), 'utf8'));
    return {
      root,
      documents,
      music,
      bundled,
      plugins,
      folder,
      opened,
      converted,
      requests,
      send,
      read,
    };
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

  it('publishes presets to the plugin folder and opens edit requests in the editor', async () => {
    const { folder, music, opened, requests, send, read } = await fixture();
    await writeFile(join(folder, LEXICON_HELLO_FILE), '{}');
    await requests.poll();
    expect((await read(LEXICON_PRESETS_FILE)).presets).toEqual(choices);
    await send({});
    await requests.poll();
    await requests.poll();
    expect(opened).toEqual([[[lexiconLocation(join(music, 'Song.flac'))], 'edit']]);
    expect((await read(LEXICON_REQUEST_FILE)).status).toBe('opened');

    await requests.record(saved(join(music, 'Song.flac'), join(music, 'Song.mp3')));
    await requests.record(saved(join(music, 'Unrelated.flac'), join(music, 'Unrelated.mp3')));
    const exports = parseExports(await read(LEXICON_EXPORTS_FILE));
    expect(exports.exports.map((entry) => [entry.id, entry.output])).toEqual([
      [1, lexiconLocation(join(music, 'Song.mp3'))],
    ]);
  });

  it('converts next to the source or into an export folder, recording each result', async () => {
    const { root, music, converted, requests, send, read } = await fixture();
    await send({ kind: 'convert', presetId: 'lexicon:wav-16' });
    await requests.poll();
    await requests.settled();
    expect(converted).toEqual([lexiconLocation(join(music, 'Song.flac'))]);
    expect(await read(LEXICON_REQUEST_FILE)).toMatchObject({ status: 'done', progress: 1 });
    const exports = parseExports(await read(LEXICON_EXPORTS_FILE));
    expect(exports.exports.map((entry) => [entry.id, entry.output, entry.format])).toEqual([
      [1, lexiconLocation(join(music, 'Song.wav')), 'wav'],
    ]);
    expect(exports.failures).toEqual([{ id: 2, error: 'The file was not found.' }]);

    const usb = join(root, 'USB', 'Set');
    await send({
      kind: 'export',
      presetId: 'builtin:lossless',
      destination: usb,
      requestId: '2-2',
    });
    await requests.poll();
    await requests.settled();
    expect(await readFile(join(usb, 'Song.flac'), 'utf8')).toBe('audio');
    expect((await read(LEXICON_REQUEST_FILE)).status).toBe('done');
  });

  it('fails requests it cannot serve and reports when Frame stops mid-conversion', async () => {
    const { requests, send, read } = await fixture();
    await send({ tracks: [{ id: 1, location: '/nowhere/Song.flac' }] });
    await requests.poll();
    expect(await read(LEXICON_REQUEST_FILE)).toMatchObject({
      status: 'failed',
      error: expect.stringMatching(/files were found/),
    });
    await send({ kind: 'convert', presetId: 'user:deleted' });
    await requests.poll();
    expect((await read(LEXICON_REQUEST_FILE)).error).toMatch(/no longer available/);
    await send({ kind: 'export', presetId: 'builtin:audio', destination: 'relative/folder' });
    await requests.poll();
    expect((await read(LEXICON_REQUEST_FILE)).error).toMatch(/complete export folder/);

    const blocked = await fixture({
      convert: (work) =>
        new Promise((_, reject) =>
          work.signal.addEventListener('abort', () => reject(new Error('cancelled'))),
        ),
    });
    await blocked.send({ kind: 'convert', presetId: 'builtin:audio' });
    await blocked.requests.poll();
    await blocked.requests.stop();
    expect((await blocked.read(LEXICON_REQUEST_FILE)).error).toMatch(/Frame closed/);
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

  it('packages actions that convert a Lexicon track through Frame and relink it', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'frame-lexicon-build-')));
    await prepareLexiconPlugin(root);
    const archive = unzipSync(await readFile(join(root, LEXICON_PLUGIN_FILE)));
    const manifest = JSON.parse(strFromU8(archive['config.json']));
    expect(manifest.author).toEqual({ name: 'Frame' });
    for (const action of manifest.actions) {
      expect(archive[`${action.id}.js`]).toBeDefined();
      expect(lexiconSandboxViolations(strFromU8(archive[`${action.id}.js`]))).toEqual([]);
    }

    // Lexicon's side: a selected track and the plugin's Files folder, which Frame polls.
    const documents = join(root, 'Documents'),
      folder = join(lexiconPluginsFolder(documents), 'Frame', 'Files'),
      source = join(root, 'Song.flac');
    await mkdir(folder, { recursive: true });
    await writeFile(source, 'audio');
    const library = [{ id: 7, type: '0', location: lexiconLocation(source), sizeBytes: 5 }];
    const frame = new LexiconRequests({
      pluginsFolder: lexiconPluginsFolder(documents),
      presets: () => lexiconBuiltInPresets,
      open: () => {},
      convert: async (work) => {
        const path = join(work.output, 'Song.mp3');
        await writeFile(path, 'converted');
        return { path, size: 9, format: 'mp3' };
      },
    });
    const reports: string[] = [];
    await runInNewContext(`(async () => {\n${strFromU8(archive['frame.convert.js'])}\n})()`, {
      _vars: { tracksSelected: library, tracksAllAmount: 1, playlistsSelected: [] },
      _library: { track: { getNextAllBatch: async () => [], create: async () => {} } },
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
        Wait: async () => {
          await frame.poll();
          await frame.settled();
        },
      },
      _ui: {
        progress: () => {},
        showInputDialog: async (dialog: LexiconDialog) => dialog.options![0],
      },
    });
    expect(library[0]).toMatchObject({
      location: lexiconLocation(join(root, 'Song.mp3')),
      sizeBytes: 9,
    });
    expect(reports).toEqual(['Relinked 1 track(s) to their converted files.']);
  });
});
