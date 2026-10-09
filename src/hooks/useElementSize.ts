import { useLayoutEffect, useState, type RefObject } from 'react';
export function useElementSize(ref: RefObject<HTMLElement | null>, initial: { width: number; height: number }) {
  const [size, setSize] = useState(initial);
  useLayoutEffect(() => {
    const element = ref.current; if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize(current => current.width === width && current.height === height ? current : { width, height });
    });
    observer.observe(element); return () => observer.disconnect();
  }, [ref]);
  return size;
}
