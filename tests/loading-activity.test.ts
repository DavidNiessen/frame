import { expect, it } from 'vitest';
import { createActivityStore } from '../src/core/loading-activity';
it('keeps activity visible until all overlapping jobs finish, including cancellation and errors', async () => {
  const activity = createActivityStore(), snapshots: string[] = [];
  const unsubscribe = activity.subscribe(() => snapshots.push(activity.snapshot()));
  const finishImport = activity.begin('Import'), finishPreview = activity.begin('Preview');
  finishImport(); expect(activity.snapshot()).toBe('Preview');
  finishImport(); expect(activity.snapshot()).toBe('Preview');
  await expect(activity.run('Export', async () => { throw new Error('Cancelled'); })).rejects.toThrow('Cancelled');
  expect(activity.snapshot()).toBe('Preview'); finishPreview(); expect(activity.snapshot()).toBe('');
  expect(snapshots).toEqual(['Import', 'Preview', 'Preview', 'Export', 'Preview', '']); unsubscribe();
});
