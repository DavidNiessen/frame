import { copyFile, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Run outside the installation, with a name NSIS will not match or replace. */
export async function prepareWindowsUpdateRuntime(executable: string, directory: string) {
  const runtime = join(directory, 'runtime');
  await mkdir(runtime, { mode: 0o700 });
  try {
    const host = join(runtime, 'FrameUpdateHost.exe');
    await copyFile(executable, host);
    for (const entry of await readdir(dirname(executable), { withFileTypes: true })) {
      if (entry.isFile() && /\.(dll|bin|dat|pak)$/i.test(entry.name))
        await copyFile(join(dirname(executable), entry.name), join(runtime, entry.name));
    }
    return host;
  } catch (cause) {
    await rm(runtime, { recursive: true, force: true }).catch(() => {});
    throw cause;
  }
}

/** Delete only finished, inactive updater runtimes owned by this profile. */
export async function cleanupWindowsUpdateRuntimes(userData: string) {
  const root = join(userData, 'updates');
  for (const version of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (!version.isDirectory() || !/^v\d+\.\d+\.\d+(?:-build\.\d+)?$/.test(version.name)) continue;
    const release = join(root, version.name);
    for (const entry of await readdir(release, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^apply-[a-f\d-]+$/.test(entry.name)) continue;
      const directory = join(release, entry.name);
      try {
        const files = await readdir(directory);
        if (!files.includes('complete') && !files.includes('error.json')) continue;
        const pid = Number(await readFile(join(directory, 'runtime.pid'), 'utf8'));
        if (!Number.isSafeInteger(pid) || pid <= 0) continue;
        try {
          process.kill(pid, 0);
          continue;
        } catch (cause) {
          if ((cause as NodeJS.ErrnoException).code !== 'ESRCH') continue;
        }
        await rm(join(directory, 'runtime'), {
          recursive: true,
          force: true,
          maxRetries: 5,
          retryDelay: 100,
        });
      } catch {
        // Another startup can retry cleanup; retain installation diagnostics.
      }
    }
  }
}
