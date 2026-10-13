import { useSyncExternalStore } from 'react';
import { defaultCanvasGuides, type CanvasGuideSettings } from '../core/canvas-guides';
const key = 'frame:canvas-guides',
  event = 'frame:canvas-guides-changed',
  defaults = defaultCanvasGuides();
let cached = defaults,
  serialized: string | null | undefined;
function snapshot() {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== serialized) {
      serialized = raw;
      const value = raw ? JSON.parse(raw) : defaults;
      cached =
        ['none', 'center', 'thirds', 'safe'].includes(value.grid) &&
        typeof value.snapping === 'boolean'
          ? { grid: value.grid, snapping: value.snapping }
          : defaults;
    }
  } catch {}
  return cached;
}
function subscribe(callback: () => void) {
  window.addEventListener(event, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(event, callback);
    window.removeEventListener('storage', callback);
  };
}
export function useCanvasGuides() {
  const settings = useSyncExternalStore(subscribe, snapshot, () => defaults);
  return {
    settings,
    change: (patch: Partial<CanvasGuideSettings>) => {
      cached = { ...snapshot(), ...patch };
      serialized = JSON.stringify(cached);
      try {
        localStorage.setItem(key, serialized);
      } catch {}
      window.dispatchEvent(new Event(event));
    },
  };
}
