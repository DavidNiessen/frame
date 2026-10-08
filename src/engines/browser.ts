import { buildMergeArgs, compositionAsset } from '../core/composition';
import { thumbnailArgs } from '../core/thumbnails';
import { waveformArgs, WaveformCollector } from '../core/waveform';
import { editedDuration } from '../core/timeline';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { buildExportArgs, outputName } from '../core/export-plan';
import { getFormat } from '../core/formats';
import { parseProbe } from '../core/probe';
import type { MediaAsset, MediaEngine } from '../core/types';

const MAX_FILE_SIZE = 500 * 1024 * 1024;
const MAX_TOTAL_SIZE = 800 * 1024 * 1024;
export function createBrowserEngine(): MediaEngine {
  let ffmpeg: FFmpeg | null = null;
  let loading: Promise<FFmpeg> | null = null;
  const files = new Map<string, File>();
  let cancelled = false;
  async function ready(): Promise<FFmpeg> {
    if (loading) return loading;
    if (!window.isSecureContext || !crossOriginIsolated) throw new Error('Browser processing needs a secure page with cross-origin isolation. Check the hosting instructions, or use the desktop app.');
    ffmpeg = new FFmpeg();
    const instance = ffmpeg;
    loading = instance.load({ coreURL: new URL('ffmpeg/ffmpeg-core.js', document.baseURI).href, wasmURL: new URL('ffmpeg/ffmpeg-core.wasm', document.baseURI).href }).then(() => instance).catch(error => {
      loading = null; ffmpeg = null; throw error;
    });
    return loading;
  }
  const engine: MediaEngine = {
    platform: 'web',
    async importSample() {
      const response = await fetch(new URL('sample.mp4', document.baseURI));
      if (!response.ok) throw new Error('Unable to load the sample.');
      return engine.importFiles([new File([await response.blob()], 'Studio study.mp4', { type: 'video/mp4' })]);
    },
    async importFiles(selected = []) {
      if (selected.some(file => file.size > MAX_FILE_SIZE)) throw new Error('The browser supports files up to 500 MB. Use desktop for larger media.');
      if ([...files.values(), ...selected].reduce((sum, f) => sum + f.size, 0) > MAX_TOTAL_SIZE) throw new Error('The browser library is limited to 800 MB. Remove files or use desktop.');
      const ff = await ready();
      const imported: MediaAsset[] = [];
      try {
        for (const file of selected) {
          const id = crypto.randomUUID();
          const input = `input-${id}`; const metadata = `${id}.json`;
          try {
            await ff.writeFile(input, new Uint8Array(await file.arrayBuffer()));
            const code = await ff.ffprobe(['-v', 'error', '-show_format', '-show_streams', '-show_error', '-of', 'json', '-o', metadata, input]);
            // Core 0.12 returns its unset -1 sentinel when ffprobe returns normally.
            // Accept that sentinel only with fresh, complete, validated probe JSON below.
            if (code !== 0 && code !== -1) throw new Error(`Cannot read “${file.name}”. Try a different media file.`);
            const data = await ff.readFile(metadata, 'utf8');
            const asset = { ...parseProbe(JSON.parse(String(data))), id, name: file.name, size: file.size, previewUrl: URL.createObjectURL(file) };
            files.set(id, file); imported.push(asset);
          } finally {
            await ff.deleteFile(input).catch(() => {});
            await ff.deleteFile(metadata).catch(() => {});
          }
        }
        return imported;
      } catch (error) {
        for (const asset of imported) { files.delete(asset.id); URL.revokeObjectURL(asset.previewUrl); }
        throw error;
      }
    },
    async export(asset, settings, onProgress) {
      const source = files.get(asset.id);
      if (!source) throw new Error('Import the media file again.');
      cancelled = false;
      onProgress({ ratio: 0, message: 'Preparing the local media engine…' });
      const ff = await ready();
      const input = `source-${asset.id}`;
      const output = `export.${settings.format}`;
      const errors: string[] = [];
      const log = ({ message }: { message: string }) => { errors.push(message); if (errors.length > 15) errors.shift(); };
      const progress = ({ time }: { time: number }) => onProgress({ ratio: Math.min(0.99, Math.max(0, time / 1e6 / editedDuration(settings))), message: 'Encoding your media locally…' });
      ff.on('progress', progress); ff.on('log', log);
      try {
        await ff.writeFile(input, new Uint8Array(await source.arrayBuffer()));
        const code = await ff.exec(buildExportArgs(asset, settings, input, output));
        if (code !== 0) throw new Error(`Export failed. ${errors.slice(-4).join(' ')}`);
        const data = await ff.readFile(output);
        if (typeof data === 'string') throw new Error('Invalid export output.');
        const blob = new Blob([new Uint8Array(data)], { type: getFormat(settings.format).mime });
        onProgress({ ratio: 1, message: 'Your export is ready.' });
        return { name: outputName(asset.name, settings.format), url: URL.createObjectURL(blob), size: blob.size };
      } catch (error) {
        if (cancelled) throw new Error('Export cancelled.');
        throw error;
      } finally {
        ff.off('progress', progress); ff.off('log', log);
        if (!cancelled) {
          await ff.deleteFile(input).catch(() => {});
          await ff.deleteFile(output).catch(() => {});
        }
      }
    },
    async merge(clips, settings, onProgress) {
      const asset = compositionAsset(clips); const ff = await ready(); const inputs = [...new Set(clips.map(c => c.asset.id))];
      const paths = clips.map(c => `merge-${c.asset.id}`); const output = `merged.${settings.format}`; cancelled = false;
      const progress = ({ time }: { time: number }) => onProgress({ ratio: Math.min(0.99, time / 1e6 / asset.duration), message: 'Merging your clips…' });
      ff.on('progress', progress);
      try {
        for (const id of inputs) { const file = files.get(id); if (!file) throw new Error('Import each merge source again.'); await ff.writeFile(`merge-${id}`, new Uint8Array(await file.arrayBuffer())); }
        if (await ff.exec(buildMergeArgs(clips, settings, paths, output)) !== 0) throw new Error('Could not merge these clips. Try a smaller selection or the desktop editor.');
        const data = await ff.readFile(output); if (typeof data === 'string') throw new Error('Invalid merge output.');
        return { name: output, url: URL.createObjectURL(new Blob([new Uint8Array(data)], { type: getFormat(settings.format).mime })), size: data.length };
      } catch (error) { if (cancelled) throw new Error('Merge cancelled.'); throw error; }
      finally { ff.off('progress', progress); for (const name of [...inputs.map(id => `merge-${id}`), output]) await ff.deleteFile(name).catch(() => {}); }
    },
    async thumbnails(asset, onProgress) {
      const source = files.get(asset.id); if (!source) throw new Error('Import the source file again.');
      const ff = await ready(); const input = `thumb-source-${asset.id}`; const output = `thumb-${asset.id}.png`;
      const progress = ({ time }: { time: number }) => onProgress({ ratio: Math.min(1, time / 1e6 / asset.duration), message: 'Reading video frames…' });
      ff.on('progress', progress);
      try {
        await ff.writeFile(input, new Uint8Array(await source.arrayBuffer()));
        if (await ff.exec(thumbnailArgs(asset, input, output)) !== 0) throw new Error('Could not generate video thumbnails.');
        const data = await ff.readFile(output); if (typeof data === 'string') throw new Error('Invalid thumbnail output.');
        return URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'image/png' }));
      } finally { ff.off('progress', progress); await ff.deleteFile(input).catch(() => {}); await ff.deleteFile(output).catch(() => {}); }
    },
    async waveform(asset, onProgress) {
      const source = files.get(asset.id); if (!source) throw new Error('Import the source file again.');
      const ff = await ready(); const input = `analysis-${asset.id}`; const collector = new WaveformCollector(); const messages: string[] = [];
      const log = ({ message }: { message: string }) => { collector.push(message); messages.push(message); if (messages.length > 15) messages.shift(); };
      const progress = ({ time }: { time: number }) => onProgress({ ratio: Math.min(1, time / 1e6 / asset.duration), message: 'Reading audio peaks…' });
      ff.on('log', log); ff.on('progress', progress);
      try {
        await ff.writeFile(input, new Uint8Array(await source.arrayBuffer()));
        if (await ff.exec(waveformArgs(asset, input)) !== 0 || !collector.points.length) throw new Error(`Could not read this file’s audio waveform. ${messages.slice(-5).join(' ')}`);
        return collector.points;
      } finally { ff.off('log', log); ff.off('progress', progress); await ff.deleteFile(input).catch(() => {}); }
    },
    beginBatch: async () => 'web',
    endBatch: async () => {},
    cancel() { cancelled = true; ffmpeg?.terminate(); ffmpeg = null; loading = null; },
    async release(asset) { files.delete(asset.id); URL.revokeObjectURL(asset.previewUrl); },
  };
  return engine;
}
