import { effectiveSpeed } from '../core/effect-instances';
import { availableEffects } from '../core/effect-library';
import { effectAction, effectDragType } from '../core/effect-actions';
import type { DragEvent } from 'react';
import { useRef, useState } from 'react';
import { TimelineRange } from './TimelineRange';
import { Waveform } from './Waveform';
import { resizeSection, sectionLimits } from '../core/timeline-edit';
import { editClips, reorderClip, type TimelineClip as Clip } from '../core/clips';
import type { EditSettings, MediaAsset } from '../core/types';
import type { WaveformPoint } from '../core/waveform';
import { time } from '../core/format';
import { minimumSourceDuration } from '../core/time-range';
export function TimelineClip({ clip, index, edit, asset, position, duration, speed, disabled, waveform, selected, select, seek, update, dropIndex, effectCount, notify }: {
  notify: (message: string) => void;
  effectCount: number; clip: Clip; index: number; edit: EditSettings; asset: MediaAsset; position: { start: number; end: number }; duration: number; speed: number; disabled: boolean;
  waveform?: WaveformPoint[]; selected: boolean; select: (id: string) => void; seek: (time: number) => void; update: (patch: Partial<EditSettings>) => void; dropIndex: (x: number) => number;
}) {
  const drag = useRef<{ pointer: number; origin: number; delta: number } | null>(null), [offset, setOffset] = useState(0), [effectDrop, setEffectDrop] = useState(false);
  function cancel() { drag.current = null; setOffset(0); }
  function dragOver(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes(effectDragType)) return;
    event.stopPropagation(); event.preventDefault();
    event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
    if (!disabled) setEffectDrop(true);
  }
  function dropEffect(event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes(effectDragType)) return;
    event.preventDefault(); event.stopPropagation(); setEffectDrop(false);
    if (disabled) return;
    const effect = availableEffects(asset).find(item => item.id === event.dataTransfer.getData(effectDragType));
    if (!effect) return;
    update(effectAction(edit, asset, effect, clip.id, 'add', clip.start));
    select(clip.id);
  }
  return <div className={`movable-clip ${offset ? 'dragging' : ''} ${effectDrop ? 'effect-drop-target' : ''}`} onDragOver={dragOver} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setEffectDrop(false); }} onDrop={dropEffect} style={{ transform: `translateX(${offset}px)` }}><TimelineRange wideHandles range={clip} displayRange={position} displaySpeed={speed} minimum={minimumSourceDuration(effectiveSpeed({ ...edit, ...clip.effects }))} limits={sectionLimits(edit, index, asset.duration)} duration={duration}
    text={`${index + 1} · ${asset.name}${effectCount ? ' ✦' : ''}`} label={`Select section ${index + 1}, ${time(clip.start)} to ${time(clip.end)}`} startLabel={index === 0 ? 'Trim start' : `Section ${index + 1} start`} endLabel={index === editClips(edit).length - 1 ? 'Trim end' : `Section ${index + 1} end`}
    startTitle={clip.start === 0 ? 'Start of source · drag right to trim' : 'Drag left to restore the beginning · drag right to trim'}
    endTitle={clip.end === asset.duration ? 'End of source · restore the beginning with the left handle' : 'Drag right to restore the end · drag left to trim'}
    onLimit={edge => notify(edge === 'end' ? clip.end === asset.duration ? 'End of source reached. Drag the left handle back to restore the trimmed beginning.' : 'This clip cannot extend into another clip’s source footage.' : clip.start === 0 ? 'Start of source reached. Drag the right handle forward to restore the trimmed end.' : 'This clip cannot extend into another clip’s source footage.')}
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
