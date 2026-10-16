import type { PreviewProxy } from './hardware';

/** Small LRU; the visible decoder keeps ownership until React completes its handoff. */
export function previewCache<
  T extends { key: string; assetId: string; proxy: PreviewProxy; release: () => void },
>(limit = 3, bytes = 96 * 1024 * 1024) {
  const entries = new Map<string, T>();
  const remove = (key: string) => {
    const entry = entries.get(key);
    if (entry) {
      entries.delete(key);
      entry.release();
    }
  };
  return {
    get(key: string) {
      const value = entries.get(key);
      if (value) {
        entries.delete(key);
        entries.set(key, value);
      }
      return value;
    },
    put(value: T) {
      if (entries.has(value.key)) remove(value.key);
      entries.set(value.key, value);
    },
    trim(visible: string) {
      let total = [...entries.values()].reduce((sum, entry) => sum + entry.proxy.size, 0);
      for (const [key, entry] of entries) {
        if (entries.size <= limit && total <= bytes) break;
        if (key === visible) continue;
        total -= entry.proxy.size;
        remove(key);
      }
    },
    retainAsset(id?: string) {
      for (const [key, entry] of entries) if (entry.assetId !== id) remove(key);
    },
    clear() {
      for (const key of entries.keys()) remove(key);
    },
  };
}
