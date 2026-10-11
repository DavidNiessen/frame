import { useEffect, useState } from 'react';
import { defaultPanelSizes, readPanelSizes, type PanelSizes } from '../core/panel-layout';
const key = 'frame:panel-layout:v1';
export function usePanelSizes() {
  const [sizes, setSizes] = useState(() => {
    try {
      return readPanelSizes(JSON.parse(localStorage.getItem(key) || '{}'));
    } catch {
      return { ...defaultPanelSizes };
    }
  });
  useEffect(() => {
    const save = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(sizes));
      } catch {
        /* Resizing remains available without storage. */
      }
    }, 150);
    return () => clearTimeout(save);
  }, [sizes]);
  return {
    sizes,
    resize: (panel: keyof PanelSizes, value: number) =>
      setSizes((current) => ({ ...current, [panel]: value })),
    reset: () => setSizes({ ...defaultPanelSizes }),
  };
}
