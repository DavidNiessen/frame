import { useRef, type PointerEvent } from 'react';
import type { Crop } from '../core/types';
export function CropOverlay({
  crop,
  width,
  height,
  disabled,
  onChange,
}: {
  crop: Crop;
  width: number;
  height: number;
  disabled: boolean;
  onChange: (crop: Crop) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; crop: Crop; corner: string } | null>(null);
  function start(event: PointerEvent<HTMLDivElement>, corner: string) {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, crop: { ...crop }, corner };
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current || !frame.current) return;
    const bounds = frame.current.getBoundingClientRect();
    const dx = Math.round(((event.clientX - drag.current.x) / bounds.width) * width);
    const dy = Math.round(((event.clientY - drag.current.y) / bounds.height) * height);
    const { crop: original, corner } = drag.current;
    let x = original.x;
    let y = original.y;
    let right = x + original.width;
    let bottom = y + original.height;
    if (corner === 'move') {
      x = Math.max(0, Math.min(width - original.width, x + dx));
      y = Math.max(0, Math.min(height - original.height, y + dy));
      right = x + original.width;
      bottom = y + original.height;
    } else {
      if (corner.includes('w')) x = Math.max(0, Math.min(right - 2, x + dx));
      if (corner.includes('e')) right = Math.min(width, Math.max(x + 2, right + dx));
      if (corner.includes('n')) y = Math.max(0, Math.min(bottom - 2, y + dy));
      if (corner.includes('s')) bottom = Math.min(height, Math.max(y + 2, bottom + dy));
    }
    onChange({ x, y, width: right - x, height: bottom - y });
  }
  return (
    <div ref={frame} className="crop-frame" aria-hidden="true">
      <div
        className="crop-selection"
        style={{
          left: `${(crop.x / width) * 100}%`,
          top: `${(crop.y / height) * 100}%`,
          width: `${(crop.width / width) * 100}%`,
          height: `${(crop.height / height) * 100}%`,
        }}
        onPointerDown={(event) => start(event, 'move')}
        onPointerMove={move}
        onPointerUp={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
      >
        <span className="crop-grid" />
        {['nw', 'ne', 'sw', 'se'].map((corner) => (
          <div
            key={corner}
            className={`crop-handle ${corner}`}
            onPointerDown={(event) => start(event, corner)}
            onPointerMove={move}
            onPointerUp={() => {
              drag.current = null;
            }}
          />
        ))}
      </div>
    </div>
  );
}
