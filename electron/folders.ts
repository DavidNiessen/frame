import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { isMediaFilename, MAX_IMPORT_FILES } from '../src/core/imports';

export async function collectFolderMedia(root: string, recursive = true) {
  const files: { path: string; relativePath: string }[] = [];
  const directories = [root];
  let skipped = 0, scanned = 0;
  while (directories.length) {
    const directory = directories.shift()!;
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const entry of entries) {
      if (++scanned > 50000) throw new Error('This folder contains too many entries. Choose a smaller folder.');
      // Never traverse links outside the selected directory or enter link cycles.
      if (entry.isSymbolicLink()) { skipped++; continue; }
      const path = join(directory, entry.name);
      if (entry.isDirectory()) { if (recursive) directories.push(path); else skipped++; }
      else if (entry.isFile() && isMediaFilename(entry.name)) {
        files.push({ path, relativePath: relative(root, path).split('\\').join('/') });
        if (files.length > MAX_IMPORT_FILES) throw new Error(`Choose a folder with up to ${MAX_IMPORT_FILES} media files.`);
      } else skipped++;
    }
  }
  return { files, skipped };
}
