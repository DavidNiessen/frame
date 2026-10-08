import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { recipeFiles, resourcePaths } from '../core/resources';
import type { EditSettings } from '../core/types';
let font: Promise<Uint8Array> | undefined;
export async function browserResources(ff: FFmpeg, edits: EditSettings[]) {
  const paths = edits.map((_, i) => resourcePaths(`clip${i}`)); const names: string[] = [];
  try {
    if (edits.some(e => e.subtitles.mode === 'burn' && e.subtitles.cues.length)) {
      font ??= fetch(new URL('fonts/DejaVuSans.ttf', document.baseURI)).then(async r => { if (!r.ok) throw new Error('Could not load the caption font.'); return new Uint8Array(await r.arrayBuffer()); }).catch(error => { font = undefined; throw error; });
      await ff.createDir('fonts').catch(() => {}); await ff.writeFile('fonts/DejaVuSans.ttf', await font); names.push('fonts/DejaVuSans.ttf');
    }
    for (let i = 0; i < edits.length; i++) for (const file of recipeFiles(edits[i], paths[i])) { await ff.writeFile(file.path, file.text); names.push(file.path); }
    return { paths, cleanup: async () => { for (const name of names) await ff.deleteFile(name).catch(() => {}); } };
  } catch (error) { for (const name of names) await ff.deleteFile(name).catch(() => {}); throw error; }
}
