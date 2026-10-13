import { useRef, useState, type PointerEvent } from 'react';
import { changeImageLayer, imageLayerKey, imageLayerRows } from '../core/image-layers';
import { parseImageMask } from '../core/image-masks';
import { frameDimensions } from '../core/geometry';
import { PaintingCanvas } from './PaintingCanvas';
import type { EffectId } from '../core/effect-ids';
import type { Editor } from '../hooks/useEditor';
/** The mask is a separate canvas tool: direct gestures create one undo entry. */
export function ImageMaskOverlay({
  editor,
  selectedEffect,
}: {
  editor: Editor;
  selectedEffect: { id: EffectId; instanceId?: string } | null;
}) {
  const edit = editor.edit!,
    key = selectedEffect ? imageLayerKey(selectedEffect.id, selectedEffect.instanceId) : '',
    row = imageLayerRows(editor.asset!, edit).find((row) => row.key === key),
    mask = parseImageMask(row?.state.mask),
    [draft, setDraft] = useState<typeof mask | null>(null),
    drag = useRef<{
      x: number;
      y: number;
      mask: typeof mask;
      next: typeof mask;
      corner: string;
    } | null>(null);
  if (!row || row.hidden || row.locked || mask.mode === 'none') return null;
  const change = (mask: typeof draft) => {
    if (mask) editor.update(changeImageLayer(edit, key, { mask }));
  };
  if (mask.mode === 'brush') {
    const dims = frameDimensions(editor.asset!, edit);
    return (
      <div className="image-mask-brush">
        <PaintingCanvas
          label="Paint effect mask"
          showExisting
          edit={{ ...edit, painting: mask.brush }}
          update={(patch) => change({ ...mask, brush: patch.painting! })}
          width={dims.width}
          height={dims.height}
          disabled={!!editor.busy}
          onError={editor.setNotice}
        />
      </div>
    );
  }
  const shown = draft ?? mask;
  function start(e: PointerEvent<HTMLButtonElement>, corner: string) {
    if (editor.busy) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, mask, next: mask, corner };
    setDraft(mask);
  }
  function move(e: PointerEvent<HTMLButtonElement>) {
    const g = drag.current;
    if (!g) return;
    const box = e.currentTarget.closest('.image-mask-frame')!.getBoundingClientRect(),
      dx = (e.clientX - g.x) / box.width,
      dy = (e.clientY - g.y) / box.height,
      m = { ...g.mask };
    if (g.corner === 'move') {
      m.x = Math.max(0, Math.min(1 - m.width, m.x + dx));
      m.y = Math.max(0, Math.min(1 - m.height, m.y + dy));
    } else {
      let right = m.x + m.width,
        bottom = m.y + m.height;
      const minW = Math.min(0.3, Math.max(0.01, 24 / box.width)),
        minH = Math.min(0.3, Math.max(0.01, 24 / box.height));
      if (g.corner.includes('w')) m.x = Math.max(0, Math.min(right - minW, m.x + dx));
      if (g.corner.includes('e')) right = Math.min(1, Math.max(m.x + minW, right + dx));
      if (g.corner.includes('n')) m.y = Math.max(0, Math.min(bottom - minH, m.y + dy));
      if (g.corner.includes('s')) bottom = Math.min(1, Math.max(m.y + minH, bottom + dy));
      m.width = right - m.x;
      m.height = bottom - m.y;
    }
    g.next = m;
    setDraft(m);
  }
  const finish = () => {
    if (drag.current) change(drag.current.next);
    drag.current = null;
    setDraft(null);
  };
  const events = {
    onPointerMove: move,
    onPointerUp: finish,
    onPointerCancel: () => {
      drag.current = null;
      setDraft(null);
    },
    onLostPointerCapture: () => {
      drag.current = null;
      setDraft(null);
    },
  };
  return (
    <div className="image-mask-frame">
      <div
        className={`image-mask-selection ${mask.mode}`}
        style={{
          left: `${shown.x * 100}%`,
          top: `${shown.y * 100}%`,
          width: `${shown.width * 100}%`,
          height: `${shown.height * 100}%`,
        }}
      >
        <button
          className="image-mask-move"
          aria-label="Move effect mask"
          disabled={!!editor.busy}
          onPointerDown={(e) => start(e, 'move')}
          {...events}
          onKeyDown={(e) => {
            if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
            e.preventDefault();
            e.stopPropagation();
            change({
              ...mask,
              x: Math.max(
                0,
                Math.min(
                  1 - mask.width,
                  mask.x + (e.key === 'ArrowRight' ? 0.01 : e.key === 'ArrowLeft' ? -0.01 : 0),
                ),
              ),
              y: Math.max(
                0,
                Math.min(
                  1 - mask.height,
                  mask.y + (e.key === 'ArrowDown' ? 0.01 : e.key === 'ArrowUp' ? -0.01 : 0),
                ),
              ),
            });
          }}
        />
        {['nw', 'ne', 'sw', 'se'].map((corner) => (
          <button
            className={`image-mask-handle ${corner}`}
            aria-label={`Resize effect mask ${corner}`}
            key={corner}
            disabled={!!editor.busy}
            onPointerDown={(e) => start(e, corner)}
            {...events}
          />
        ))}
      </div>
    </div>
  );
}
