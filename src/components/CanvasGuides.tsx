import { createContext, useMemo, useState, type ReactNode } from 'react';
import { useCanvasGuides } from '../hooks/useCanvasGuides';
export const CanvasGuidesContext = createContext<{
  enabled: boolean;
  show: (guides: { x?: number; y?: number }) => void;
  clear: () => void;
} | null>(null);
export function CanvasGuides({ children }: { children: ReactNode }) {
  const { settings } = useCanvasGuides(),
    [snap, setSnap] = useState<{ x?: number; y?: number }>({});
  const context = useMemo(
    () => ({
      enabled: settings.snapping,
      show: (next: { x?: number; y?: number }) =>
        setSnap((current) => (current.x === next.x && current.y === next.y ? current : next)),
      clear: () => setSnap({}),
    }),
    [settings.snapping],
  );
  const lines =
    settings.grid === 'center'
      ? [50]
      : settings.grid === 'thirds'
        ? [100 / 3, 200 / 3]
        : settings.grid === 'safe'
          ? [10, 90]
          : [];
  return (
    <CanvasGuidesContext.Provider value={context}>
      {children}
      <svg
        className="canvas-guides-overlay"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {lines.flatMap((n) => [
          <line key={`x${n}`} x1={n} y1={0} x2={n} y2={100} className="canvas-grid-line" />,
          <line key={`y${n}`} x1={0} y1={n} x2={100} y2={n} className="canvas-grid-line" />,
        ])}
        {snap.x !== undefined && (
          <line x1={snap.x * 100} y1={0} x2={snap.x * 100} y2={100} className="canvas-snap-line" />
        )}
        {snap.y !== undefined && (
          <line x1={0} y1={snap.y * 100} x2={100} y2={snap.y * 100} className="canvas-snap-line" />
        )}
      </svg>
    </CanvasGuidesContext.Provider>
  );
}
