import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { windowsInstaller } from '../electron/shell-action-definitions';

async function prepare() {
  const root = join(process.cwd(), 'build', 'generated');
  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'windows-context-menu.nsh'), windowsInstaller());
  // Finder workflows are generated at installation with the current executable's path.
  await rm(join(root, 'shell-actions', 'mac'), { recursive: true, force: true });
}
prepare().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
