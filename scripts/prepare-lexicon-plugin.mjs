import { build } from 'esbuild';
import { zipSync, strToU8 } from 'fflate';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { lexiconSandboxViolations, toLexiconSandbox } from './lexicon-sandbox.mjs';

const actions = { 'frame.convert': 'convertInFrame', 'frame.edit': 'editInFrame' };
// Adapts Lexicon's plugin globals to LexiconPluginApi. Globals are only touched when used,
// because Lexicon leaves them null for actions without the matching permission.
const sandboxApi = `{
  selectedTracks: function () { return _vars.tracksSelected || [] },
  createTracks: function (locations) { return _library.track.create(locations) },
  listFiles: function () { return _files.list() },
  readFile: function (name) { return _files.read(name) },
  writeFile: function (name, contents) { return _files.write(name, contents) },
  setting: function (name) { return _settings[name] },
  log: function (message) { _helpers.Log(message) },
  progress: function (ratio) { _ui.progress(ratio) },
  wait: function (milliseconds) { return _helpers.Wait(milliseconds) },
  now: function () { return Date.now() },
  random: function () { return Math.random() }
}`;

/** Bundles one self-contained script per plugin action and checks it against the sandbox. */
export async function bundleLexiconActions() {
  const scripts = {};
  for (const [id, exported] of Object.entries(actions)) {
    const result = await build({
      stdin: {
        contents: `import { ${exported} } from './src/core/lexicon-plugin';\nawait ${exported}(${sandboxApi});\n`,
        resolveDir: resolve('.'),
        loader: 'ts',
      },
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'neutral',
      // Lexicon's preprocessor predates optional chaining; await at the top level is how an
      // action tells Lexicon it is still running.
      target: 'es2019',
      supported: { 'top-level-await': true },
      legalComments: 'none',
    });
    const code = toLexiconSandbox(result.outputFiles[0].text);
    const violations = lexiconSandboxViolations(code);
    if (violations.length)
      throw new Error(`${id}.js does not run in Lexicon's sandbox:\n${violations.join('\n')}`);
    scripts[`${id}.js`] = code;
  }
  return scripts;
}

export async function lexiconManifest() {
  const result = await build({
    entryPoints: ['src/core/lexicon-plugin-manifest.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
  });
  const url = `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`;
  return (await import(url)).lexiconPluginManifest;
}

export async function prepareLexiconPlugin(root = join('build', 'generated', 'lexicon-plugin')) {
  const files = {
    'config.json': strToU8(JSON.stringify(await lexiconManifest(), null, 2)),
    ...Object.fromEntries(
      Object.entries(await bundleLexiconActions()).map(([name, code]) => [name, strToU8(code)]),
    ),
  };
  await mkdir(root, { recursive: true });
  // A fixed timestamp keeps the archive byte-identical, so Frame can tell when it is outdated.
  await writeFile(join(root, 'Frame.zip'), zipSync(files, { mtime: new Date(2020, 0, 1) }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await prepareLexiconPlugin();
