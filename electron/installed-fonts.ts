import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fontFamilies } from './font-names';

export function fontDirectories(platform = process.platform, user = homedir()): string[] {
  if (platform === 'win32')
    return [
      join(process.env.WINDIR ?? 'C:\\Windows', 'Fonts'),
      join(
        process.env.LOCALAPPDATA ?? join(user, 'AppData', 'Local'),
        'Microsoft',
        'Windows',
        'Fonts',
      ),
    ];
  if (platform === 'darwin')
    return ['/System/Library/Fonts', '/Library/Fonts', join(user, 'Library', 'Fonts')];
  return [
    '/usr/share/fonts',
    '/usr/local/share/fonts',
    join(user, '.local', 'share', 'fonts'),
    join(user, '.fonts'),
  ];
}
let cached: Promise<Map<string, string[]>> | undefined;
export async function installedFonts(): Promise<Map<string, string[]>> {
  return (cached ??= (async () => {
    const paths: string[] = [],
      families = new Map<string, string[]>();
    async function walk(directory: string, depth = 0): Promise<void> {
      if (depth > 8 || paths.length >= 5000) return;
      const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (paths.length >= 5000) break;
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await walk(path, depth + 1);
        else if (entry.isFile() && /\.(ttf|otf|ttc)$/i.test(entry.name)) paths.push(path);
      }
    }
    for (const directory of fontDirectories()) await walk(directory);
    for (let start = 0; start < paths.length; start += 4)
      await Promise.all(
        paths.slice(start, start + 4).map(async (path) => {
          try {
            if ((await stat(path)).size > 64 * 1024 * 1024) return;
            for (const family of fontFamilies(await readFile(path)))
              families.set(family, [...new Set([...(families.get(family) ?? []), path])]);
          } catch {
            /* Unreadable or unsupported fonts do not prevent using the rest. */
          }
        }),
      );
    return families;
  })().catch((error) => {
    cached = undefined;
    throw error;
  }));
}
export function configureInstalledFonts(trusted: (event: IpcMainInvokeEvent) => void) {
  ipcMain.handle('desktop:fonts', async (event) => {
    trusted(event);
    return [...(await installedFonts()).keys()].sort((a, b) => a.localeCompare(b));
  });
}
