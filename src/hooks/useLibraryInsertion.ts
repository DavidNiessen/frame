import { useRef, useState } from 'react';
import { editClips } from '../core/clips';
import { insertedAudioLayer, insertedVideoEdit } from '../core/media-insertion';
import type { ExportProgress, MediaAsset } from '../core/types';
import type { Editor } from './useEditor';

export function useLibraryInsertion(editor: Editor, current: number) {
  const [progress, setProgress] = useState<ExportProgress | null>(null), active = useRef(false);
  async function prepare(work: (update: (p: ExportProgress) => void) => Promise<MediaAsset>, adopt: (asset: MediaAsset) => void) {
    if (editor.busy || active.current) return;
    active.current = true; setProgress({ ratio: 0, message: 'Preparing media…' });
    let result: MediaAsset | undefined;
    try { result = await work(setProgress); adopt(result); }
    catch (error) {
      if (result) await (await editor.backgroundEngine()).release(result).catch(() => {});
      editor.setNotice(error instanceof Error ? error.message : String(error));
    } finally { active.current = false; setProgress(null); }
  }
  async function insert(id: string) {
    const source = editor.assets.find(asset => asset.id === id), base = editor.asset, edit = editor.edit;
    if (!source || !base || !edit || editor.busy || active.current) return;
    if (source.kind === 'audio') {
      try {
        const layer = insertedAudioLayer(edit, source, current);
        editor.update({ clips: editClips(edit), audioLayers: [...(edit.audioLayers ?? []), layer] });
        editor.setNotice(`Added ${source.name} as an audio layer. Drag its bar to move or trim it.`);
        return { layerId: layer.id };
      } catch (error) { editor.setNotice((error as Error).message); return; }
    }
    if (base.kind !== 'video') { editor.setNotice('Select a video sequence before inserting another video.'); return; }
    await prepare(update => editor.runExclusive('analysis', engine => engine.appendVideo(base, source, update)), prepared => {
      const insertion = insertedVideoEdit(base, source, prepared, edit);
      editor.adoptPrepared(prepared, insertion.after, { before: insertion.before });
      editor.setNotice(`Inserted ${source.name} at the end of the sequence. Your original files are unchanged.`);
    });
  }
  async function extractAudio() {
    const asset = editor.asset; if (!asset || asset.kind !== 'video' || !asset.hasAudio) return;
    await prepare(update => editor.runExclusive('analysis', engine => engine.extractAudio(asset, update)), audio => {
      editor.adoptPrepared(audio, undefined, { select: false });
      editor.setNotice(`Extracted ${audio.name} into the media library.`);
    });
  }
  return { insert, extractAudio, progress, cancel: editor.cancel };
}
