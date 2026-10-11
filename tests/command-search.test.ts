import { expect, it } from 'vitest';
import { searchCommands } from '../src/core/command-search';
it('ranks Save project ahead of Open project help mentioning saved edits', () => {
  const open = { label: 'Open a project', description: 'Restore saved edits', group: 'Projects' },
    save = { label: 'Save project', description: 'Keep a portable recipe', group: 'Projects' };
  expect(searchCommands([open, save], 'save project')).toEqual([save, open]);
  expect(searchCommands([open, save], '  SAVE   PROJ ')).toEqual([save, open]);
  expect(searchCommands([open, save], '')).toEqual([open, save]);
});
it('matches multiple words across labels and aliases while preserving unavailable results', () => {
  const command = {
    label: 'Café review',
    description: 'Inspect audio',
    group: 'Review',
    keywords: 'volume loudness',
    disabled: 'Import media first',
  };
  expect(searchCommands([command], 'CAFE loudness')).toEqual([command]);
  expect(searchCommands([command], 'cafe video')).toEqual([]);
});
