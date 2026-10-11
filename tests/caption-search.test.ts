import { expect, it } from 'vitest';
import { findCaptions, replaceCaptions } from '../src/core/caption-search';
import type { Subtitles } from '../src/core/subtitles';
const options = { caseSensitive: false, wholeWords: true };
it('finds literal Unicode words and replaces text without changing caption timing or positions', () => {
  const subtitles: Subtitles = {
    mode: 'burn',
    cues: [
      { start: 1, end: 2, text: 'Café café décafé C++', position: { x: 20, y: 70 } },
      { start: 3, end: 4, text: 'CAFÉ' },
    ],
  };
  expect(findCaptions(subtitles, 'café', options)).toEqual({ count: 3, cueIndices: [0, 1] });
  expect(findCaptions(subtitles, 'café', { ...options, caseSensitive: true }).count).toBe(1);
  const replaced = replaceCaptions(subtitles, 'C++', '$&', options);
  expect(replaced.cues[0]).toEqual({ ...subtitles.cues[0], text: 'Café café décafé $&' });
  expect(subtitles.cues[0].text).toContain('C++');
});
it('rejects replacements that would invalidate any cue atomically', () => {
  const subtitles: Subtitles = { mode: 'embed', cues: [{ start: 0, end: 1, text: 'aa' }] };
  expect(() => replaceCaptions(subtitles, 'a', 'x'.repeat(2000), options)).not.toThrow(); // Whole-word search finds no match.
  expect(() =>
    replaceCaptions(subtitles, 'a', 'x'.repeat(2000), { ...options, wholeWords: false }),
  ).toThrow();
  expect(subtitles.cues[0].text).toBe('aa');
});
