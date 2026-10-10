import { captionItems, changeCaption } from '../core/caption-items';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { CaptionPosition, SubtitleCue } from '../core/subtitles';
import type { EditSettings, MediaAsset } from '../core/types';

type Gesture = { id: number; x: number; y: number; position: CaptionPosition; next: CaptionPosition; moved: boolean };
function MovableCaption({ cue, index, disabled, pause, change }: {
  cue: SubtitleCue; index: number; disabled: boolean; pause: () => void; change: (position: CaptionPosition) => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [draft, setDraft] = useState<CaptionPosition | null>(null);
  const position = draft ?? cue.position;
  function cancel() { gesture.current = null; setDraft(null); }
  useEffect(cancel, [cue, disabled]);
  function bounds() {
    const element = button.current!, frame = element.closest('.caption-preview')!.getBoundingClientRect();
    const text = element.getBoundingClientRect();
    return { frame, text };
  }
  function anchor(): CaptionPosition {
    const { frame, text } = bounds();
    return { x: (text.x + text.width / 2 - frame.x) / frame.width * 100, y: (text.bottom - frame.y) / frame.height * 100 };
  }
  function clamp(p: CaptionPosition): CaptionPosition {
    const { frame, text } = bounds();
    const half = Math.min(50, text.width / frame.width * 50), top = Math.min(100, text.height / frame.height * 100);
    const round = (n: number) => Math.round(n * 100) / 100;
    return { x: round(Math.max(half, Math.min(100 - half, p.x))), y: round(Math.max(top, Math.min(100, p.y))) };
  }
  function start(event: PointerEvent<HTMLButtonElement>) {
    if (disabled || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault(); event.stopPropagation(); pause();
    event.currentTarget.focus({ preventScroll: true });
    const p = anchor();
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, position: p, next: p, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const g = gesture.current; if (!g || g.id !== event.pointerId || disabled) return;
    const { frame } = bounds();
    g.moved ||= Math.hypot(event.clientX - g.x, event.clientY - g.y) > 2;
    if (!g.moved) return;
    g.next = clamp({ x: g.position.x + (event.clientX - g.x) / frame.width * 100, y: g.position.y + (event.clientY - g.y) / frame.height * 100 });
    setDraft(g.next);
  }
  function finish(event: PointerEvent<HTMLButtonElement>) {
    const g = gesture.current; if (!g || g.id !== event.pointerId) return;
    move(event); gesture.current = null;
    if (g.moved && !disabled) change(g.next);
    setDraft(null);
  }
  function key(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Escape') { event.stopPropagation(); cancel(); return; }
    if (disabled || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); pause();
    const p = anchor(), step = event.shiftKey ? 5 : 1;
    change(clamp({ x: p.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0), y: p.y + (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0) }));
  }
  return <button ref={button} type="button" className={`caption-position ${position ? 'positioned' : ''} ${draft ? 'dragging' : ''}`} disabled={disabled}
    aria-label={`Move caption ${index + 1}`} title="Drag to move. Arrow keys nudge; Shift moves faster. Escape cancels."
    style={position ? { left: `${position.x}%`, top: `${position.y}%` } : undefined}
    onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={cancel} onKeyDown={key}>{cue.text || 'Empty caption'}</button>;
}

export function CaptionPreview({ asset, edit, current, disabled, pause, update }: {
  asset: MediaAsset; edit: EditSettings; current: number; disabled: boolean; pause: () => void; update: (patch: Partial<EditSettings>) => void;
}) {
  const crop = edit.crop;
  const active = captionItems(edit).map(item => ({ cue: item.cue, mode: item.mode, index: item.index })).filter(({ cue, mode }) => mode !== 'none' && current >= cue.start && current < cue.end);
  const area = crop && asset.width && asset.height ? { left: `${crop.x / asset.width * 100}%`, top: `${crop.y / asset.height * 100}%`, width: `${crop.width / asset.width * 100}%`, height: `${crop.height / asset.height * 100}%` } : undefined;
  return <div className="caption-preview" style={area}><div className="caption-defaults">{active.map(({ cue, mode, index }) =>
    <MovableCaption key={index} cue={mode === 'embed' ? { ...cue, position: undefined } : cue} index={index} disabled={disabled || mode !== 'burn'} pause={pause}
      change={position => update(changeCaption(edit, captionItems(edit)[index], { position }))} />
  )}</div></div>;
}
