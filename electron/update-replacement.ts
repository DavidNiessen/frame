import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { access, chmod, copyFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { verifyInstaller } from './update-download';
import type { UpdateInstallPlan } from './update-install-types';

const exec = promisify(execFile);
function launchEnvironment() {
  const environment = { ...process.env };
  // This flag belongs to the detached helper, never the restarted GUI.
  delete environment.ELECTRON_RUN_AS_NODE;
  return environment;
}
async function command(binary: string, args: string[]) {
  return (
    await exec(binary, args, { timeout: 120000, maxBuffer: 1024 * 1024, env: launchEnvironment() })
  ).stdout.trim();
}
export async function verifyMacBundle(path: string, version: string, arch: string) {
  await command('/usr/bin/codesign', ['--verify', '--deep', '--strict', path]);
  const plist = join(path, 'Contents/Info.plist');
  if (
    (await command('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', plist])) !==
    'io.frame.mediaeditor'
  )
    throw new Error('The update is not a Frame application.');
  if (
    (await command('/usr/libexec/PlistBuddy', [
      '-c',
      'Print :CFBundleShortVersionString',
      plist,
    ])) !== version
  )
    throw new Error('The application version does not match the update.');
  const architectures = await command('/usr/bin/lipo', [
    '-archs',
    join(path, 'Contents/MacOS/Frame'),
  ]);
  if (!architectures.split(/\s+/).includes(arch === 'x64' ? 'x86_64' : arch))
    throw new Error('The update does not support this Mac’s processor.');
}

/** Prepare a sibling on the same filesystem before quitting; never alter the running app. */
export async function stageReplacement(plan: UpdateInstallPlan) {
  await verifyInstaller(plan.source, plan.checksum);
  try {
    await access(dirname(plan.target), constants.W_OK);
  } catch {
    throw new Error(
      'Frame’s installation folder is read-only. Move Frame to a writable application folder, then try again.',
    );
  }
  const staged = join(
    dirname(plan.target),
    `.Frame-update-${randomUUID()}${plan.platform === 'darwin' ? '.app' : '.AppImage'}`,
  );
  try {
    if (plan.platform === 'darwin') {
      const mount = join(plan.directory, 'mount');
      await mkdir(mount, { recursive: true });
      let attached = false;
      try {
        await command('/usr/bin/hdiutil', [
          'attach',
          plan.source,
          '-readonly',
          '-nobrowse',
          '-mountpoint',
          mount,
        ]);
        attached = true;
        await verifyMacBundle(join(mount, 'Frame.app'), plan.version, plan.arch);
        await command('/usr/bin/ditto', [join(mount, 'Frame.app'), staged]);
        await verifyMacBundle(staged, plan.version, plan.arch);
      } finally {
        if (attached) await command('/usr/bin/hdiutil', ['detach', mount]);
      }
    } else {
      await copyFile(plan.source, staged, constants.COPYFILE_EXCL);
      await chmod(staged, (await stat(plan.target)).mode & 0o777);
      await verifyInstaller(staged, plan.checksum);
    }
    return staged;
  } catch (cause) {
    await rm(staged, { recursive: true, force: true });
    throw cause;
  }
}

export async function launchReplacement(plan: UpdateInstallPlan) {
  if (plan.platform === 'darwin') {
    await command('/usr/bin/open', [
      '-n',
      plan.target,
      '--args',
      '--updated',
      `--user-data-dir=${plan.userData}`,
    ]);
  } else {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(plan.target, ['--updated', `--user-data-dir=${plan.userData}`], {
        detached: true,
        stdio: 'ignore',
        env: launchEnvironment(),
      });
      child.once('error', reject);
      child.once('spawn', () => {
        child.unref();
        resolve();
      });
    });
  }
}

/** Roll back if replacement or relaunch fails. The private sibling backup survives until success. */
export async function applyReplacement(
  plan: UpdateInstallPlan,
  staged: string,
  launch = launchReplacement,
) {
  await verifyInstaller(plan.source, plan.checksum);
  if (plan.platform === 'darwin') await verifyMacBundle(staged, plan.version, plan.arch);
  else await verifyInstaller(staged, plan.checksum);
  const backup = `${staged}.previous`;
  await rename(plan.target, backup);
  try {
    await rename(staged, plan.target);
    await launch(plan);
  } catch (cause) {
    await rm(plan.target, { recursive: true, force: true });
    await rename(backup, plan.target);
    throw cause;
  }
  await rm(backup, { recursive: true, force: true }).catch(() => {});
}
