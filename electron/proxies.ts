import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { mkdtemp, stat, rm } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { encodeNative } from './acceleration';
import type { MediaAsset } from '../src/core/types';
import type { PreviewProxy } from '../src/core/hardware';
import type { MediaJobs } from './jobs';
export function createProxies(assets: Map<string, { path: string; asset: MediaAsset }>, jobs: MediaJobs, trusted: (event: IpcMainInvokeEvent) => void) {
  const entries = new Map<string, { source: string; path: string; directory: string; proxy: PreviewProxy }>();
  ipcMain.handle('media:proxy', (event, id: string) => {
    trusted(event); const source = assets.get(id); if (!source) throw new Error('Import the source again.');
    const existing = [...entries.values()].find(e => e.source === id); if (existing) return existing.proxy;
    return jobs.run(async execute => {
      const directory = await mkdtemp(join(tmpdir(), 'frame-proxy-')); const video = source.asset.kind === 'video'; const path = join(directory, video ? 'preview.mp4' : 'preview.mp3');
      try {
        const args = ['-y', '-i', source.path, '-t', String(source.asset.duration)];
        if (video) args.push('-map', '0:V:0', '-map', '0:a:0?', '-vf', "scale=w='min(720,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2", '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '28', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart');
        else args.push('-map', '0:a:0', '-vn', '-c:a', 'libmp3lame');
        args.push('-b:a', '128k', '-ar', '48000', '-threads', '2', path);
        await encodeNative(args, source.asset.duration, 'auto', 2000, execute, jobs, (ratio, message) => { if (!event.sender.isDestroyed()) event.sender.send('media:progress', { ratio, message: `Preparing preview: ${message}` }); });
        const token = randomUUID(); const proxy: PreviewProxy = { id: token, url: `media://proxy/${token}`, size: (await stat(path)).size };
        entries.set(token, { source: id, path, directory, proxy }); return proxy;
      } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
    });
  });
  const release = async (id: string) => { const entry = entries.get(id); if (!entry) return; await rm(entry.directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); entries.delete(id); };
  ipcMain.handle('media:release-proxy', (event, id: string) => { trusted(event); return release(id); });
  return { path: (id: string) => entries.get(id)?.path, releaseAsset: async (source: string) => { for (const [id, entry] of entries) if (entry.source === source) await release(id).catch(() => {}); }, clear: () => { for (const entry of entries.values()) { try { rmSync(entry.directory, { recursive: true, force: true, maxRetries: 3 }); } catch { /* OS may still hold a closing preview stream. */ } } entries.clear(); } };
}
