import { youtubeVideo } from '../core/youtube';
import { browserAnalysis } from './browser-analysis';
import { serializeSrt } from '../core/subtitles';
import { browserResources } from './browser-resources';
import { buildMergeArgs, compositionAsset, mergedCues } from '../core/composition';
import { editedDuration } from '../core/timeline';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { buildExportArgs, outputName } from '../core/export-plan';
import { getFormat } from '../core/formats';
import { conversionName } from '../core/conversion';
import { browserRelativePath, isMediaFilename, MAX_IMPORT_FILES } from '../core/imports';
import { MAX_WEB_FILE_SIZE, MAX_WEB_LIBRARY_SIZE } from '../core/imports';
import { downloadRemoteMedia } from './remote-download';
import { parseProbe } from '../core/probe';
import type { BatchOptions, ImportReport, MediaEngine } from '../core/types';

export function createBrowserEngine(): MediaEngine {
  let ffmpeg: FFmpeg | null = null;
  let loading: Promise<FFmpeg> | null = null;
  const files = new Map<string, File>();
  let cancelled = false;
  let download: AbortController | null = null;
  let batchOptions: BatchOptions = {};
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
    async importUrl(url, onProgress) {
      if (youtubeVideo(url)) throw new Error('YouTube imports are available in the Frame desktop app. On web, paste a direct audio or video file link.');
      if (files.size >= MAX_IMPORT_FILES) throw new Error('The library is full. Remove some files before importing another URL.');
      const remaining = MAX_WEB_LIBRARY_SIZE - [...files.values()].reduce((size, file) => size + file.size, 0);
      if (remaining <= 0) throw new Error('The browser library is limited to 800 MB. Remove files or use desktop.');
      const controller = new AbortController(); download = controller;
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      try {
        const media = await downloadRemoteMedia(url, { signal: controller.signal, maxBytes: Math.min(MAX_WEB_FILE_SIZE, remaining),
          onChunk: async chunk => { chunks.push(new Uint8Array(chunk)); }, onProgress });
        controller.signal.throwIfAborted();
        const report = await engine.importFiles([new File(chunks, media.name, { type: media.type })], onProgress);
        if (controller.signal.aborted) { for (const asset of report.assets) await engine.release(asset); throw new Error('URL import cancelled.'); }
        return report;
      } catch (error) {
        if (controller.signal.aborted) throw new Error('URL import cancelled.');
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith('Could not download this URL.')) throw new Error(message + ' On web, the host must allow cross-origin access (CORS), and HTTPS pages need HTTPS links. Try desktop if the host blocks browser downloads.');
        throw error;
      } finally { chunks.length = 0; download = null; }
    },
    async importSample() {
      const response = await fetch(new URL('sample.mp4', document.baseURI));
      if (!response.ok) throw new Error('Unable to load the sample.');
      return engine.importFiles([new File([await response.blob()], 'Studio study.mp4', { type: 'video/mp4' })]);
    },
    async importFiles(selected = [], onProgress) {
      const media = selected.filter(file => isMediaFilename(file.name));
      if (media.length + files.size > MAX_IMPORT_FILES) throw new Error(`The library supports up to ${MAX_IMPORT_FILES} media files. Choose a smaller folder.`);
      const report: ImportReport = { assets: [], issues: [], skipped: selected.length - media.length,
        folderName: selected.find(file => file.webkitRelativePath)?.webkitRelativePath.split('/')[0] };
      if (!media.length) return report;
      onProgress?.({ ratio: 0, message: 'Loading the local media engine…' });
      const ff = await ready();
      let retained = [...files.values()].reduce((sum, file) => sum + file.size, 0);
      for (const [index, file] of media.entries()) {
          const id = crypto.randomUUID();
          const input = `input-${id}`; const metadata = `${id}.json`;
          try {
            if (file.size > MAX_WEB_FILE_SIZE) throw new Error('The browser supports files up to 500 MB. Use desktop for larger media.');
            if (retained + file.size > MAX_WEB_LIBRARY_SIZE) throw new Error('The browser library is limited to 800 MB. Remove files or use desktop.');
            await ff.writeFile(input, new Uint8Array(await file.arrayBuffer()));
            const code = await ff.ffprobe(['-v', 'error', '-show_format', '-show_streams', '-show_error', '-of', 'json', '-o', metadata, input]);
            // Core 0.12 returns its unset -1 sentinel when ffprobe returns normally.
            // Accept that sentinel only with fresh, complete, validated probe JSON below.
            if (code !== 0 && code !== -1) throw new Error(`Cannot read “${file.name}”. Try a different media file.`);
            const data = await ff.readFile(metadata, 'utf8');
            const asset = { ...parseProbe(JSON.parse(String(data))), id, name: file.name, size: file.size,
              relativePath: browserRelativePath(file.webkitRelativePath), previewUrl: URL.createObjectURL(file) };
            files.set(id, file); report.assets.push(asset); retained += file.size;
          } catch (error) {
            report.issues.push({ name: browserRelativePath(file.webkitRelativePath) || file.name, message: error instanceof Error ? error.message : 'Unable to read this file.' });
          } finally {
            await ff.deleteFile(input).catch(() => {});
            await ff.deleteFile(metadata).catch(() => {});
          }
          onProgress?.({ ratio: (index + 1) / media.length, message: `Read ${index + 1} of ${media.length} files…` });
        }
      return report;
    },
    async export(asset, settings, onProgress, batchToken) {
      const source = files.get(asset.id);
      if (!source) throw new Error('Import the media file again.');
      cancelled = false;
      onProgress({ ratio: 0, message: 'Preparing the local media engine…' });
      const ff = await ready();
      const input = `source-${asset.id}`;
      const output = `export.${settings.format}`;
      const resources = await browserResources(ff, [settings], [asset]);
      const errors: string[] = [];
      const log = ({ message }: { message: string }) => { errors.push(message); if (errors.length > 15) errors.shift(); };
      const progress = ({ time }: { time: number }) => onProgress({ ratio: Math.min(0.99, Math.max(0, time / 1e6 / editedDuration(settings))), message: 'Encoding your media locally…' });
      ff.on('progress', progress); ff.on('log', log);
      try {
        await ff.writeFile(input, new Uint8Array(await source.arrayBuffer()));
        const code = await ff.exec(buildExportArgs(asset, settings, input, output, resources.paths[0]));
        if (code !== 0) throw new Error(`Export failed. ${errors.slice(-4).join(' ')}`);
        const data = await ff.readFile(output);
        if (typeof data === 'string') throw new Error('Invalid export output.');
        const blob = new Blob([new Uint8Array(data)], { type: getFormat(settings.format).mime });
        onProgress({ ratio: 1, message: 'Your export is ready.' });
        return { name: batchToken && batchOptions.conversion ? conversionName(asset, settings.format) : outputName(asset.name, settings.format),
          relativePath: batchToken && batchOptions.conversion ? conversionName(asset, settings.format, batchOptions.keepFolders) : undefined,
          url: URL.createObjectURL(blob), size: blob.size };
      } catch (error) {
        if (cancelled) throw new Error('Export cancelled.');
        throw error;
      } finally {
        ff.off('progress', progress); ff.off('log', log); await resources.cleanup();
        if (!cancelled) {
          await ff.deleteFile(input).catch(() => {});
          await ff.deleteFile(output).catch(() => {});
        }
      }
    },
    async merge(clips, settings, onProgress, transition) {
      const asset = compositionAsset(clips, transition); const ff = await ready(); const inputs = [...new Set(clips.map(c => c.asset.id))];
      const paths = clips.map(c => `merge-${c.asset.id}`); const output = `merged.${settings.format}`; cancelled = false;
      const progress = ({ time }: { time: number }) => onProgress({ ratio: Math.min(0.99, time / 1e6 / asset.duration), message: 'Merging your clips…' });
      ff.on('progress', progress);
      const resources = await browserResources(ff, clips.map(c => c.edit), clips.map(c => c.asset)); const captions = 'merged-captions.srt';
      try {
        await ff.writeFile(captions, serializeSrt(mergedCues(clips, transition)));
        for (const id of inputs) { const file = files.get(id); if (!file) throw new Error('Import each merge source again.'); await ff.writeFile(`merge-${id}`, new Uint8Array(await file.arrayBuffer())); }
        if (await ff.exec(buildMergeArgs(clips, settings, paths, output, transition, resources.paths, captions)) !== 0) throw new Error('Could not merge these clips. Try a smaller selection or the desktop editor.');
        const data = await ff.readFile(output); if (typeof data === 'string') throw new Error('Invalid merge output.');
        return { name: output, url: URL.createObjectURL(new Blob([new Uint8Array(data)], { type: getFormat(settings.format).mime })), size: data.length };
      } catch (error) { if (cancelled) throw new Error('Merge cancelled.'); throw error; }
      finally { ff.off('progress', progress); await resources.cleanup(); await ff.deleteFile(captions).catch(() => {}); for (const name of [...inputs.map(id => `merge-${id}`), output]) await ff.deleteFile(name).catch(() => {}); }
    },
    ...browserAnalysis(ready, files),
    beginBatch: async options => { batchOptions = options ?? {}; return 'web'; },
    endBatch: async () => { batchOptions = {}; },
    cancel() { download?.abort(); cancelled = true; ffmpeg?.terminate(); ffmpeg = null; loading = null; },
    async release(asset) { files.delete(asset.id); URL.revokeObjectURL(asset.previewUrl); },
  };
  return engine;
}
