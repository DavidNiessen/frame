import { spawn } from 'node:child_process';
import { windowsPowerShellEnv } from '../scripts/windows-powershell-env.mjs';
import { access, mkdir, open, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { UpdateRelease } from '../src/core/app-updates';
import type { UpdateInstallPlan } from './update-install-types';

export interface UpdateInstallLocation {
  platform: string;
  arch: string;
  development: boolean;
  executable: string;
  appImage?: string;
  userData: string;
  helperDirectory: string;
}
export function supportsUpdateInstall(location: UpdateInstallLocation) {
  return (
    !location.development &&
    (location.platform === 'darwin' ||
      location.platform === 'win32' ||
      (location.platform === 'linux' && !!location.appImage))
  );
}
export async function updateInstallTarget(location: UpdateInstallLocation) {
  if (!supportsUpdateInstall(location))
    throw new Error(
      'Restart-to-update is available in installed Frame apps. On Linux, launch the AppImage.',
    );
  const path = await realpath(
    location.platform === 'linux' ? location.appImage! : location.executable,
  );
  if (location.platform === 'darwin') {
    const target = dirname(dirname(dirname(path)));
    if (
      !target.endsWith('.app') ||
      basename(path) !== 'Frame' ||
      dirname(path) !== join(target, 'Contents/MacOS')
    )
      throw new Error('Could not locate the installed Frame application.');
    if (target.startsWith('/Volumes/'))
      throw new Error('Move Frame to Applications before installing an update.');
    return target;
  }
  if (location.platform === 'win32') {
    if (basename(path).toLowerCase() !== 'frame.exe')
      throw new Error('Could not locate the installed Frame application.');
    return dirname(path);
  }
  if (!isAbsolute(path) || !path.endsWith('.AppImage'))
    throw new Error('Could not locate Frame’s AppImage.');
  return path;
}

/** Hand off to a private helper outside the app. It stages first, waits for exit, then applies. */
export async function armUpdateInstall(
  location: UpdateInstallLocation,
  update: { path: string; checksum: string; release: UpdateRelease },
  canRestart: () => boolean = () => true,
) {
  const target = await updateInstallTarget(location);
  const directory = join(location.userData, 'updates', update.release.tag, `apply-${randomUUID()}`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const plan: UpdateInstallPlan = {
    platform: location.platform as UpdateInstallPlan['platform'],
    arch: location.arch,
    parent: process.pid,
    source: update.path,
    checksum: update.checksum,
    target,
    version: update.release.tag.slice(1).split('-')[0],
    directory,
    userData: location.userData,
  };
  const planPath = join(directory, 'plan.json');
  await writeFile(planPath, JSON.stringify(plan), { mode: 0o600 });
  const windows = location.platform === 'win32';
  const helper = join(directory, 'update-worker.cjs');
  await writeFile(helper, await readFile(join(location.helperDirectory, basename(helper))), {
    mode: 0o600,
  });
  if (windows)
    await writeFile(
      join(directory, 'update-windows.ps1'),
      await readFile(join(location.helperDirectory, 'update-windows.ps1')),
      { mode: 0o600 },
    );
  const outputPath = join(directory, 'helper.log');
  const output = await open(outputPath, 'wx', 0o600);
  const child = spawn(location.executable, [helper, planPath], {
    detached: true,
    windowsHide: true,
    stdio: ['ignore', output.fd, output.fd],
    env: { ...(windows ? windowsPowerShellEnv() : process.env), ELECTRON_RUN_AS_NODE: '1' },
  });
  let launchError: Error | undefined;
  child.once('error', (error) => {
    launchError = error;
  });
  child.unref();
  await output.close();
  try {
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      if (launchError) throw launchError;
      try {
        const failure = JSON.parse(
          (await readFile(join(directory, 'error.json'), 'utf8')).replace(/^\uFEFF/, ''),
        );
        throw new Error(failure.error);
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
      }
      const armed = await access(join(directory, 'armed')).then(
        () => true,
        () => false,
      );
      if (armed) {
        if (!canRestart())
          throw new Error('Finish or cancel active media jobs before restarting to update.');
        return;
      }
      if (child.exitCode !== null) {
        const details = (await readFile(outputPath, 'utf8')).trim().slice(-4000);
        throw new Error(
          `The update helper stopped before preparing the update (exit ${child.exitCode}).${details ? ' ' + details : ''}`,
        );
      }
      await delay(100);
    }
    throw new Error('Preparing the update took too long. Frame was not changed.');
  } catch (cause) {
    await writeFile(join(directory, 'cancel'), '', { mode: 0o600 }).catch(() => {});
    const cleanupDeadline = Date.now() + 3000;
    while (child.exitCode === null && child.signalCode === null && Date.now() < cleanupDeadline)
      await delay(100);
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await rm(directory, { recursive: true, force: true }).catch(() => {});
    throw cause;
  }
}
