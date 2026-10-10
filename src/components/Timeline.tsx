import { TransientMessage } from './TransientMessage';
import { effectiveSpeed, extraInstances } from '../core/effect-instances';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { TimelineViewTools } from './layout/TimelineViewTools';
import { clipPositions, clipRecipe, editClips, splitClip } from '../core/clips';
import { appliedEffects, availableEffects, effectActive } from '../core/effect-library';
import { outputTimeAtSource, sourceTimeAtOutput } from '../core/fades';
import { TimelineSnapContext } from './TimelineSnapContext';
import { snapTargets, snapTime } from '../core/snapping';
import { AudioLayerLanes } from './AudioLayerLanes';
import { TimelineClip } from './TimelineClip';
import { TimelineNavigator, type TrackFilter } from './layout/TimelineNavigator';
import { TimedLanes } from './TimedLanes';
import type { WaveformPoint } from '../core/waveform';
import { Magnet, Scissors, Trash2, Undo2, Redo2, CornerDownLeft } from 'lucide-react';
import { editedDuration, timelineSections } from '../core/timeline';
import { time } from '../core/format';
import type { EffectId } from '../core/effect-library';
import { hasMinimumDuration } from '../core/time-range';
import { useTimelineScale } from '../hooks/useTimelineScale';
import type { EditSettings, MediaAsset } from '../core/types';
export function Timeline({ openEffect, generatingId, asset, edit, current, seek, update, undo, redo, canUndo, canRedo, disabled, notify, waveform, waveformError, retryWaveform, analysisProgress, waveformLoading, cancelAnalysis, autoWaveforms = true, assets, waveforms, selectedClip, selectClip }: {
  openEffect: (id: EffectId, instanceId?: string, keepView?: boolean) => void; generatingId: string | null;
  assets: MediaAsset[]; waveforms: Record<string, WaveformPoint[]>; selectedClip: string | null; selectClip: (id: string | null) => void;
  autoWaveforms?: boolean;
  waveformLoading: boolean; cancelAnalysis: () => void; waveform?: WaveformPoint[]; waveformError?: string; retryWaveform: () => void; analysisProgress: number;
  asset: MediaAsset; edit: EditSettings; current: number; seek: (value: number) => void;
  update: (patch: Partial<EditSettings>) => void; undo: () => void; redo: () => void;
  canUndo: boolean; canRedo: boolean; disabled: boolean; notify: (message: string) => void;
}) {
  const [snapping, setSnapping] = useState(() => { try { return localStorage.getItem('frame:timeline-snapping') !== 'false'; } catch { return true; } });
  const targets = snapTargets(edit, asset.duration, current), scrubTargets = snapTargets(edit, asset.duration);
  const slider = useRef<HTMLInputElement>(null);
  const scroll = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<TrackFilter>('all'), [compact, setCompact] = useState(false), [fraction, setFraction] = useState(0), [scrollLeft, setScrollLeft] = useState(0);
  const position = outputTimeAtSource(edit, current);
  const scale = useTimelineScale(asset.id, asset.duration, editedDuration(edit)), total = scale.total;
  const clips = useMemo(() => editClips(edit), [edit]), positions = useMemo(() => clipPositions(edit), [edit]);
  const effectCounts = useMemo(() => {
    const effects = availableEffects(asset).filter(effect => effect.scope === 'clip');
    return clips.map(clip => { const recipe = clipRecipe(edit, clip); return effects.filter(effect => recipe.addedEffects?.includes(effect.id) || effectActive(effect, recipe, asset)).length + extraInstances(recipe).filter(instance => availableEffects(asset).some(effect => effect.id === instance.effect && effect.scope === 'clip')).length; });
  }, [clips, edit, asset]);
  const effectCount = effectCounts.reduce((count, value) => count + value, 0) + appliedEffects(asset, edit, null).filter(effect => effect.scope === 'source').length + extraInstances(edit).filter(instance => availableEffects(asset).some(effect => effect.id === instance.effect && effect.scope === 'source') || instance.effect.includes('Fade')).length;
  const previousEffects = useRef(effectCount);
  useEffect(() => {
    if (effectCount > previousEffects.current) { setCompact(false); setFilter('all'); }
    previousEffects.current = effectCount;
  }, [effectCount]);
  const [zoom, setZoom] = useState(1);
  useEffect(() => { setZoom(1); if (scroll.current) { scroll.current.scrollLeft = 0; scroll.current.scrollTop = 0; } }, [asset.id]);
  useEffect(() => {
    const viewport = scroll.current; if (!viewport) return;
    const group = viewport.querySelector<HTMLElement>(`[data-timeline-kind="${filter}"]`);
    const top = group ? group.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop : 0;
    viewport.scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, [filter]);
  useEffect(() => {
    const viewport = scroll.current, tracks = content.current; if (!viewport || !tracks || zoom === 1) return;
    const x = position / total * tracks.clientWidth;
    if (x < viewport.scrollLeft) viewport.scrollLeft = Math.max(0, x - 24);
    else if (x > viewport.scrollLeft + viewport.clientWidth - 40) viewport.scrollLeft = x - viewport.clientWidth + 48;
  }, [position, zoom, asset.id, total]);
  const sections = timelineSections(edit);
  const active = sections.find(s => current >= s.start && current < s.end) ?? (current === sections.at(-1)?.end ? sections.at(-1) : undefined);
  function locate() { const viewport = scroll.current, tracks = content.current; if (viewport && tracks) { viewport.scrollLeft = Math.max(0, position / total * tracks.clientWidth - viewport.clientWidth / 2); viewport.scrollTop = viewport.scrollHeight; } }
  function scrub(event: PointerEvent<HTMLDivElement>) {
    const track = event.currentTarget;
    const bounds = track.getBoundingClientRect();
    if (disabled || bounds.width === 0) return;
    const raw = Math.max(0, Math.min(total, (event.clientX - bounds.left) / bounds.width * total));
    const value = snapping && !event.altKey ? snapTime(raw, scrubTargets.output, 8 / bounds.width * total, undefined) : raw;
    seek(sourceTimeAtOutput(edit, value));
  }
  const scrubProps = {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => { if (disabled || event.button !== 0) return; event.preventDefault(); slider.current?.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId); scrub(event); },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) scrub(event); },
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) { scrub(event); event.currentTarget.releasePointerCapture(event.pointerId); } },
  };
  function split() {
    const speed = effectiveSpeed({ ...edit, ...clips.find(clip => current >= clip.start && current < clip.end)?.effects });
    if (!active || !hasMinimumDuration({ start: active.start, end: current }, speed) || !hasMinimumDuration({ start: current, end: active.end }, speed)) { notify('Move the playhead inside a section to split it.'); return; }
    const clip = clips.find(clip => current >= clip.start && current < clip.end)!;
    update(splitClip(edit, clip.id, current)); selectClip(clip.id);
  }
  function remove() {
    if (clips.length < 2) { notify('Keep at least one section in the timeline.'); return; }
    const clip = selectedClip ? clips.find(c => c.id === selectedClip) : clips.find(c => c.start === active?.start && c.end === active?.end);
    if (clip) { update({ clips: clips.filter(c => c.id !== clip.id) }); seek(clips.find(c => c.id !== clip.id)!.start); }
  }
  return <TimelineSnapContext value={{ enabled: snapping, targets, frameRate: asset.frameRate }}><section id="media-timeline" className="timeline panel" aria-label="Timeline">
    <div className="timeline-toolbar"><div><h2>Timeline</h2><span className="badge">{sections.length} {sections.length === 1 ? 'section' : 'sections'}</span></div><div className="timeline-actions"><button className="icon-button" aria-label="Undo edit" disabled={disabled || !canUndo} onClick={undo}><Undo2 size={16} /></button><button className="icon-button" aria-label="Redo edit" disabled={disabled || !canRedo} onClick={redo}><Redo2 size={16} /></button><span className="separator" /><button className="icon-button snapping-toggle" aria-label="Timeline snapping" aria-pressed={snapping} title="Snap to clip edges, captions and frames · hold Alt to bypass" onClick={() => { setSnapping(!snapping); try { localStorage.setItem('frame:timeline-snapping', String(!snapping)); } catch {} }}><Magnet size={15} /></button><button className="button small subtle" disabled={disabled} onClick={split}><Scissors size={14} />Split</button><button className="icon-button" aria-label="Remove selected section" disabled={disabled || (!active && !selectedClip) || sections.length < 2} onClick={remove}><Trash2 size={15} /></button></div></div>
    <TimelineNavigator extent={total} tools={<TimelineViewTools zoom={zoom} setZoom={setZoom} fit={scale.fit} />} zoom={zoom} edit={edit} position={position} fraction={fraction} pan={value => { if (scroll.current) scroll.current.scrollLeft = value * (scroll.current.scrollWidth - scroll.current.clientWidth); setFraction(value); }} filter={filter} setFilter={setFilter} compact={compact} setCompact={setCompact} locate={locate} />
    <div className="timeline-analysis">
      {autoWaveforms && asset.hasAudio && !waveform && <>{waveformError ? <button className="button small" disabled={disabled} onClick={retryWaveform}>Retry waveform</button> : <span className="waveform-status" role="status">{waveformLoading ? `Reading waveform ${Math.round(analysisProgress * 100)}%` : 'Preparing waveform…'}</span>}{waveformLoading && <button className="button subtle small" onClick={cancelAnalysis}>Cancel waveform</button>}{waveformError && <TransientMessage className="waveform-error" role="alert">{waveformError}</TransientMessage>}</>}
    </div>
    <div ref={scroll} className="timeline-body" onScroll={event => { const node = event.currentTarget; setScrollLeft(node.scrollLeft); setFraction(node.scrollWidth > node.clientWidth ? node.scrollLeft / (node.scrollWidth - node.clientWidth) : 0); }} role="region" aria-label="Timeline tracks" tabIndex={0}><div ref={content} className="timeline-content" style={{ width: `${zoom * 100}%` }}><div className="timeline-ruler" {...scrubProps} title="Drag to scrub the sequence">{[0, 1, 2, 3, 4].map(i => <span key={i}>{time(total * i / 4)}</span>)}</div>
      {filter !== 'clips' && filter !== 'captions' && <AudioLayerLanes openEffect={openEffect} axisDuration={total} generatingId={generatingId} assets={assets} waveforms={waveforms} edit={edit} compact={compact} disabled={disabled} update={update} seek={seek} />}
      <TimedLanes total={total} openEffect={openEffect} compact={compact} filter={filter} selectClip={selectClip} asset={asset} edit={edit} update={update} disabled={disabled} seek={seek} />
    </div></div>
    <div className="timeline-clip-viewport">      <div className="timeline-track timeline-lane" style={{ width: `${zoom * 100}%`, transform: `translateX(${-scrollLeft}px)` }} {...scrubProps}><div className="track-baseline" />{clips.map((clip, i) => <TimelineClip openEffect={openEffect} key={clip.id} notify={notify} effectCount={effectCounts[i]} clip={clip} index={i} edit={edit} asset={asset} duration={total} position={positions[i]} speed={positions[i].speed} disabled={disabled} selected={selectedClip === clip.id || !selectedClip && active?.start === clip.start} select={selectClip} seek={seek} update={update} waveform={waveform}
        dropIndex={x => { const bounds = content.current!.getBoundingClientRect(), value = Math.max(0, Math.min(total, (x - bounds.left) / bounds.width * total)); const index = positions.findIndex(item => value < item.end); return index < 0 ? clips.length - 1 : index; }} />)}
        <div className="playhead" style={{ left: `${position / total * 100}%` }}><span /></div>
      <input data-preview-playback ref={slider} className="seek-slider" type="range" aria-label="Seek playhead" aria-valuetext={`${current.toFixed(2)} of ${asset.duration.toFixed(2)} seconds`} min={0} max={asset.duration} step={0.01} value={current} disabled={disabled} onChange={event => seek(Number(event.target.value))} /></div>
    </div>
    <div className="timeline-summary"><span><CornerDownLeft size={13} /> Drag clips to reorder · edges to trim · Alt + arrows to move.</span><strong>{time(editedDuration(edit))} <span>output</span></strong></div>
  </section></TimelineSnapContext>;
}
