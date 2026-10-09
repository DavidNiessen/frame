import { mkdir, cp, rm, writeFile, chmod } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { shellActions, dolphinActions } from './shell-action-definitions';

export interface ShellActionLocation { platform: NodeJS.Platform; home: string; resources: string; executable: string; dataHome?: string }
export async function installShellActions(location: ShellActionLocation, remove = false): Promise<string> {
  if (location.platform === 'darwin') {
    const services = join(location.home, 'Library', 'Services');
    if (!remove) await mkdir(services, { recursive: true });
    for (const action of shellActions) {
      const name = `${action.label}.workflow`, target = join(services, name);
      if (remove) await rm(target, { recursive: true, force: true });
      else await cp(join(location.resources, 'shell-actions', 'mac', name), target, { recursive: true });
    }
    return remove ? 'Frame’s Finder Quick Actions were removed.' : 'Finder Quick Actions installed. Right-click media files and choose Quick Actions or Services → Edit in Frame / Convert in Frame. If hidden, enable them in System Settings → Keyboard → Keyboard Shortcuts → Services.';
  }
  if (location.platform === 'linux') {
    const data = location.dataHome && isAbsolute(location.dataHome) ? location.dataHome : join(location.home, '.local', 'share');
    for (const folder of ['kio/servicemenus', 'kservices5/ServiceMenus']) {
      const target = join(data, folder, 'frame-media-editor.desktop');
      if (remove) await rm(target, { force: true });
      else { await mkdir(join(data, folder), { recursive: true }); await writeFile(target, dolphinActions(location.executable)); await chmod(target, 0o755); }
    }
    return remove ? 'Frame’s Dolphin actions were removed.' : 'Dolphin actions installed. Restart Dolphin if needed, then right-click supported media files to edit or convert in Frame.';
  }
  throw new Error('On Windows, install Frame using its installer to add the context-menu actions. Uninstalling Frame removes them.');
}
