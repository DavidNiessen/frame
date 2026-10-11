import { mkdir, cp, rm, writeFile, chmod, readFile } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { shellActions, dolphinActions, finderAction } from './shell-action-definitions';
import { windowsShellStatus } from './windows-shell-integration';
import type { ShellIntegrationStatus } from '../src/core/system-integration';

export interface ShellActionLocation {
  platform: NodeJS.Platform;
  home: string;
  resources: string;
  executable: string;
  args?: string[];
  dataHome?: string;
}
function linuxData(location: ShellActionLocation) {
  return location.dataHome && isAbsolute(location.dataHome)
    ? location.dataHome
    : join(location.home, '.local', 'share');
}
export async function shellActionState(
  location: ShellActionLocation,
): Promise<ShellIntegrationStatus['state']> {
  if (location.platform === 'win32') return (await windowsShellStatus(location)).state;
  const checks: { path: string; content: string }[] =
    location.platform === 'darwin'
      ? shellActions.flatMap((action) => {
          const files = finderAction(action, location.args?.length ? location : undefined),
            root = join(
              location.home,
              'Library',
              'Services',
              `${action.label}.workflow`,
              'Contents',
            );
          return [
            { path: join(root, 'Info.plist'), content: files.info },
            { path: join(root, 'document.wflow'), content: files.document },
          ];
        })
      : ['kio/servicemenus', 'kservices5/ServiceMenus'].map((folder) => ({
          path: join(linuxData(location), folder, 'frame-media-editor.desktop'),
          content: dolphinActions(location.executable, location.args),
        }));
  const results = await Promise.all(
    checks.map(async (check) => {
      try {
        return (await readFile(check.path, 'utf8')) === check.content ? 'match' : 'partial';
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
        throw error;
      }
    }),
  );
  return results.every((result) => result === 'match')
    ? 'installed'
    : results.every((result) => result === 'missing')
      ? 'not-installed'
      : 'partial';
}
export async function installShellActions(
  location: ShellActionLocation,
  remove = false,
): Promise<string> {
  if (location.platform === 'win32') {
    const result = await windowsShellStatus(location, remove ? 'remove' : 'install');
    return remove && result.state === 'not-installed'
      ? 'Frame’s File Explorer actions were removed from both menus.'
      : result.detail;
  }
  if (location.platform === 'darwin') {
    const services = join(location.home, 'Library', 'Services');
    if (!remove) await mkdir(services, { recursive: true });
    for (const action of shellActions) {
      const name = `${action.label}.workflow`,
        target = join(services, name);
      if (remove) await rm(target, { recursive: true, force: true });
      else if (location.args?.length) {
        const contents = join(target, 'Contents'),
          files = finderAction(action, location);
        await mkdir(contents, { recursive: true });
        await writeFile(join(contents, 'Info.plist'), files.info);
        await writeFile(join(contents, 'document.wflow'), files.document);
      } else
        await cp(join(location.resources, 'shell-actions', 'mac', name), target, {
          recursive: true,
        });
    }
    return remove
      ? 'Frame’s Finder Quick Actions were removed.'
      : 'Finder Quick Actions installed. Right-click media files and choose Quick Actions or Services → Edit in Frame / Convert in Frame. If hidden, enable them in System Settings → Keyboard → Keyboard Shortcuts → Services.';
  }
  if (location.platform === 'linux') {
    const data = linuxData(location);
    for (const folder of ['kio/servicemenus', 'kservices5/ServiceMenus']) {
      const target = join(data, folder, 'frame-media-editor.desktop');
      if (remove) await rm(target, { force: true });
      else {
        await mkdir(join(data, folder), { recursive: true });
        await writeFile(target, dolphinActions(location.executable, location.args));
        await chmod(target, 0o755);
      }
    }
    return remove
      ? 'Frame’s Dolphin actions were removed.'
      : 'Dolphin actions installed. Restart Dolphin if needed, then right-click supported media files to edit or convert in Frame.';
  }
  throw new Error('File-manager actions are not available on this operating system.');
}
