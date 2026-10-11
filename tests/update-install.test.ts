import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  chmod,
  copyFile,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import { applyReplacement, stageReplacement } from '../electron/update-replacement';
import { supportsUpdateInstall, updateInstallTarget } from '../electron/update-install';
import type { UpdateInstallPlan } from '../electron/update-install-types';

const directories: string[] = [];
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'frame update '));
  directories.push(directory);
  const target = join(directory, 'Frame.AppImage'),
    source = join(directory, 'new.AppImage');
  await writeFile(target, 'original app');
  await chmod(target, 0o755);
  const next = `#!/bin/sh\nprintf '%s' "\${ELECTRON_RUN_AS_NODE-unset}" > '${join(directory, 'launch-mode')}'\nprintf new > '${join(directory, 'launched')}'\n`;
  await writeFile(source, next);
  const plan: UpdateInstallPlan = {
    platform: 'linux',
    arch: 'x64',
    parent: process.pid,
    source,
    checksum: createHash('sha256').update(next).digest('hex'),
    target,
    version: '1.0.1',
    directory,
    userData: directory,
  };
  return { plan, next };
}
afterEach(async () => {
  for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true });
});

describe('managed application replacement', () => {
  it.skipIf(process.platform !== 'win32')(
    'runs PowerShell under a detached worker and waits for the old process before installing',
    async () => {
      const { plan } = await fixture();
      plan.platform = 'win32';
      plan.target = plan.directory;
      plan.source = join(plan.directory, 'installer.cmd');
      const installer = '@echo off\r\nexit /b 23\r\n';
      await writeFile(plan.source, installer);
      plan.checksum = createHash('sha256').update(installer).digest('hex');
      const helper = join(plan.directory, 'update-worker.cjs');
      await build({
        entryPoints: ['electron/update-worker.ts'],
        outfile: helper,
        bundle: true,
        platform: 'node',
        format: 'cjs',
      });
      await copyFile('electron/update-windows.ps1', join(plan.directory, 'update-windows.ps1'));
      const parent = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)']);
      plan.parent = parent.pid!;
      const path = join(plan.directory, 'plan.json');
      await writeFile(path, JSON.stringify(plan));
      const worker = spawn(process.execPath, [helper, path], {
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      });
      let output = '';
      worker.stdout.on('data', (chunk) => {
        output += chunk;
      });
      worker.stderr.on('data', (chunk) => {
        output += chunk;
      });
      const completed = new Promise<number | null>((resolve) => worker.once('exit', resolve));
      try {
        await expect
          .poll(
            async () => {
              if (worker.exitCode !== null)
                throw new Error('Worker exited before readiness: ' + output);
              return readdir(plan.directory);
            },
            { timeout: 15000 },
          )
          .toContain('armed');
        expect((await readdir(plan.directory)).includes('error.json')).toBe(false);
        parent.kill();
        expect(await completed).toBe(1);
        expect(
          JSON.parse(
            (await readFile(join(plan.directory, 'error.json'), 'utf8')).replace(/^\uFEFF/, ''),
          ).error,
        ).toContain('exit code 23');
        expect((await readdir(plan.directory)).includes('complete')).toBe(false);
      } finally {
        parent.kill();
        worker.kill();
      }
    },
    25000,
  );
  it('stages on the same filesystem without changing the running app, then swaps and cleans up', async () => {
    const { plan, next } = await fixture();
    const staged = await stageReplacement(plan);
    expect(await readFile(plan.target, 'utf8')).toBe('original app');
    await applyReplacement(plan, staged, async () => {});
    expect(await readFile(plan.target, 'utf8')).toBe(next);
    expect(
      (await readdir(plan.directory)).filter((name) => name.startsWith('.Frame-update')),
    ).toEqual([]);
  });
  it('restores the old app if relaunch fails and rejects modified staged or downloaded bytes', async () => {
    const { plan } = await fixture();
    const staged = await stageReplacement(plan);
    await expect(
      applyReplacement(plan, staged, async () => {
        throw new Error('launch failed');
      }),
    ).rejects.toThrow('launch failed');
    expect(await readFile(plan.target, 'utf8')).toBe('original app');
    const retry = await stageReplacement(plan);
    await writeFile(retry, 'tampered');
    await expect(applyReplacement(plan, retry, async () => {})).rejects.toThrow(
      'checksum mismatch',
    );
    expect(await readFile(plan.target, 'utf8')).toBe('original app');
    await writeFile(plan.source, 'tampered');
    await expect(stageReplacement(plan)).rejects.toThrow('checksum mismatch');
  });
  it.skipIf(process.platform === 'win32')(
    'runs the real detached helper, waits for the old process, then replaces and launches the new app',
    async () => {
      const { plan, next } = await fixture();
      const helper = join(plan.directory, 'update-worker.cjs');
      await build({
        entryPoints: ['electron/update-worker.ts'],
        outfile: helper,
        bundle: true,
        platform: 'node',
        format: 'cjs',
      });
      const parent = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)']);
      plan.parent = parent.pid!;
      const path = join(plan.directory, 'plan.json');
      await writeFile(path, JSON.stringify(plan));
      const worker = spawn(process.execPath, [helper, path], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      });
      const completed = new Promise<number | null>((resolve) => worker.once('exit', resolve));
      try {
        await expect.poll(async () => readdir(plan.directory)).toContain('armed');
        expect(await readFile(plan.target, 'utf8')).toBe('original app');
        parent.kill();
        expect(await completed).toBe(0);
        expect(await readFile(plan.target, 'utf8')).toBe(next);
        await expect.poll(async () => readdir(plan.directory)).toContain('launched');
        expect(await readFile(join(plan.directory, 'launch-mode'), 'utf8')).toBe('unset');
        expect(await readFile(join(plan.directory, 'complete'), 'utf8')).toBe('');
      } finally {
        parent.kill();
        worker.kill();
      }
    },
  );
  it('refuses to install over development runtimes and resolves only the persistent AppImage', async () => {
    const { plan } = await fixture();
    const location = {
      platform: 'linux',
      arch: 'x64',
      executable: process.execPath,
      appImage: plan.target,
      userData: plan.directory,
      helperDirectory: plan.directory,
      development: false,
    };
    expect(await updateInstallTarget(location)).toBe(await realpath(plan.target));
    expect(supportsUpdateInstall({ ...location, appImage: undefined })).toBe(false);
    await expect(updateInstallTarget({ ...location, development: true })).rejects.toThrow(
      'installed Frame',
    );
  });
});
