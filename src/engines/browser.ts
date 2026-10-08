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
    beginBatch: async () => 'web',
    endBatch: async () => {},
    cancel() { cancelled = true; ffmpeg?.terminate(); ffmpeg = null; loading = null; },
    async release(asset) { files.delete(asset.id); URL.revokeObjectURL(asset.previewUrl); },
  };
  return engine;
}
