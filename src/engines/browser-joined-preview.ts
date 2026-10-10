import { browserRuntime } from './browser-runtime';
import { joinedPreviewArgs } from '../core/joined-preview';
import { effectPreviewArgs, effectPreviewRecipe } from '../core/effect-preview';
import { resolveAudioLayers } from '../core/audio-layers';
import { editedDuration } from '../core/timeline';
import { browserResources } from './browser-resources';
import { MAX_WEB_FILE_SIZE } from '../core/imports';
import { writeBrowserLayers } from './browser-audio-layers';
import type { EditSettings, MediaAsset, TimeRange, ExportProgress } from '../core/types';
import type { PreviewProxy } from '../core/hardware';
export function browserJoinedPreview(files: Map<string, File>, sources: Map<string, MediaAsset>) {
  const runtime = browserRuntime(), urls = new Map<string, { source: string; url: string }>();
  let active: Promise<PreviewProxy> | null = null, sourceId = '', generation = 0;
  const cancel = () => { generation++; runtime.cancel(); };
  async function generate(asset: MediaAsset, ranges: TimeRange[], progress: (p: ExportProgress) => void, settings?: EditSettings) {
    const ticket = ++generation; runtime.cancel(); await active?.catch(() => {});
    if (ticket !== generation) throw new Error('Continuous preview cancelled.');
    const file = files.get(asset.id); if (!file) throw new Error('Import the source again.'); sourceId = asset.id;
    const task = (async () => {
      const ff = await runtime.ready(), input = 'joined-source', output = asset.kind === 'video' ? 'joined.mp4' : 'joined.mp3';
      const edit = settings ? effectPreviewRecipe(asset, settings) : undefined;
      const layers = edit ? resolveAudioLayers(edit, [...sources.values()].map(asset => ({ asset, path: `layer-${asset.id}` }))) : [];
      const resources = edit ? await browserResources(ff, [edit], [asset]) : undefined;
      const duration = edit ? editedDuration(edit) : ranges.reduce((sum, range) => sum + range.end - range.start, 0);
      const errors: string[] = [], log = ({ message }: { message: string }) => { errors.push(message); if (errors.length > 8) errors.shift(); };
      const update = ({ time }: { time: number }) => progress({ ratio: Math.min(.99, time / 1e6 / duration), message: edit ? 'Preparing effects preview…' : 'Preparing continuous preview…' });
      ff.on('progress', update); ff.on('log', log);
      try {
        await ff.writeFile(input, new Uint8Array(await file.arrayBuffer()));
        if (edit) await writeBrowserLayers(ff, layers, files, sources);
        const plan = edit ? effectPreviewArgs(asset, edit, input, output, resources!.paths[0], layers) : joinedPreviewArgs(asset, ranges, input, output);
        if (await ff.exec(plan) !== 0) throw new Error(`Could not prepare ${edit ? 'effects' : 'continuous'} preview. ${errors.slice(-4).join(' ')}`);
        const data = await ff.readFile(output); if (typeof data === 'string') throw new Error('Invalid preview output.');
        if (data.length > MAX_WEB_FILE_SIZE) throw new Error('The playback preview exceeds the browser memory limit. Use desktop for this media.');
        if (ticket !== generation || !files.has(asset.id)) throw new Error('Continuous preview cancelled.');
        const id = crypto.randomUUID(), url = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: asset.kind === 'video' ? 'video/mp4' : 'audio/mpeg' }));
        urls.set(id, { source: asset.id, url }); return { id, url, size: data.length };
      } finally { ff.off('progress', update); ff.off('log', log); await resources?.cleanup(); }
    })();
    active = task;
    try { return await task; } finally { if (ticket === generation) runtime.cancel(); if (active === task) { active = null; sourceId = ''; } }
  }
  async function release(id: string) { const entry = urls.get(id); if (entry) URL.revokeObjectURL(entry.url); urls.delete(id); }
  return { generate, effects: (asset: MediaAsset, edit: EditSettings, progress: (p: ExportProgress) => void) => generate(asset, [], progress, edit), cancel, release, async releaseAsset(id: string) { if (sourceId === id) { cancel(); await active?.catch(() => {}); } for (const [token, entry] of urls) if (entry.source === id) await release(token); } };
}
