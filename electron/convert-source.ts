import type { Stats } from 'node:fs';
import { lstat, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { prepareImageSource } from './image-source';
import { nativeSourceFingerprint } from './source-fingerprint';
import { readImageMetadata } from '../src/core/image-metadata';
import { writeImageMetadata } from '../src/core/image-metadata-export';
import { recordExport } from './export-history';
import { taggedNamingAsset } from '../src/core/media-tags';
import { conversionName, conversionSettings, canConvert } from '../src/core/conversion';
import { buildExportArgs } from '../src/core/export-plan';
import { editedDuration } from '../src/core/timeline';
import type { ExportHistoryKind } from '../src/core/export-history';
import type { OutputSettings } from '../src/core/presets';
import type { MediaJobs } from './jobs';
import { probeFile, runFfmpeg } from './native';
import { withResources } from './resources';
import { safeOutputPath, publishOutput } from './output-files';

export interface SourceConversion {
  /** Resolved source path. */
  source: string;
  /** The source's lstat before converting; the output is discarded if the source changes. */
  original: Stats;
  settings: OutputSettings;
  output: string;
  relativePath?: string;
  keepFolders: boolean;
  namingTemplate: string;
  history: ExportHistoryKind;
  signal: AbortSignal;
  progress: (ratio: number) => void;
  /** Error shown when the source changes during conversion. */
  changed: string;
}

/** Converts one complete source file with an output preset, as watch folders do. */
export function convertSource(jobs: MediaJobs, work: SourceConversion) {
  return jobs.run(async (execute) => {
    const cancel = () => jobs.cancel();
    work.signal.addEventListener('abort', cancel, { once: true });
    if (work.signal.aborted) cancel();
    let temporary: string | undefined;
    let decodedDirectory: string | undefined;
    try {
      const prepared = await prepareImageSource(work.source, jobs.signal);
      decodedDirectory = prepared.directory;
      const asset = {
        ...(await probeFile(prepared.path, { rawOnly: true, signal: jobs.signal })),
        id: randomUUID(),
        name: basename(work.source),
        relativePath: work.relativePath,
        previewUrl: '',
      };
      if (prepared.directory) {
        asset.size = work.original.size;
        asset.fingerprint = await nativeSourceFingerprint(work.source, work.original.size);
        asset.imageMetadata = {
          ...prepared.metadata,
          ...(await readImageMetadata(await readFile(work.source))),
        };
      }
      if (!canConvert(asset, work.settings))
        throw new Error(
          `This source cannot be converted to ${work.settings.format.toUpperCase()}.`,
        );
      const edit = conversionSettings(asset, { ...work.settings, acceleration: 'software' });
      const name = conversionName(
        taggedNamingAsset(asset, edit.outputTags),
        edit.format,
        work.keepFolders,
        work.namingTemplate,
      );
      const destination = await safeOutputPath(work.output, name);
      temporary = join(dirname(destination), `.frame-watch-${randomUUID()}.${edit.format}`);
      await withResources(
        [edit],
        async (paths) =>
          execute(
            runFfmpeg(
              buildExportArgs(asset, edit, prepared.path, temporary!, paths[0]),
              editedDuration(edit),
              work.progress,
            ),
          ),
        [asset],
      );
      if (asset.kind === 'image')
        await writeFile(temporary, writeImageMetadata(await readFile(temporary), asset, edit));
      if (jobs.cancelled) throw new Error('Conversion cancelled.');
      const current = await lstat(work.source);
      if (current.size !== work.original.size || current.mtimeMs !== work.original.mtimeMs)
        throw new Error(work.changed);
      const path = await publishOutput(temporary, work.output, name),
        { size } = await stat(path);
      await recordExport(
        { name: basename(path), path, size },
        work.history,
        asset.name,
        edit.format,
      );
      return { path, size, format: edit.format };
    } finally {
      work.signal.removeEventListener('abort', cancel);
      if (temporary) await rm(temporary, { force: true });
      if (decodedDirectory) await rm(decodedDirectory, { recursive: true, force: true });
    }
  });
}
