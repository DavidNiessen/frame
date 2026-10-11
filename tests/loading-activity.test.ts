import { expect, it } from 'vitest';
import { createActivityStore } from '../src/core/loading-activity';
it('keeps activity visible until all overlapping jobs finish, including cancellation and errors', async () => {
  const activity = createActivityStore(),
    snapshots: string[] = [];
  const unsubscribe = activity.subscribe(() => snapshots.push(activity.snapshot()));
  const finishImport = activity.begin('Import'),
    finishPreview = activity.begin('Preview');
  finishImport();
  expect(activity.snapshot()).toBe('Preview');
  finishImport();
  expect(activity.snapshot()).toBe('Preview');
  await expect(
    activity.run('Export', async () => {
      throw new Error('Cancelled');
    }),
  ).rejects.toThrow('Cancelled');
  expect(activity.snapshot()).toBe('Preview');
  finishPreview();
  expect(activity.snapshot()).toBe('');
  expect(snapshots).toEqual(['Import', 'Preview', 'Preview', 'Export', 'Preview', '']);
  unsubscribe();
});
it('keeps foreground progress and cancellation visible over background jobs and ignores late updates', () => {
  const activity = createActivityStore(),
    cancel = () => {};
  const exportJob = activity.start('Export', {
    priority: 20,
    ratio: 0.2,
    cancel,
    cancelLabel: 'Cancel export',
  });
  const preview = activity.start('Preview', { priority: 5, ratio: 0.7 });
  expect(activity.taskSnapshot()).toMatchObject({ label: 'Export', ratio: 0.2, cancel });
  exportJob.update({ ratio: 0.6, message: 'Encoding' });
  expect(activity.taskSnapshot()).toMatchObject({
    label: 'Export',
    ratio: 0.6,
    message: 'Encoding',
  });
  exportJob.finish();
  expect(activity.taskSnapshot()).toMatchObject({ label: 'Preview', ratio: 0.7 });
  exportJob.update({ ratio: 1 });
  expect(activity.snapshot()).toBe('Preview');
  preview.finish();
  expect(activity.taskSnapshot()).toBeNull();
});
