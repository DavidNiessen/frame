import { browserImageSource } from './browser-image-source';
import { readImageMetadata } from '../core/image-metadata';
import { writeImageMetadata } from '../core/image-metadata-export';
import { browserImageEncoding, renderedImagePath } from './browser-image-encoding';
import { browserWorkspace } from './browser-workspace';
import { browserPreparedMedia } from './browser-prepared-media';
import { resolveAudioLayers } from '../core/audio-layers';
import type { MediaAsset } from '../core/types';
import { taggedNamingAsset } from '../core/media-tags';
import { sourceFingerprint } from '../core/source-fingerprint';
import { mergedChapters, serializeChapters } from '../core/chapters';
import { writeBrowserLayers } from './browser-audio-layers';
import { conversionIndex, validateBatchOptions } from '../core/output-naming';
import { onlineMedia, desktopImportMessage } from '../core/online-media';
import { browserAnalysis } from './browser-analysis';
import { serializeSrt } from '../core/subtitles';
import { browserResources } from './browser-resources';
import { buildMergeArgs, compositionAsset, mergedCues } from '../core/composition';
import { editedDuration } from '../core/timeline';
import { encodeBrowserOutput } from './browser-encoding';
import { browserRuntime } from './browser-runtime';
import { browserJoinedPreview } from './browser-joined-preview';
import { buildExportArgs, outputName } from '../core/export-plan';
import { getFormat } from '../core/formats';
import { conversionName } from '../core/conversion';
import {
  browserRelativePath,
  isMediaFilename,
  orderBrowserFiles,
  MAX_IMPORT_FILES,
} from '../core/imports';
import { MAX_WEB_FILE_SIZE, MAX_WEB_LIBRARY_SIZE } from '../core/imports';
import { downloadRemoteMedia } from './remote-download';
import { parseProbe } from '../core/probe';
import type { BatchOptions, ImportReport, MediaEngine } from '../core/types';

