import { withResources } from './resources';
import { framePreviewArgs } from '../src/core/frame-preview';
import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { MediaAsset } from '../src/core/types';
import { parseEdit } from '../src/core/project';
import { previewAudioArgs } from '../src/core/audio-preview';
import { waveformArgs, WaveformCollector } from '../src/core/waveform';
import { thumbnailArgs } from '../src/core/thumbnails';
import { runFfmpeg } from './native';
import type { MediaJobs } from './jobs';
export function registerAnalysis(assets: Map<string, { path: string; asset: MediaAsset }>, jobs: MediaJobs, trusted: (event: IpcMainInvokeEvent) => void) {
  function source(event: IpcMainInvokeEvent, id: string) {
    trusted(event); const item = assets.get(id); if (!item) throw new Error('Import the source file again.'); return item;
  }
  const progress = (event: IpcMainInvokeEvent, message: string) => (ratio: number) => {
    if (!event.sender.isDestroyed()) event.sender.send('media:progress', { ratio, message });
  };
  ipcMain.handle('media:waveform', (event, id: string) => {
    const item = source(event, id);
    return jobs.run(async execute => {
      const collector = new WaveformCollector();
      await execute(runFfmpeg(waveformArgs(item.asset, item.path), item.asset.duration, progress(event, 'Reading audio peaks…'), line => collector.push(line)));
      if (!collector.points.length) throw new Error('No audio peaks could be read.'); return collector.points;
    });
  });
  ipcMain.handle('media:frame-preview', (event, id: string, value: unknown, time: number) => {
    const item = source(event, id); const edit = parseEdit(value, item.asset);
    return jobs.run(execute => withResources([edit], async (paths, directory) => {
      const output = join(directory, 'frame.png');
      await execute(runFfmpeg(framePreviewArgs(item.asset, edit, time, item.path, output, paths[0]), 1, progress(event, 'Rendering edited frame…')));
      return new Uint8Array(await readFile(output));
    }, [item.asset]));
  });
  ipcMain.handle('media:audio-preview', (event, id: string, value: unknown) => {
    const item = source(event, id); const edit = parseEdit(value, item.asset);
    return jobs.run(async execute => {
      const directory = await mkdtemp(join(tmpdir(), 'frame-audio-preview-')); const output = join(directory, 'preview.wav');
      try {
        await execute(runFfmpeg(previewAudioArgs(item.asset, edit, item.path, output), 10, progress(event, 'Preparing audio effects preview…')));
        return new Uint8Array(await readFile(output));
      } finally { await rm(directory, { recursive: true, force: true }); }
    });
  });
  ipcMain.handle('media:thumbnails' , (event, id: string) => {
    const item = source(event, id);
    return jobs.run(async execute => {
      const directory = await mkdtemp(join(tmpdir(), 'frame-thumbnails-')); const output = join(directory, 'strip.png');
      try {
        await execute(runFfmpeg(thumbnailArgs(item.asset, item.path, output), item.asset.duration, progress(event, 'Reading video frames…')));
        return new Uint8Array(await readFile(output));
      } finally { await rm(directory, { recursive: true, force: true }); }
    });
  });
}
