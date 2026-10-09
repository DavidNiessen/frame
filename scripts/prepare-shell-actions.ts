import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { finderAction, shellActions, windowsInstaller } from '../electron/shell-action-definitions';

async function prepare() {
  const root = join(process.cwd(), 'build', 'generated');
  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'windows-context-menu.nsh'), windowsInstaller());
  for (const action of shellActions) {
    const directory = join(root, 'shell-actions', 'mac', `${action.label}.workflow`, 'Contents');
    await mkdir(directory, { recursive: true });
    const { info, document } = finderAction(action);
    await writeFile(join(directory, 'Info.plist'), info);
    await writeFile(join(directory, 'document.wflow'), document);
  }
}
prepare().catch(error => { console.error(error); process.exitCode = 1; });
