import { expect, it } from 'vitest';
import { namedConversion, validateBatchOptions } from '../src/core/output-naming';
import { conversionName } from '../src/core/conversion';
import type { MediaAsset } from '../src/core/types';
const asset: MediaAsset = { id: 'song', name: 'My:Song.wav', relativePath: 'Album/My:Song.wav', kind: 'audio', hasAudio: true, duration: 2, size: 1, previewUrl: '' };
it('expands collection naming tokens into portable paths', () => {
  expect(conversionName(asset, 'flac', true, '{folder}-{index}-{name}-{format}', 2)).toBe('Album/Album-002-My_Song-flac.flac');
  expect(namedConversion({ ...asset, metadata: { title: 'The:Song', artist: 'Artist', album: 'Album', track: '2/12' } }, 'flac', '{artist}-{album}-{track}-{title}')).toBe('Artist-Album-002-The_Song.flac');
  expect(namedConversion({ ...asset, name: 'CON.wav' }, 'mp3')).toBe('_CON.mp3');
  expect(namedConversion(asset, 'wav', '  .... ')).toBe('media.wav');
  expect(namedConversion(asset, 'mp3', '{name}'.repeat(20)).length).toBeLessThanOrEqual(184);
  for (const pattern of ['../{name}', 'C:\\{name}', '{unknown}', '', '{name']) expect(() => namedConversion(asset, 'mp3', pattern)).toThrow();
});
it('rejects malformed naming and sequence data at the batch boundary', () => {
  expect(() => validateBatchOptions({ conversion: true, namingTemplate: '{index}-{name}', order: ['one', 'two'] })).not.toThrow();
  for (const options of [{ order: ['one', 'one'] }, { order: [3] }, { namingTemplate: '{secret}' }, []]) expect(() => validateBatchOptions(options as never)).toThrow();
});
