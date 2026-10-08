import { app } from 'electron';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resourcePaths, recipeFiles, type RecipeResources } from '../src/core/resources';
import type { EditSettings } from '../src/core/types';
export async function withResources<T>(edits: EditSettings[], task: (paths: RecipeResources[], directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'frame-resources-'));
  try {
    const paths = edits.map((edit, i) => ({ ...resourcePaths(join(directory, `clip${i}`)), fonts: app.isPackaged ? join(process.resourcesPath, 'fonts') : join(__dirname, '../public/fonts') }));
    for (let i = 0; i < edits.length; i++) for (const file of recipeFiles(edits[i], paths[i])) await writeFile(file.path, file.text);
    return await task(paths, directory);
  } finally { await rm(directory, { recursive: true, force: true }); }
}
