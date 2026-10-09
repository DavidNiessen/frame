import { useRef, useState } from 'react';
import { TimelineRange } from './TimelineRange';
import { Waveform } from './Waveform';
import { resizeSection, sectionLimits } from '../core/timeline-edit';
import { editClips, reorderClip, type TimelineClip as Clip } from '../core/clips';
import type { EditSettings, MediaAsset } from '../core/types';
import type { WaveformPoint } from '../core/waveform';
import { time } from '../core/format';
export function TimelineClip({ clip, index, edit, asset, position, duration, speed, disabled, waveform, selected, select, seek, update, dropIndex }: {
  clip: Clip; index: number; edit: EditSettings; asset: MediaAsset; position: { start: number; end: number }; duration: number; speed: number; disabled: boolean;
  waveform?: WaveformPoint[]; selected: boolean; select: (id: string) => void; seek: (time: number) => void; update: (patch: Partial<EditSettings>) => void; dropIndex: (x: number) => number;
}) {
  const drag = useRef<{ pointer: number; origin: number; delta: number } | null>(null), [offset, setOffset] = useState(0);
  function cancel() { drag.current = null; setOffset(0); }
  const effectCount = Object.keys(clip.effects).length;
  return <div className={`movable-clip ${offset ? 'dragging' : ''}`} style={{ transform: `translateX(${offset}px)` }}><TimelineRange range={clip} displayRange={position} displaySpeed={speed} limits={sectionLimits(edit, index, asset.duration)} duration={duration}
    text={`${index + 1} · ${asset.name}${effectCount ? ' ✦' : ''}`} label={`Select section ${index + 1}, ${time(clip.start)} to ${time(clip.end)}`} startLabel={index === 0 ? 'Trim start' : `Section ${index + 1} start`} endLabel={index === editClips(edit).length - 1 ? 'Trim end' : `Section ${index + 1} end`}
    className={`timeline-clip ${selected ? 'active' : ''} ${asset.kind} ${waveform ? 'with-waveform' : ''}`} disabled={disabled}
    renderContent={waveform ? range => <div className="clip-waveform"><Waveform points={waveform} duration={asset.duration} range={range} /></div> : undefined}
    onSelect={() => { select(clip.id); seek(clip.start); }} onChange={range => update(resizeSection(edit, index, range, asset.duration))}
    bodyProps={{
      onPointerDown: event => { event.stopPropagation(); if (disabled || event.button !== 0) return; event.preventDefault(); select(clip.id); event.currentTarget.focus({ preventScroll: true }); drag.current = { pointer: event.pointerId, origin: event.clientX, delta: 0 }; event.currentTarget.setPointerCapture(event.pointerId); },
      onPointerMove: event => { event.stopPropagation(); if (drag.current?.pointer !== event.pointerId) return; drag.current.delta = event.clientX - drag.current.origin; if (Math.abs(drag.current.delta) > 5) setOffset(drag.current.delta); },
      onPointerUp: event => { event.stopPropagation(); const gesture = drag.current; if (!gesture || gesture.pointer !== event.pointerId) return; if (Math.abs(event.clientX - gesture.origin) > 5) update(reorderClip(edit, clip.id, dropIndex(event.clientX))); else { const box = event.currentTarget.getBoundingClientRect(); seek(clip.start + Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) * (clip.end - clip.start)); } cancel(); event.currentTarget.releasePointerCapture(event.pointerId); },
      onPointerCancel: cancel, onLostPointerCapture: cancel,
      onKeyDown: event => { if (event.key === 'Escape') { event.preventDefault(); cancel(); } else if (event.altKey && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); select(clip.id); update(reorderClip(edit, clip.id, index + (event.key === 'ArrowLeft' ? -1 : 1))); } },
      title: 'Drag to reorder · Alt + Left/Right to move · drag edges to trim',
    }} /></div>;
}
