import { app } from 'electron';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resourcePaths, recipeFiles, type RecipeResources } from '../src/core/resources';
import type { EditSettings, MediaAsset } from '../src/core/types';
export async function withResources<T>(edits: EditSettings[], task: (paths: RecipeResources[], directory: string) => Promise<T>, assets?: MediaAsset[]): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'frame-resources-'));
  try {
    const paths = edits.map((edit, i) => ({ ...resourcePaths(join(directory, `clip${i}`), edit.subtitles.mode), fonts: app.isPackaged ? join(process.resourcesPath, 'fonts') : join(__dirname, '../public/fonts') }));
    for (let i = 0; i < edits.length; i++) { for (const file of recipeFiles(edits[i], paths[i], assets?.[i])) await writeFile(file.path, file.text); if (edits[i].overlays.image) await writeFile(paths[i].image, Buffer.from(edits[i].overlays.image!.split(',')[1], 'base64')); if (edits[i].customArtwork) await writeFile(paths[i].artwork, Buffer.from(edits[i].customArtwork!.split(',')[1], 'base64')); }
    return await task(paths, directory);
  } finally { await rm(directory, { recursive: true, force: true }); }
}
