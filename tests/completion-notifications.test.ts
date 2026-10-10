import { expect, it } from 'vitest';
import { completionMessage, parseCompletion } from '../src/core/completion-notifications';
it('reports partial failures explicitly and accepts only bounded completion summaries', () => {
  expect(completionMessage({ kind: 'conversion', total: 3, completed: 2, failed: 1 })).toEqual({ title: 'Frame · Conversion finished', body: '2 files saved. 1 file needs attention.' });
  for (const invalid of [{ kind: 'run', total: 1, completed: 1, failed: 0 }, { kind: 'export', total: 0, completed: 1, failed: 0 }, { kind: 'export', total: 1, completed: 2, failed: 0 }, { kind: 'export', total: 2, completed: 0, failed: 2 }]) expect(() => parseCompletion(invalid)).toThrow();
});
