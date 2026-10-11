import { access, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { applyReplacement, launchReplacement, stageReplacement } from './update-replacement';
import type { UpdateInstallPlan } from './update-install-types';

// The detached helper manages whole bundles, including app.asar as a real file.
// Electron's virtual ASAR directories otherwise prevent recursive backup removal.
process.noAsar = true;

async function run() {
  const plan: UpdateInstallPlan = JSON.parse(await readFile(process.argv[2], 'utf8'));
  let staged: string | undefined;
  try {
    staged = await stageReplacement(plan);
    await writeFile(join(plan.directory, 'armed'), '', { mode: 0o600 });
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      if (
        await access(join(plan.directory, 'cancel')).then(
          () => true,
          () => false,
        )
      )
        throw new Error('The update was cancelled before Frame restarted.');
      try {
        process.kill(plan.parent, 0);
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === 'ESRCH') break;
        throw cause;
      }
      await delay(200);
    }
    try {
      process.kill(plan.parent, 0);
      throw new Error('Frame did not close. The update was not installed.');
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ESRCH') throw cause;
    }
    await applyReplacement(plan, staged);
    staged = undefined;
    await writeFile(join(plan.directory, 'complete'), '', { mode: 0o600 });
  } catch (cause) {
    const failure = JSON.stringify({ error: (cause as Error).message });
    await writeFile(join(plan.directory, 'error.json'), failure, { mode: 0o600 });
    await writeFile(join(plan.userData, 'update-install-error.json'), failure, { mode: 0o600 });
    try {
      process.kill(plan.parent, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH')
        await launchReplacement(plan).catch(() => {});
    }
    process.exitCode = 1;
  } finally {
    if (staged) await rm(staged, { recursive: true, force: true }).catch(() => {});
  }
}
void run().catch(() => {
  process.exitCode = 1;
});
