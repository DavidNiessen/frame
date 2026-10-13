import { useEffect, useRef, useState } from 'react';
import { Grid3X3, Magnet } from 'lucide-react';
import { useCanvasGuides } from '../hooks/useCanvasGuides';
import type { CanvasGuideSettings } from '../core/canvas-guides';
export function CanvasGuidesMenu() {
  const { settings, change } = useCanvasGuides(),
    [open, setOpen] = useState(false),
    ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (e.target instanceof Node && !ref.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div
      className="canvas-guide-tools"
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        className="icon-button"
        aria-label="Canvas guides and snapping"
        aria-expanded={open}
        title="Canvas guides and snapping"
        onClick={() => setOpen((v) => !v)}
      >
        <Grid3X3 size={16} />
      </button>
      {open && (
        <div className="canvas-guide-menu">
          <label className="stacked-label">
            Guides
            <select
              aria-label="Canvas guide grid"
              value={settings.grid}
              onChange={(e) => change({ grid: e.target.value as CanvasGuideSettings['grid'] })}
            >
              <option value="none">No grid</option>
              <option value="center">Center lines</option>
              <option value="thirds">Rule of thirds</option>
              <option value="safe">10% safe area</option>
            </select>
          </label>
          <label className="switch-row">
            <span>
              <Magnet size={14} />
              Snap to edges & centers
            </span>
            <input
              type="checkbox"
              checked={settings.snapping}
              onChange={(e) => change({ snapping: e.target.checked })}
            />
          </label>
          <p className="field-note">Hold Alt / Option to bypass snapping while dragging.</p>
        </div>
      )}
    </div>
  );
}
