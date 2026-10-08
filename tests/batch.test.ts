import { expect, it } from 'vitest';
import { batchSettings, runBatch, type BatchJob } from '../src/core/batch';
import { defaultSettings, type MediaAsset } from '../src/core/types';
const asset: MediaAsset = { id: 'one', name: 'tone.wav', size: 1, kind: 'audio', duration: 5, hasAudio: true, previewUrl: '' };
const job = (id: string): BatchJob => ({ id, asset, edit: defaultSettings(asset), status: 'waiting', progress: 0 });
it('copies output settings without replacing source-specific edits', () => {
  const own = { ...defaultSettings(asset), start: 1, volume: 0.5 };
  const edit = batchSettings(asset, own, asset, { ...defaultSettings(asset), format: 'flac' }, 'output');
  expect(edit.start).toBe(1); expect(edit.volume).toBe(0.5); expect(edit.format).toBe('flac');
  expect(batchSettings({ ...asset, duration: 10 }, own, asset, defaultSettings(asset), 'edits').end).toBe(10);
});
it('continues after invalid jobs and executes valid jobs sequentially', async () => {
  const jobs = [job('bad'), job('first'), job('second')]; jobs[0].edit.end = 100;
  const states = new Map<string, BatchJob>(); const order: string[] = []; let active = 0;
  await runBatch(jobs, async current => {
    expect(active++).toBe(0); order.push(current.id); await Promise.resolve(); active--;
    return { name: 'tone.mp3', size: 10 };
  }, () => false, state => states.set(state.id, state));
  expect(order).toEqual(['first', 'second']); expect(states.get('bad')?.status).toBe('failed'); expect(states.get('second')?.status).toBe('done');
});
it('keeps completed results and cancels remaining jobs', async () => {
  let cancelled = false; const states = new Map<string, BatchJob>();
  await runBatch([job('first'), job('second')], async () => { cancelled = true; return { name: 'done.mp3', size: 10 }; }, () => cancelled, state => states.set(state.id, state));
  expect(states.get('first')?.result?.name).toBe('done.mp3'); expect(states.get('second')?.status).toBe('cancelled');
});
