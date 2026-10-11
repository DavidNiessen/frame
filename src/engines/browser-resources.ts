import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { recipeImages, recipeFiles, resourcePaths } from '../core/resources';
import type { EditSettings, MediaAsset } from '../core/types';
import { captionItems } from '../core/caption-items';
import { captionFontFile, defaultCaptionStyle, systemFontFamily } from '../core/caption-style';
const fonts = new Map<string, Promise<Uint8Array>>();
export async function browserResources(ff: FFmpeg, edits: EditSettings[], assets?: MediaAsset[]) {
  const paths = edits.map((edit, i) => resourcePaths(`clip${i}`, edit.subtitles.mode));
  const names: string[] = [];
  try {
    const captionFonts = edits.flatMap((edit) =>
      captionItems(edit)
        .filter((cue) => cue.mode === 'burn')
        .map((cue) => {
          const style = cue.style ?? defaultCaptionStyle,
            family = systemFontFamily(style);
          if (family)
            throw new Error(
              `The caption font “${family}” is desktop-only. Choose a bundled font to export on the web.`,
            );
          return captionFontFile(style);
        }),
    );
    if (
      edits.some(
        (e) =>
          e.overlays.text ||
          e.effectInstances?.some(
            (instance) => instance.effect === 'watermark' && instance.settings.overlays?.text,
          ),
      )
    )
      captionFonts.push('DejaVuSans.ttf');
    if (captionFonts.length) {
      await ff.createDir('fonts').catch(() => {});
      for (const name of new Set(captionFonts)) {
        if (!fonts.has(name))
          fonts.set(
            name,
            fetch(new URL(`fonts/${name}`, document.baseURI))
              .then(async (response) => {
                if (!response.ok) throw new Error('Could not load the caption font.');
                return new Uint8Array(await response.arrayBuffer());
              })
              .catch((error) => {
                fonts.delete(name);
                throw error;
              }),
          );
        await ff.writeFile(`fonts/${name}`, await fonts.get(name)!);
        names.push(`fonts/${name}`);
      }
    }
    for (let i = 0; i < edits.length; i++)
      for (const file of recipeFiles(edits[i], paths[i], assets?.[i])) {
        await ff.writeFile(file.path, file.text);
        names.push(file.path);
      }
    for (let i = 0; i < edits.length; i++)
      for (const image of recipeImages(edits[i], paths[i])) {
        await ff.writeFile(
          image.path,
          Uint8Array.from(atob(image.data.split(',')[1]), (c) => c.charCodeAt(0)),
        );
        names.push(image.path);
      }
    for (let i = 0; i < edits.length; i++)
      if (edits[i].customArtwork) {
        await ff.writeFile(
          paths[i].artwork,
          Uint8Array.from(atob(edits[i].customArtwork!.split(',')[1]), (c) => c.charCodeAt(0)),
        );
        names.push(paths[i].artwork);
      }
    return {
      paths,
      cleanup: async () => {
        for (const name of names) await ff.deleteFile(name).catch(() => {});
      },
    };
  } catch (error) {
    for (const name of names) await ff.deleteFile(name).catch(() => {});
    throw error;
  }
}
