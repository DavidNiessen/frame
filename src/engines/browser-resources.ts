import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { recipeImages, recipeFiles, resourcePaths } from '../core/resources';
import type { EditSettings, MediaAsset } from '../core/types';
let font: Promise<Uint8Array> | undefined;
export async function browserResources(ff: FFmpeg, edits: EditSettings[], assets?: MediaAsset[]) {
  const paths = edits.map((edit, i) => resourcePaths(`clip${i}`, edit.subtitles.mode)); const names: string[] = [];
  try {
    if (edits.some(e => e.overlays.text || e.subtitles.mode === 'burn' && e.subtitles.cues.length || e.effectInstances?.some(instance => instance.effect === 'watermark' && instance.settings.overlays?.text || instance.effect === 'captions' && instance.settings.subtitles?.mode === 'burn'))) {
      font ??= fetch(new URL('fonts/DejaVuSans.ttf', document.baseURI)).then(async r => { if (!r.ok) throw new Error('Could not load the caption font.'); return new Uint8Array(await r.arrayBuffer()); }).catch(error => { font = undefined; throw error; });
      await ff.createDir('fonts').catch(() => {}); await ff.writeFile('fonts/DejaVuSans.ttf', await font); names.push('fonts/DejaVuSans.ttf');
    }
    for (let i = 0; i < edits.length; i++) for (const file of recipeFiles(edits[i], paths[i], assets?.[i])) { await ff.writeFile(file.path, file.text); names.push(file.path); }
    for (let i = 0; i < edits.length; i++) for (const image of recipeImages(edits[i], paths[i])) { await ff.writeFile(image.path, Uint8Array.from(atob(image.data.split(',')[1]), c => c.charCodeAt(0))); names.push(image.path); }
    for (let i = 0; i < edits.length; i++) if (edits[i].customArtwork) { await ff.writeFile(paths[i].artwork, Uint8Array.from(atob(edits[i].customArtwork!.split(',')[1]), c => c.charCodeAt(0))); names.push(paths[i].artwork); }
    return { paths, cleanup: async () => { for (const name of names) await ff.deleteFile(name).catch(() => {}); } };
  } catch (error) { for (const name of names) await ff.deleteFile(name).catch(() => {}); throw error; }
}
