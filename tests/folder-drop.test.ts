import { expect, it } from 'vitest';
import { droppedFiles } from '../src/engines/folder-drop';

function file(name: string): FileSystemEntry {
  return {
    name,
    isDirectory: false,
    file: (done: (file: File) => void) => done(new File(['media'], name)),
  } as unknown as FileSystemEntry;
}
function directory(name: string, batches: FileSystemEntry[][]): FileSystemEntry {
  return {
    name,
    isDirectory: true,
    createReader: () => {
      let index = 0;
      return {
        readEntries: (done: (entries: FileSystemEntry[]) => void) => done(batches[index++] || []),
      };
    },
  } as unknown as FileSystemEntry;
}
function transfer(entries: FileSystemEntry[]): DataTransfer {
  return {
    files: [],
    items: entries.map((entry) => ({ webkitGetAsEntry: () => entry })),
  } as unknown as DataTransfer;
}

it('reads every directory-entry page and retains nested relative paths on dropped files', async () => {
  const album = directory('Album', [
    Array.from({ length: 100 }, (_, i) => file(`Song-${i}.wav`)),
    [file('Final.flac'), file('cover.jpg')],
  ]);
  const files = await droppedFiles(transfer([directory('Music', [[album]]), file('single.mp4')]));
  expect(files).toHaveLength(103);
  expect(files[100].webkitRelativePath).toBe('Music/Album/Final.flac');
  expect(files[101].webkitRelativePath).toBe('Music/Album/cover.jpg');
  expect(files[102].name).toBe('single.mp4');
});
it('falls back to regular files and stops a dropped folder exceeding the library bound', async () => {
  const source = new File(['media'], 'single.mp3');
  expect(await droppedFiles({ files: [source], items: [] } as unknown as DataTransfer)).toEqual([
    source,
  ]);
  await expect(
    droppedFiles(
      transfer([
        directory('Music', [Array.from({ length: 2001 }, (_, i) => file(`Song-${i}.wav`))]),
      ]),
    ),
  ).rejects.toThrow('2000');
});
