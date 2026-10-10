import { expect, it } from 'vitest';
import type { ExportProgress, MediaEngine } from '../src/core/types';
import { loadingActivity } from '../src/core/loading-activity';
import { trackedEngine } from '../src/engines/tracked-engine';
it('forwards real engine progress and selects the correct cancellation owner during overlapping jobs', async () => {
  let finishExport!: () => void, finishPreview!: () => void, cancelled = '';
  const exported: ExportProgress[] = [];
  const engine = trackedEngine({
    platform: 'desktop', cancel: () => { cancelled = 'export'; }, cancelJoinedPreview: () => { cancelled = 'preview'; },
    async export(_asset: unknown, _edit: unknown, progress: (p: ExportProgress) => void) {
      progress({ ratio: .45, message: 'Encoding media…' });
      await new Promise<void>(resolve => { finishExport = resolve; }); return null;
    },
    async effectPreview(_asset: unknown, _edit: unknown, progress: (p: ExportProgress) => void) {
      progress({ ratio: .8, message: 'Preparing playback…' });
      await new Promise<void>(resolve => { finishPreview = resolve; }); return { id: 'preview', url: 'blob:preview', size: 1 };
    },
  } as unknown as MediaEngine);
  const output = engine.export({} as never, {} as never, p => exported.push(p));
  const preview = engine.effectPreview!({} as never, {} as never, () => {});
  try {
    expect(exported).toEqual([{ ratio: .45, message: 'Encoding media…' }]);
    expect(loadingActivity.taskSnapshot()).toMatchObject({ label: 'Exporting media…', ratio: .45 });
    loadingActivity.taskSnapshot()!.cancel!(); expect(cancelled).toBe('export');
    finishExport(); await output;
    expect(loadingActivity.taskSnapshot()).toMatchObject({ label: 'Updating effects preview…', ratio: .8 });
    loadingActivity.taskSnapshot()!.cancel!(); expect(cancelled).toBe('preview');
  } finally { finishExport(); finishPreview(); await Promise.all([output, preview]); }
  expect(loadingActivity.snapshot()).toBe('');
});
it('reports footer waveform cancellation and preserves unrelated analysis errors', async () => {
  let reject!: (error: Error) => void;
  const engine = trackedEngine({
    platform: 'web', cancelWaveform: () => reject(new Error('called FFmpeg.terminate()')),
    waveform: () => new Promise((_resolve, failure) => { reject = failure; }),
  } as unknown as MediaEngine);
  const cancelled = engine.waveform!({} as never, () => {});
  loadingActivity.taskSnapshot()!.cancel!();
  await expect(cancelled).rejects.toThrow('Waveform generation cancelled.');
  expect(loadingActivity.snapshot()).toBe('');
  const failed = engine.waveform!({} as never, () => {});
  reject(new Error('No audio stream.'));
  await expect(failed).rejects.toThrow('No audio stream.');
  expect(loadingActivity.snapshot()).toBe('');
});
