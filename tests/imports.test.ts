import { expect, it } from 'vitest';
import { isMediaFilename, orderBrowserFiles } from '../src/core/imports';
import { acceptMedia } from '../src/core/types';
import { remoteFilename } from '../src/core/remote-media';

it.each(['aif', 'AIF', 'aiff', 'AIFF'])(
  'accepts .%s audio in file pickers and URL imports',
  (extension) => {
    const name = `Song.${extension}`;
    expect(isMediaFilename(name)).toBe(true);
    expect(acceptMedia.split(',')).toContain(`.${extension.toLowerCase()}`);
    expect(remoteFilename(new URL(`https://media.test/${name}`), new Headers()).name).toBe(
      `Song.${extension.toLowerCase()}`,
    );
  },
);

function file(path: string, folder = true) {
  const file = new File(['media'], path.split('/').at(-1)!);
  Object.defineProperty(file, 'webkitRelativePath', { value: folder ? path : '' });
  return file;
}
it('orders folder imports by relative path and natural track number without mutating selection', () => {
  const chosen = ['Music/Album Two/01.wav', 'Music/Album One/10.wav', 'Music/Album One/2.wav'].map(
    (path) => file(path),
  );
  expect(orderBrowserFiles(chosen).map((file) => file.webkitRelativePath)).toEqual([
    'Music/Album One/2.wav',
    'Music/Album One/10.wav',
    'Music/Album Two/01.wav',
  ]);
  expect(chosen[0].webkitRelativePath).toBe('Music/Album Two/01.wav');
});
it('preserves explicit file selection order and positions in mixed folder drops', () => {
  const first = file('z.mp4', false),
    second = file('a.mp4', false);
  expect(orderBrowserFiles([first, second])).toEqual([first, second]);
  const lastAlbum = file('Music/Z/song.mp3'),
    firstAlbum = file('Music/A/song.mp3');
  expect(orderBrowserFiles([lastAlbum, first, firstAlbum, second])).toEqual([
    firstAlbum,
    first,
    lastAlbum,
    second,
  ]);
});
