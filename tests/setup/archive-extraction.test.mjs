import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

test('Electron ZIP extraction completes instead of silently exiting partway through', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-extraction-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const archive = fileURLToPath(new URL('../fixtures/electron-extraction.zip', import.meta.url));
  // Resolve Electron's actual extractor, including pnpm's nested dependency layout.
  const script = `
    const { createRequire } = require('node:module');
    const electronRequire = createRequire(process.argv[1]);
    electronRequire('extract-zip')(process.argv[2], { dir: process.argv[3] })
      .then(() => console.log('Extraction completed'))
      .catch(error => { console.error(error); process.exitCode = 1; });
  `;
  const result = spawnSync(process.execPath, ['-e', script, require.resolve('electron/package.json'), archive, directory], {
    encoding: 'utf8', timeout: 10000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Extraction completed/, 'A zero exit code alone does not prove extraction completed.');
  const bytes = await readFile(join(directory, 'nested', 'runtime.bin'));
  assert.equal(bytes.length, 128 * 1024);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'ce840a6252179c857bb12f5186fe404a29f69df48468255a4c5eca7e3a68412a');
});
