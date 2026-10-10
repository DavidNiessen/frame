import { browserRuntime } from './browser-runtime';
import { joinedPreviewArgs } from '../core/joined-preview';
import type { MediaAsset, TimeRange, ExportProgress } from '../core/types';
import type { PreviewProxy } from '../core/hardware';
export function browserJoinedPreview(files: Map<string, File>) {
  const runtime = browserRuntime(), urls = new Map<string, { source: string; url: string }>();
  let active: Promise<PreviewProxy> | null = null, sourceId = '', generation = 0;
  const cancel = () => { generation++; runtime.cancel(); };
  async function generate(asset: MediaAsset, ranges: TimeRange[], progress: (p: ExportProgress) => void) {
    const ticket = ++generation; runtime.cancel(); await active?.catch(() => {});
    if (ticket !== generation) throw new Error('Continuous preview cancelled.');
    const file = files.get(asset.id); if (!file) throw new Error('Import the source again.'); sourceId = asset.id;
    const task = (async () => {
      const ff = await runtime.ready(), input = 'joined-source', output = asset.kind === 'video' ? 'joined.mp4' : 'joined.mp3';
      const duration = ranges.reduce((sum, range) => sum + range.end - range.start, 0);
      const update = ({ time }: { time: number }) => progress({ ratio: Math.min(.99, time / 1e6 / duration), message: 'Preparing continuous preview…' });
      ff.on('progress', update);
      try {
        await ff.writeFile(input, new Uint8Array(await file.arrayBuffer()));
        if (await ff.exec(joinedPreviewArgs(asset, ranges, input, output)) !== 0) throw new Error('Could not prepare continuous preview.');
        const data = await ff.readFile(output); if (typeof data === 'string') throw new Error('Invalid preview output.');
        if (ticket !== generation || !files.has(asset.id)) throw new Error('Continuous preview cancelled.');
        const id = crypto.randomUUID(), url = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: asset.kind === 'video' ? 'video/mp4' : 'audio/mpeg' }));
        urls.set(id, { source: asset.id, url }); return { id, url, size: data.length };
      } finally { ff.off('progress', update); if (ticket === generation) runtime.cancel(); }
    })();
    active = task;
    try { return await task; } finally { if (active === task) { active = null; sourceId = ''; } }
  }
  async function release(id: string) { const entry = urls.get(id); if (entry) URL.revokeObjectURL(entry.url); urls.delete(id); }
  return { generate, cancel, release, async releaseAsset(id: string) { if (sourceId === id) { cancel(); await active?.catch(() => {}); } for (const [token, entry] of urls) if (entry.source === id) await release(token); } };
}
