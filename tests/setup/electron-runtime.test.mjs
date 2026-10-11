import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ensureElectronRuntime } from '../../scripts/electron-runtime.mjs';

async function fixture(t, installer = '') {
  const directory = await mkdtemp(join(tmpdir(), 'frame-electron-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'install.js'), installer);
  return directory;
}

const installRuntime = `
  const fs = require('node:fs');
  const path = require('node:path');
  fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'dist', 'electron.exe'), 'runtime');
  fs.writeFileSync(path.join(__dirname, 'path.txt'), 'electron.exe');
`;

test('an installed runtime works with downloads disabled and does not run its installer', async (t) => {
  const directory = await fixture(t, 'process.exit(7)');
  await mkdir(join(directory, 'dist'));
  await writeFile(join(directory, 'dist', 'electron.exe'), 'runtime');
  await writeFile(join(directory, 'path.txt'), 'electron.exe');
  assert.equal(
    await ensureElectronRuntime({ directory, env: { ELECTRON_SKIP_BINARY_DOWNLOAD: '1' } }),
    join(directory, 'dist', 'electron.exe'),
  );
});

test('repairs missing path.txt by running the installed package installer', async (t) => {
  const directory = await fixture(t, installRuntime);
  assert.equal(
    await ensureElectronRuntime({ directory, env: {} }),
    join(directory, 'dist', 'electron.exe'),
  );
  assert.equal(await readFile(join(directory, 'path.txt'), 'utf8'), 'electron.exe');
});

test('repairs a missing binary even when path.txt exists', async (t) => {
  const directory = await fixture(t, installRuntime);
  await writeFile(join(directory, 'path.txt'), 'electron.exe');
  assert.equal(
    await ensureElectronRuntime({ directory, env: {} }),
    join(directory, 'dist', 'electron.exe'),
  );
});

for (const value of ['1', '0', 'false']) {
  test(`reports the skip-download flag when set to ${value}, without bypassing it`, async (t) => {
    const directory = await fixture(t, installRuntime);
    await assert.rejects(
      ensureElectronRuntime({ directory, env: { ELECTRON_SKIP_BINARY_DOWNLOAD: value } }),
      /ELECTRON_SKIP_BINARY_DOWNLOAD.*exits successfully.*set ELECTRON_SKIP_BINARY_DOWNLOAD=/,
    );
    await assert.rejects(readFile(join(directory, 'path.txt')), { code: 'ENOENT' });
  });
}

test('uses a valid custom runtime and refuses to overwrite an incomplete custom runtime', async (t) => {
  const directory = await fixture(t, installRuntime);
  const custom = join(directory, 'custom');
  const env = { ELECTRON_OVERRIDE_DIST_PATH: custom };
  await mkdir(custom);
  await writeFile(join(directory, 'path.txt'), 'electron.exe');
  await assert.rejects(
    ensureElectronRuntime({ directory, env }),
    /ELECTRON_OVERRIDE_DIST_PATH.*incomplete/,
  );
  await writeFile(join(custom, 'electron.exe'), 'runtime');
  assert.equal(await ensureElectronRuntime({ directory, env }), join(custom, 'electron.exe'));
  await assert.rejects(readFile(join(directory, 'dist', 'electron.exe')), { code: 'ENOENT' });
});

test('reports an installer failure rather than continuing desktop startup', async (t) => {
  const directory = await fixture(t, 'process.exit(7)');
  await assert.rejects(
    ensureElectronRuntime({ directory, env: {} }),
    /installation failed \(exit 7\)/,
  );
});

test('rejects an installer that exits successfully without producing a runtime', async (t) => {
  const directory = await fixture(t, 'process.exit(0)');
  await assert.rejects(
    ensureElectronRuntime({ directory, env: {} }),
    /installer finished but its runtime is still missing/,
  );
});

test('desktop launch and setup report a configuration error before starting Vite', async (t) => {
  const directory = await fixture(t);
  for (const script of ['dev-desktop.mjs', 'setup-desktop.mjs']) {
    const result = spawnSync(process.execPath, [`scripts/${script}`], {
      cwd: new URL('../../', import.meta.url),
      env: { ...process.env, ELECTRON_OVERRIDE_DIST_PATH: join(directory, 'missing') },
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ELECTRON_OVERRIDE_DIST_PATH.*setup:desktop/);
    assert.doesNotMatch(result.stderr, /Electron failed to install correctly|already in use/);
  }
});
