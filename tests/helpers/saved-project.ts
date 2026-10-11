import { readFile } from 'node:fs/promises';

/** An async project save may not have renamed its destination yet; other errors are real failures. */
export async function readSavedProject(path: string) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw cause;
  }
}
