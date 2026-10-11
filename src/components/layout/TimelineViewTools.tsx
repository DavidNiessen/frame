import { Minus, Plus, ScanLine } from 'lucide-react';
export function TimelineViewTools({
  zoom,
  setZoom,
  fit,
}: {
  zoom: number;
  setZoom: (value: number) => void;
  fit?: () => void;
}) {
  return (
    <div className="timeline-view-tools">
      <span>Track view</span>
      <div className="timeline-zoom">
        <button
          className="icon-button"
          aria-label="Zoom out timeline"
          disabled={zoom <= 1}
          onClick={() => setZoom(Math.max(1, zoom - 0.5))}
        >
          <Minus size={14} />
        </button>
        <input
          type="range"
          aria-label="Timeline zoom"
          aria-valuetext={`${Math.round(zoom * 100)} percent`}
          min={1}
          max={8}
          step={0.25}
          value={zoom}
          onChange={(event) => setZoom(Number(event.target.value))}
        />
        <button
          className="icon-button"
          aria-label="Zoom in timeline"
          disabled={zoom >= 8}
          onClick={() => setZoom(Math.min(8, zoom + 0.5))}
        >
          <Plus size={14} />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          className="button small"
          title="Fit the sequence in the timeline"
          onClick={() => {
            setZoom(1);
            fit?.();
          }}
        >
          <ScanLine size={13} />
          Fit
        </button>
      </div>
    </div>
  );
}
