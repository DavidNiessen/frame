import { afterEach, expect, it, vi } from 'vitest';
import { previewFrameLoop } from '../src/hooks/preview-frame-loop';
afterEach(() => vi.unstubAllGlobals());
it('restarts playhead updates after a decoder pauses during a source handoff', () => {
  let id = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const media = Object.assign(new EventTarget(), { paused: false }) as unknown as HTMLMediaElement;
  const publish = vi.fn(),
    stop = previewFrameLoop(media, publish);
  function tick() {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(0));
  }
  tick();
  expect(publish).toHaveBeenCalledTimes(1);
  // Source replacement pauses the decoder before React observes a state change.
  Object.assign(media, { paused: true });
  tick();
  expect(frames.size).toBe(0);
  Object.assign(media, { paused: false });
  media.dispatchEvent(new Event('playing'));
  tick();
  tick();
  expect(publish).toHaveBeenCalledTimes(3);
  // Repeated play/metadata events cannot create duplicate animation loops.
  media.dispatchEvent(new Event('play'));
  media.dispatchEvent(new Event('loadedmetadata'));
  expect(frames.size).toBe(1);
  Object.assign(media, { paused: true });
  media.dispatchEvent(new Event('pause'));
  expect(frames.size).toBe(0);
  Object.assign(media, { paused: false });
  media.dispatchEvent(new Event('play'));
  tick();
  expect(publish).toHaveBeenCalledTimes(4);
  stop();
  expect(frames.size).toBe(0);
  media.dispatchEvent(new Event('play'));
  expect(frames.size).toBe(0);
});
