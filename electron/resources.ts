import { resolveMediaLayers } from '../src/core/media-layers';
import { app } from 'electron';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  recipeImages,
  resourcePaths,
  recipeFiles,
  type RecipeResources,
} from '../src/core/resources';
import type { EditSettings, MediaAsset } from '../src/core/types';
import { captionItems } from '../src/core/caption-items';
import { systemFontFamily } from '../src/core/caption-style';
import { installedFonts } from './installed-fonts';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';
export async function withResources<T>(
  edits: EditSettings[],
  task: (paths: RecipeResources[], directory: string) => Promise<T>,
  assets?: MediaAsset[],
  sources?: { asset: MediaAsset; path: string }[],
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'frame-resources-'));
  try {
    let fonts = app.isPackaged
      ? join(process.resourcesPath, 'fonts')
      : join(__dirname, '../public/fonts');
    const system = [
      ...new Set(
        edits.flatMap((edit) =>
          captionItems(edit)
            .filter((cue) => cue.mode === 'burn')
            .flatMap((cue) => systemFontFamily(cue.style) ?? []),
        ),
      ),
    ];
    if (system.length) {
      const available = await installedFonts(),
        bundled = fonts;
      fonts = join(directory, 'fonts');
      await cp(bundled, fonts, { recursive: true });
      for (const family of system) {
        const files = available.get(family);
        if (!files?.length)
          throw new Error(
            `The caption font “${family}” is not installed. Choose another font in caption settings.`,
          );
        for (const file of files)
          await cp(
            file,
            join(fonts, createHash('sha256').update(file).digest('hex') + extname(file)),
          );
      }
    }
    const paths = edits.map((edit, i) => ({
      ...resourcePaths(join(directory, `clip${i}`), edit.subtitles.mode),
      fonts,
      media: edits[i].mediaLayers?.length
        ? Object.fromEntries(
            resolveMediaLayers(edits[i], sources ?? []).map((item) => [item.layer.id, item.path]),
          )
        : undefined,
    }));
    for (let i = 0; i < edits.length; i++) {
      for (const file of recipeFiles(edits[i], paths[i], assets?.[i]))
        await writeFile(file.path, file.text);
      for (const image of recipeImages(edits[i], paths[i]))
        await writeFile(image.path, Buffer.from(image.data.split(',')[1], 'base64'));
      if (edits[i].customArtwork)
        await writeFile(
          paths[i].artwork,
          Buffer.from(edits[i].customArtwork!.split(',')[1], 'base64'),
        );
    }
    return await task(paths, directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
