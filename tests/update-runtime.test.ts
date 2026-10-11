import { afterEach, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  cleanupWindowsUpdateRuntimes,
  prepareWindowsUpdateRuntime,
} from '../electron/update-runtime';

let directory: string;
afterEach(async () => {
  vi.restoreAllMocks();
  if (directory) await rm(directory, { recursive: true, force: true });
});
it('copies the Windows Node host outside the installation without bundling app resources', async () => {
  directory = await mkdtemp(join(tmpdir(), 'frame-runtime-'));
  const install = join(directory, 'install'),
    apply = join(directory, 'apply');
  await mkdir(install);
  await mkdir(apply);
  await mkdir(join(install, 'resources'));
  for (const file of [
    'Frame.exe',
    'icudtl.dat',
    'snapshot_blob.bin',
    'libEGL.dll',
    'resources.pak',
    'Uninstall Frame.exe',
  ])
    await writeFile(join(install, file), file);
  const host = await prepareWindowsUpdateRuntime(join(install, 'Frame.exe'), apply);
  expect(await readFile(host, 'utf8')).toBe('Frame.exe');
  expect(await readdir(join(apply, 'runtime'))).toEqual([
    'FrameUpdateHost.exe',
    'icudtl.dat',
    'libEGL.dll',
    'resources.pak',
    'snapshot_blob.bin',
  ]);
  await rm(install, { recursive: true });
  expect(await readFile(host, 'utf8')).toBe('Frame.exe');
});
it('cleans only completed runtimes whose worker has exited', async () => {
  directory = await mkdtemp(join(tmpdir(), 'frame-runtime-'));
  const release = join(directory, 'updates', 'v1.0.1-build.2');
  const completed = join(release, 'apply-abc'),
    active = join(release, 'apply-def');
  for (const apply of [completed, active]) {
    await mkdir(join(apply, 'runtime'), { recursive: true });
    await writeFile(join(apply, 'complete'), '');
    await writeFile(
      join(apply, 'runtime.pid'),
      apply === completed ? '123456' : String(process.pid),
    );
    await writeFile(join(apply, 'helper.log'), 'diagnostics');
  }
  vi.spyOn(process, 'kill').mockImplementation((pid) => {
    if (pid === 123456) throw Object.assign(new Error('No such process'), { code: 'ESRCH' });
    return true;
  });
  await cleanupWindowsUpdateRuntimes(directory);
  expect(await readdir(completed)).not.toContain('runtime');
  expect(await readdir(active)).toContain('runtime');
  expect(await readFile(join(completed, 'helper.log'), 'utf8')).toBe('diagnostics');
});
