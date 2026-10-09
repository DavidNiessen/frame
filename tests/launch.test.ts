import { expect, it } from 'vitest';
import { resolve } from 'node:path';
import { launchArguments } from '../electron/launch-arguments';
import { LaunchInbox } from '../electron/launch-inbox';

it('routes file arguments without treating filenames, Chromium switches or URLs as workflow flags', () => {
  const cwd = resolve('Music');
  const paths = ['Song with spaces.wav', 'Björk $track.mp3'].map(path => resolve(cwd, path));
  expect(launchArguments(['Frame', '--user-data-dir=profile', '--frame-workflow=convert', '--', ...paths, 'notes.txt'], cwd)).toEqual({ workflow: 'convert', paths });
  expect(launchArguments(['Frame', '--', '--frame-workflow=convert.wav'], cwd)).toEqual({ workflow: 'edit', paths: [resolve(cwd, '--frame-workflow=convert.wav')] });
  expect(launchArguments(['Frame', 'track.FLAC'], cwd)).toEqual({ workflow: 'edit', paths: [resolve(cwd, 'track.FLAC')] });
  expect(launchArguments(['Frame', '--frame-workflow=invalid', 'https://host/track.mp3', 'app.cjs'], cwd)).toBeNull();
});
it('coalesces Windows multi-selection launches and retains workflow order until explicitly consumed', () => {
  const queue = new LaunchInbox(() => {}, 'win32');
  queue.enqueue({ workflow: 'convert', paths: ['C:\\Music\\One.mp3'] });
  const first = queue.peek()!;
  queue.enqueue({ workflow: 'convert', paths: ['c:\\music\\one.mp3', 'C:\\Music\\Two.wav'] });
  expect(queue.peek()).toEqual({ ...first, count: 2 });
  queue.enqueue({ workflow: 'edit', paths: ['C:\\Music\\Three.mp4'] });
  expect(() => queue.consume('forged')).toThrow('no longer available');
  expect(queue.consume(first.id).paths).toEqual(['C:\\Music\\One.mp3', 'C:\\Music\\Two.wav']);
  expect(queue.peek()?.workflow).toBe('edit'); queue.consume(queue.peek()!.id); expect(queue.peek()).toBeNull();
});
it('reports an oversized launch without dropping already queued files', () => {
  const queue = new LaunchInbox(() => {});
  queue.enqueue({ workflow: 'edit', paths: ['/first.mp3'] });
  queue.enqueue({ workflow: 'convert', paths: Array.from({ length: 2000 }, (_, index) => `/${index}.wav`) });
  expect(queue.consume(queue.peek()!.id).paths).toEqual(['/first.mp3']);
  expect(queue.consume(queue.peek()!.id).error).toContain('Too many');
  expect(queue.peek()).toBeNull();
});
