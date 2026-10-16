import { expect, it, vi } from 'vitest';
import type { FFmpeg } from '@ffmpeg/ffmpeg';
import { browserInputs } from '../src/engines/browser-inputs';
// The package's Node entry is an empty browser-only stub.
vi.mock('@ffmpeg/ffmpeg', () => ({ FFFSType: { WORKERFS: 'WORKERFS' } }));
const worker = () => ({
  loaded: true,
  createDir: vi.fn().mockResolvedValue(true),
  deleteDir: vi.fn().mockResolvedValue(true),
  mount: vi.fn().mockResolvedValue(true),
  unmount: vi.fn().mockResolvedValue(true),
  writeFile: vi.fn().mockResolvedValue(true),
  deleteFile: vi.fn().mockResolvedValue(true),
});
it('shares a read-only Blob mount across simultaneous readers without copying the source', async () => {
  const ff = worker(),
    file = new File(['media'], 'movie.mp4'),
    read = vi.spyOn(file, 'arrayBuffer');
  const inputs = browserInputs(ff as unknown as FFmpeg);
  const [first, second] = await Promise.all([inputs.open(file), inputs.open(file)]);
  expect(first).toBe(second);
  expect(ff.mount).toHaveBeenCalledTimes(1);
  expect(read).not.toHaveBeenCalled();
  expect(ff.writeFile).not.toHaveBeenCalled();
  await inputs.cleanup();
  await inputs.cleanup();
  expect(ff.unmount).toHaveBeenCalledTimes(1);
  expect(ff.deleteDir).toHaveBeenCalledTimes(1);
});
it('supports alternate cores without WORKERFS and cleans their fallback input', async () => {
  const ff = worker(),
    file = new File(['media'], 'movie.mp4');
  ff.mount.mockRejectedValue(new Error('Unsupported filesystem'));
  const inputs = browserInputs(ff as unknown as FFmpeg),
    path = await inputs.open(file);
  expect(ff.writeFile).toHaveBeenCalledWith(path, new Uint8Array(await file.arrayBuffer()));
  await inputs.cleanup();
  expect(ff.deleteFile).toHaveBeenCalledWith(path);
  expect(ff.unmount).not.toHaveBeenCalled();
});
it('does not read or copy a large source after the worker is terminated during mounting', async () => {
  const ff = worker(),
    file = new File(['media'], 'movie.mp4'),
    read = vi.spyOn(file, 'arrayBuffer');
  ff.mount.mockImplementation(async () => {
    ff.loaded = false;
    throw new Error('Worker terminated');
  });
  const inputs = browserInputs(ff as unknown as FFmpeg);
  await expect(inputs.open(file)).rejects.toThrow('Worker terminated');
  await inputs.cleanup();
  expect(read).not.toHaveBeenCalled();
  expect(ff.writeFile).not.toHaveBeenCalled();
});
