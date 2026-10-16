import { expect, it, vi } from 'vitest';
import { previewCache } from '../src/core/preview-cache';
const entry = (key: string, size = 1, assetId = 'source') => ({
  key,
  assetId,
  proxy: { id: key, url: key, size },
  release: vi.fn(),
});
it('reuses recent recipes and releases the least recent only after the visible handoff', () => {
  const cache = previewCache<ReturnType<typeof entry>>(2),
    a = entry('a'),
    b = entry('b'),
    c = entry('c');
  cache.put(a);
  cache.put(b);
  expect(cache.get('a')).toBe(a);
  cache.put(c);
  expect(b.release).not.toHaveBeenCalled();
  cache.trim('c');
  expect(b.release).toHaveBeenCalledTimes(1);
  expect(cache.get('a')).toBe(a);
  expect(cache.get('b')).toBeUndefined();
  cache.clear();
  cache.clear();
  expect(a.release).toHaveBeenCalledTimes(1);
  expect(c.release).toHaveBeenCalledTimes(1);
});
it('bounds retained bytes while preserving an oversized active decoder', () => {
  const cache = previewCache<ReturnType<typeof entry>>(3, 10),
    a = entry('a', 6),
    b = entry('b', 20);
  cache.put(a);
  cache.put(b);
  cache.trim('b');
  expect(a.release).toHaveBeenCalledTimes(1);
  expect(b.release).not.toHaveBeenCalled();
  cache.retainAsset('other');
  expect(b.release).toHaveBeenCalledTimes(1);
});

it('keeps the full image and its interaction base until both visible sources have switched', () => {
  const cache = previewCache<ReturnType<typeof entry>>(1, 10),
    full = entry('full', 8),
    base = entry('base', 8);
  cache.put(full);
  cache.put(base);
  cache.trim(['full', 'base']);
  expect(full.release).not.toHaveBeenCalled();
  expect(base.release).not.toHaveBeenCalled();
  cache.trim('full');
  expect(base.release).toHaveBeenCalledTimes(1);
});
