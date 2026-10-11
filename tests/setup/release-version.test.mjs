import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { selectReleaseVersion, applyReleaseVersion } from '../../scripts/release-version.mjs';

const options = { fallback: '0.1.0' };
const stable = (version) => ({ tag_name: `v${version}`, prerelease: false });
const pre = (version, build = 10) => ({ tag_name: `v${version}-build.${build}`, prerelease: true });

test('uses the next patch after a full release without increasing it on every push', () => {
  assert.equal(selectReleaseVersion({ ...options, releases: [stable('1.0.0')] }).version, '1.0.1');
  assert.equal(
    selectReleaseVersion({
      ...options,
      releases: [pre('1.0.1', 11), stable('1.0.0'), pre('1.0.1')],
    }).version,
    '1.0.1',
  );
  assert.equal(
    selectReleaseVersion({ ...options, releases: [stable('1.0.1'), pre('1.0.1')] }).version,
    '1.0.2',
  );
});
test('continues a manually chosen prerelease line, handles numeric versions, and ignores drafts', () => {
  assert.equal(
    selectReleaseVersion({ ...options, releases: [pre('1.10.0'), stable('1.9.0')] }).version,
    '1.10.0',
  );
  assert.equal(
    selectReleaseVersion({
      ...options,
      releases: [{ ...stable('9.0.0'), draft: true }, { tag_name: 'nightly' }],
    }).version,
    '0.1.0',
  );
  assert.deepEqual(selectReleaseVersion({ ...options, requested: '1.0.0', kind: 'release' }), {
    version: '1.0.0',
    kind: 'release',
  });
});
test('rejects unsafe or regressing manual release versions', () => {
  for (const requested of [
    'v1.0.0',
    '01.0.0',
    '1.0.0-beta',
    '1.0.0\nextra',
    '1.0.0\n',
    '999999999999999999999.0.0',
  ])
    assert.throws(() => selectReleaseVersion({ ...options, requested }), /Choose/);
  assert.throws(() => selectReleaseVersion({ ...options, kind: 'unknown' }), /Choose/);
  assert.throws(
    () =>
      selectReleaseVersion({
        ...options,
        releases: [stable('1.0.0')],
        requested: '1.0.0',
        kind: 'release',
      }),
    /at least 1.0.1/,
  );
});
test('applies the selected version to the manifest and both root lockfile entries', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'frame-version-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(
    join(directory, 'package.json'),
    JSON.stringify({ name: 'frame', version: '0.1.0' }),
  );
  await writeFile(
    join(directory, 'package-lock.json'),
    JSON.stringify({
      version: '0.1.0',
      packages: { '': { version: '0.1.0' }, 'node_modules/example': { version: '3.0.0' } },
    }),
  );
  await applyReleaseVersion('1.0.1', pathToFileURL(`${directory}/`));
  const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(join(directory, 'package-lock.json'), 'utf8'));
  assert.equal(pkg.version, '1.0.1');
  assert.equal(lock.version, '1.0.1');
  assert.equal(lock.packages[''].version, '1.0.1');
  assert.equal(lock.packages['node_modules/example'].version, '3.0.0');
});