export function createBrowserEngine(): MediaEngine {
  const runtime = browserRuntime(),
    background = browserRuntime();
  const ready = runtime.ready;
  const files = new Map<string, File>(),
    originals = new Map<string, File>(),
    sources = new Map<string, MediaAsset>();
  const joined = browserJoinedPreview(files, sources);
  const prepared = browserPreparedMedia(files, sources);
  let cancelled = false;
  let download: AbortController | null = null;
  let importing: AbortController | null = null;
  const retainedSize = () =>
    [...files.entries()].reduce(
      (sum, [id, file]) =>
        sum +
        file.size +
        (originals.get(id) && originals.get(id) !== file ? originals.get(id)!.size : 0),
      0,
    );
  let batchOptions: BatchOptions = {};
  const engine: MediaEngine = {
    platform: 'web',
    appendVideo: prepared.appendVideo,
    extractAudio: prepared.extractAudio,
    joinedPreview: joined.generate,
    effectPreview: joined.effects,
    cancelJoinedPreview: joined.cancel,
    releaseProxy: joined.release,
    async importUrl(url, onProgress) {
      const source = onlineMedia(url);
      if (source) throw new Error(desktopImportMessage(source));
      if (files.size >= MAX_IMPORT_FILES)
        throw new Error('The library is full. Remove some files before importing another URL.');
      const remaining = MAX_WEB_LIBRARY_SIZE - retainedSize();
      if (remaining <= 0)
        throw new Error('The browser library is limited to 800 MB. Remove files or use desktop.');
      const controller = new AbortController();
      download = controller;
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      try {
        const media = await downloadRemoteMedia(url, {
          signal: controller.signal,
          maxBytes: Math.min(MAX_WEB_FILE_SIZE, remaining),
          onChunk: async (chunk) => {
            chunks.push(new Uint8Array(chunk));
          },
          onProgress,
        });
        controller.signal.throwIfAborted();
        const report = await engine.importFiles(
          [new File(chunks, media.name, { type: media.type })],
          onProgress,
        );
        if (controller.signal.aborted) {
          for (const asset of report.assets) await engine.release(asset);
          throw new Error('URL import cancelled.');
        }
        return report;
      } catch (error) {
        if (controller.signal.aborted) throw new Error('URL import cancelled.', { cause: error });
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith('Could not download this URL.'))
          throw new Error(
            message +
              ' On web, the host must allow cross-origin access (CORS), and HTTPS pages need HTTPS links. Try desktop if the host blocks browser downloads.',
            { cause: error },
          );
        throw error;
      } finally {
        chunks.length = 0;
        download = null;
      }
    },
    async importFiles(selected = [], onProgress) {
      selected = orderBrowserFiles(selected);
      const media = selected.filter((file) => isMediaFilename(file.name));
      if (media.length + files.size > MAX_IMPORT_FILES)
        throw new Error(
          `The library supports up to ${MAX_IMPORT_FILES} media files. Choose a smaller folder.`,
        );
      const report: ImportReport = {
        assets: [],
        issues: [],
        skipped: selected.length - media.length,
        folderName: selected
          .find((file) => file.webkitRelativePath)
          ?.webkitRelativePath.split('/')[0],
      };
      if (!media.length) return report;
      onProgress?.({ ratio: 0, message: 'Loading the local media engine…' });
      const ff = await ready();
      let retained = retainedSize();
      const controller = new AbortController();
      importing = controller;
      for (const [index, file] of media.entries()) {
        const id = crypto.randomUUID();
        const input = `input-${id}`;
        const metadata = `${id}.json`;
        try {
          if (file.size > MAX_WEB_FILE_SIZE)
            throw new Error(
              'The browser supports files up to 500 MB. Use desktop for larger media.',
            );
          if (retained + file.size > MAX_WEB_LIBRARY_SIZE)
            throw new Error(
              'The browser library is limited to 800 MB. Remove files or use desktop.',
            );
          controller.signal.throwIfAborted();
          const working = await browserImageSource(file, controller.signal);
          const addedSize = file.size + (working.file !== file ? working.file.size : 0);
          if (retained + addedSize > MAX_WEB_LIBRARY_SIZE)
            throw new Error(
              'Decoded images exceed the browser library limit. Remove some files or use desktop.',
            );
          await ff.writeFile(input, new Uint8Array(await working.file.arrayBuffer()));
          const code = await ff.ffprobe([
            '-v',
            'error',
            '-show_format',
            '-show_streams',
            '-show_error',
            '-of',
            'json',
            '-o',
            metadata,
            input,
          ]);
          // Core 0.12 returns its unset -1 sentinel when ffprobe returns normally.
          // Accept that sentinel only with fresh, complete, validated probe JSON below.
          if (code !== 0 && code !== -1)
            throw new Error(`Cannot read “${file.name}”. Try a different media file.`);
          const data = await ff.readFile(metadata, 'utf8');
          const asset = {
            ...parseProbe(JSON.parse(String(data)), file.name),
            id,
            name: file.name,
            size: file.size,
            fingerprint: await sourceFingerprint(file),
            relativePath: browserRelativePath(file.webkitRelativePath),
            previewUrl: URL.createObjectURL(working.file),
          };
          if (asset.kind === 'image')
            Object.assign(asset, {
              imageMetadata: { ...working.metadata, ...(await readImageMetadata(file)) },
            });
          files.set(id, working.file);
          originals.set(id, file);
          sources.set(id, asset);
          report.assets.push(asset);
          retained += addedSize;
        } catch (error) {
          report.issues.push({
            name: browserRelativePath(file.webkitRelativePath) || file.name,
            message: error instanceof Error ? error.message : 'Unable to read this file.',
          });
        } finally {
          await ff.deleteFile(input).catch(() => {});
          await ff.deleteFile(metadata).catch(() => {});
        }
        onProgress?.({
          ratio: (index + 1) / media.length,
          message: `Read ${index + 1} of ${media.length} files…`,
        });
      }
      if (importing === controller) importing = null;
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
      const layers = resolveAudioLayers(
        settings,
        [...sources.values()].map((asset) => ({ asset, path: `layer-${asset.id}` })),
      );
      const resources = await browserResources(ff, [settings], [asset], files, sources);
      try {
        await ff.writeFile(input, new Uint8Array(await source.arrayBuffer()));
        await writeBrowserLayers(ff, layers, files, sources);
        const encoding = await browserImageEncoding(
          ff,
          asset,
          settings,
          input,
          resources.paths[0],
          onProgress,
        );
        await encodeBrowserOutput(
          ff,
          settings.format,
          (pass, destination) =>
            buildExportArgs(
              encoding.asset,
              encoding.settings,
              encoding.input,
              destination,
              resources.paths[0],
              layers,
              pass,
            ),
          output,
          editedDuration(settings),
          onProgress,
        );
        const data = await ff.readFile(output);
        if (typeof data === 'string') throw new Error('Invalid export output.');
        const blob = new Blob([new Uint8Array(writeImageMetadata(data, asset, settings))], {
          type: getFormat(settings.format).mime,
        });
        onProgress({ ratio: 1, message: 'Your export is ready.' });
        return {
          name:
            batchToken && batchOptions.conversion
              ? conversionName(
                  taggedNamingAsset(asset, settings.outputTags),
                  settings.format,
                  false,
                  batchOptions.namingTemplate,
                  conversionIndex(batchOptions, asset.id),
                )
              : outputName(asset.name, settings.format),
          relativePath:
            batchToken && batchOptions.conversion
              ? conversionName(
                  taggedNamingAsset(asset, settings.outputTags),
                  settings.format,
                  batchOptions.keepFolders,
                  batchOptions.namingTemplate,
                  conversionIndex(batchOptions, asset.id),
                )
              : undefined,
          url: URL.createObjectURL(blob),
          size: blob.size,
        };
      } catch (error) {
        if (cancelled) throw new Error('Export cancelled.', { cause: error });
        throw error;
      } finally {
        await resources.cleanup();
        for (const layer of layers) await ff.deleteFile(layer.path).catch(() => {});
        if (!cancelled) {
          await ff.deleteFile(input).catch(() => {});
          await ff.deleteFile(output).catch(() => {});
          await ff.deleteFile(renderedImagePath).catch(() => {});
        }
      }
    },
    async merge(clips, settings, onProgress, transition) {
      const asset = compositionAsset(clips, transition);
      const ff = await ready();
      const inputs = [...new Set(clips.map((c) => c.asset.id))];
      const paths = clips.map((c) => `merge-${c.asset.id}`);
      const output = `merged.${settings.format}`;
      cancelled = false;

      const mixes = clips.map((clip) =>
        resolveAudioLayers(
          clip.edit,
          [...sources.values()].map((asset) => ({ asset, path: `layer-${asset.id}` })),
        ),
      );
      const resources = await browserResources(
        ff,
        clips.map((c) => c.edit),
        clips.map((c) => c.asset),
        files,
        sources,
      );
      const captions = 'merged-captions.srt';
      try {
        await ff.writeFile(captions, serializeSrt(mergedCues(clips, transition)));
        await ff.writeFile(
          `${captions}-chapters.ffmetadata`,
          serializeChapters(mergedChapters(clips, transition)),
        );
        for (const id of inputs) {
          const file = files.get(id);
          if (!file) throw new Error('Import each merge source again.');
          await ff.writeFile(`merge-${id}`, new Uint8Array(await file.arrayBuffer()));
        }
        for (const layers of mixes) await writeBrowserLayers(ff, layers, files, sources);
        await encodeBrowserOutput(
          ff,
          settings.format,
          (pass, destination) =>
            buildMergeArgs(
              clips,
              settings,
              paths,
              destination,
              transition,
              resources.paths,
              captions,
              mixes,
              undefined,
              pass,
            ),
          output,
          asset.duration,
          onProgress,
        );
        const data = await ff.readFile(output);
        if (typeof data === 'string') throw new Error('Invalid merge output.');
        return {
          name: output,
          url: URL.createObjectURL(
            new Blob([new Uint8Array(data)], { type: getFormat(settings.format).mime }),
          ),
          size: data.length,
        };
      } catch (error) {
        if (cancelled) throw new Error('Merge cancelled.', { cause: error });
        throw error;
      } finally {
        await resources.cleanup();
        for (const layer of mixes.flat()) await ff.deleteFile(layer.path).catch(() => {});
        await ff.deleteFile(captions).catch(() => {});
        await ff.deleteFile(`${captions}-chapters.ffmetadata`).catch(() => {});
        for (const name of [...inputs.map((id) => `merge-${id}`), output])
          await ff.deleteFile(name).catch(() => {});
      }
    },
    ...browserAnalysis(ready, files, sources),
    async waveform(asset, progress) {
      try {
        return await browserAnalysis(background.ready, files).waveform(asset, progress);
      } finally {
        background.cancel();
      }
    },
    cancelWaveform: background.cancel,
    beginBatch: async (options) => {
      validateBatchOptions(options ?? {});
      batchOptions = options ?? {};
      return 'web';
    },
    endBatch: async () => {
      batchOptions = {};
    },
    cancel() {
      download?.abort();
      importing?.abort();
      cancelled = true;
      runtime.cancel();
      prepared.cancel();
    },
    async release(asset) {
      await joined.releaseAsset(asset.id);
      files.delete(asset.id);
      originals.delete(asset.id);
      sources.delete(asset.id);
      URL.revokeObjectURL(asset.previewUrl);
    },
  };
  return Object.assign(engine, browserWorkspace(engine, files, sources, originals));
}
