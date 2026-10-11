import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareRelease } from '../../scripts/prepare-release.mjs';

const names = ['win-x64.exe', 'mac-arm64.dmg', 'mac-x64.dmg', 'linux-x86_64.AppImage'].map(
  (suffix) => `Frame-0.1.0-${suffix}`,
);
async function fixture(t, include = names) {
  const directory = await mkdtemp(join(tmpdir(), 'frame-release-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const name of include) await writeFile(join(directory, name), `installer ${name}`);
  return {
    directory,
    options: {
      version: '0.1.0',
      runNumber: '42',
      sha: 'a'.repeat(40),
      notesPath: join(directory, 'notes.md'),
    },
  };
}
test('prepares all platforms with reproducible checksums and unique build tags', async (t) => {
  const { directory, options } = await fixture(t);
  assert.deepEqual(await prepareRelease(directory, options), {
    tag: 'v0.1.0-build.42',
    title: 'Frame 0.1.0 (build 42)',
  });
  const sums = await readFile(join(directory, 'SHA256SUMS.txt'), 'utf8');
  for (const name of names)
    assert.ok(
      sums.includes(`${createHash('sha256').update(`installer ${name}`).digest('hex')}  ${name}\n`),
    );
  const notes = await readFile(options.notesPath, 'utf8');
  for (const name of names) assert.ok(notes.includes(name));
  assert.ok(notes.includes(options.sha));
  assert.equal(
    (await prepareRelease(directory, { ...options, runNumber: '43' })).tag,
    'v0.1.0-build.43',
  );
});
test('rejects releases missing a platform or containing stale installers', async (t) => {
  const { directory, options } = await fixture(t, names.slice(0, 3));
  await assert.rejects(prepareRelease(directory, options), /Expected exactly/);
  await writeFile(join(directory, names[3]), 'linux');
  await writeFile(join(directory, 'Frame-0.0.9-win-x64.exe'), 'stale');
  await assert.rejects(prepareRelease(directory, options), /Expected exactly/);
});
test('rejects empty installers and invalid release metadata', async (t) => {
  const { directory, options } = await fixture(t);
  await writeFile(join(directory, names[0]), '');
  await assert.rejects(prepareRelease(directory, options), /empty or invalid/);
  await assert.rejects(
    prepareRelease(directory, { ...options, runNumber: undefined }),
    /must be valid/,
  );
  await assert.rejects(prepareRelease(directory, { ...options, sha: 'master' }), /must be valid/);
});
