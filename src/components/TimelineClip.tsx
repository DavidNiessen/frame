import { availableEffects, type EffectId } from '../core/effect-library';
import { effectAction, effectDragType, existingEffectTarget } from '../core/effect-actions';
import { addTimelineEffect } from '../core/timeline-effects';
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
import { groupSlices, groupTrimState, resizeClipGroup } from '../core/clip-groups';
import { sourceTimeAtOutput } from '../core/fades';
export function TimelineClip({ clip, pieces = [clip], index, edit, asset, position, duration, speed, disabled, waveform, selected, select, seek, update, dropIndex, effectCount, notify, openEffect }: {
  openEffect: (id: EffectId, instanceId?: string) => void;
  notify: (message: string) => void;
  effectCount: number; clip: Clip; pieces?: Clip[]; index: number; edit: EditSettings; asset: MediaAsset; position: { start: number; end: number }; duration: number; speed: number; disabled: boolean;
  waveform?: WaveformPoint[]; selected: boolean; select: (id: string) => void; seek: (time: number) => void; update: (patch: Partial<EditSettings>) => void; dropIndex: (x: number) => number;
}) {
  const drag = useRef<{ pointer: number; origin: number; delta: number } | null>(null), [offset, setOffset] = useState(0), [effectDrop, setEffectDrop] = useState(false);
  const last = pieces.at(-1)!, grouped = !!clip.groupId, trim = grouped ? groupTrimState(edit, pieces, asset.duration) : null;
  const range = trim?.range ?? { start: clip.start, end: last.end };
  const firstLimits = sectionLimits(edit, index, asset.duration), lastLimits = sectionLimits(edit, index + pieces.length - 1, asset.duration), minimum = minimumSourceDuration(speed);
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
    const existing = existingEffectTarget(edit, asset, effect, null);
    if (existing) { if (effect.scope === 'clip') select(clip.id); openEffect(effect.id, existing.instanceId); return; }
    try { update(['mix', 'silence'].includes(effect.id) ? effectAction(edit, asset, effect, null, 'add', clip.start) : addTimelineEffect(edit, asset, effect.id, clip.start)); } catch (error) { notify((error as Error).message); }
  }
  return <div className={`movable-clip ${offset ? 'dragging' : ''} ${effectDrop ? 'effect-drop-target' : ''}`} onDragOver={dragOver} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setEffectDrop(false); }} onDrop={dropEffect} style={{ transform: `translateX(${offset}px)` }}><TimelineRange wideHandles range={range} displayRange={position} displaySpeed={speed} minimum={minimum} limits={trim?.limits ?? { start: firstLimits.start, end: lastLimits.end }} duration={duration}
    snapSpace={grouped ? 'output' : 'source'} snapMap={grouped ? targets => targets.filter(target => !pieces.slice(0, -1).some((_, i) => Math.abs(target - (position.start + pieces.slice(0, i + 1).reduce((sum, piece) => sum + (piece.end - piece.start) / speed, 0))) < .000001)).map(target => range.start + (target - position.start) * speed) : undefined}
    text={`${index + 1} · ${clip.source?.name ?? asset.name}${effectCount ? ' ✦' : ''}`} label={`Select section ${index + 1}, ${time(clip.start)} to ${time(last.end)}${grouped ? ', joined with cuts preserved' : ''}`} startLabel={index === 0 ? 'Trim start' : `Section ${index + 1} start`} endLabel={index + pieces.length === editClips(edit).length ? 'Trim end' : `Section ${index + 1} end`}
    startTitle="Drag left to restore the beginning · drag right to trim"
    endTitle="Drag right to restore the end · drag left to trim"
    className={`timeline-clip ${selected ? 'active' : ''} ${asset.kind} ${waveform ? 'with-waveform' : ''}`} disabled={disabled}
    renderContent={grouped || waveform ? shown => <div className="clip-waveform joined-waveform">{(trim ? groupSlices(trim.ranges, shown) : [shown]).map((retained, i) => <div key={i} className={i ? 'joined-piece cut-boundary' : 'joined-piece'} style={{ flexGrow: retained.end - retained.start }}>{waveform && <Waveform points={waveform} duration={asset.duration} range={retained} />}</div>)}</div> : undefined}
    onSelect={() => { select(clip.id); seek(clip.start); }} onChange={range => update(grouped ? resizeClipGroup(edit, pieces, range, asset.duration) : resizeSection(edit, index, range, asset.duration))}
    bodyProps={{
      onPointerDown: event => { event.stopPropagation(); if (disabled || event.button !== 0) return; event.preventDefault(); select(clip.id); event.currentTarget.focus({ preventScroll: true }); drag.current = { pointer: event.pointerId, origin: event.clientX, delta: 0 }; event.currentTarget.setPointerCapture(event.pointerId); },
      onPointerMove: event => { event.stopPropagation(); if (drag.current?.pointer !== event.pointerId) return; drag.current.delta = event.clientX - drag.current.origin; if (Math.abs(drag.current.delta) > 5) setOffset(drag.current.delta); },
      onPointerUp: event => { event.stopPropagation(); const gesture = drag.current; if (!gesture || gesture.pointer !== event.pointerId) return; if (Math.abs(event.clientX - gesture.origin) > 5) update(reorderClip(edit, clip.id, dropIndex(event.clientX))); else { const box = event.currentTarget.getBoundingClientRect(); seek(sourceTimeAtOutput(edit, position.start + Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) * (position.end - position.start))); } cancel(); event.currentTarget.releasePointerCapture(event.pointerId); },
      onPointerCancel: cancel, onLostPointerCapture: cancel,
      onKeyDown: event => { if (event.key === 'Escape') { event.preventDefault(); cancel(); } else if (event.altKey && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); select(clip.id); update(reorderClip(edit, clip.id, index + (event.key === 'ArrowLeft' ? -1 : pieces.length))); } },
      title: 'Drag to reorder · Alt + Left/Right to move · drag edges to trim',
    }} /></div>;
}
