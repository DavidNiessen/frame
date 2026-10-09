import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { TimelineViewTools } from './layout/TimelineViewTools';
import { clipPositions, editClips, splitClip } from '../core/clips';
import { outputTimeAtSource, sourceTimeAtOutput } from '../core/fades';
import { TimelineMarkers } from './TimelineMarkers';
import { TimelineClip } from './TimelineClip';
import { TimelineNavigator, type TrackFilter } from './layout/TimelineNavigator';
import { TimedLanes } from './TimedLanes';
import { ThumbnailStrip } from './ThumbnailStrip';
import type { WaveformPoint } from '../core/waveform';
import { Scissors, Trash2, Undo2, Redo2, CornerDownLeft } from 'lucide-react';
import { editedDuration, timelineSections } from '../core/timeline';
import { time } from '../core/format';
import type { EditSettings, MediaAsset } from '../core/types';
export function Timeline({ asset, edit, current, seek, update, undo, redo, canUndo, canRedo, disabled, notify, waveform, waveformError, generateWaveform, analysisProgress, waveformLoading, cancelAnalysis, thumbnails, generateThumbnails, thumbnailLoading, thumbnailProgress, autoWaveforms = true, selectedClip, selectClip }: {
  selectedClip: string | null; selectClip: (id: string) => void;
  autoWaveforms?: boolean;
  thumbnails?: string; generateThumbnails: () => void; thumbnailLoading: boolean; thumbnailProgress: number;
  waveformLoading: boolean; cancelAnalysis: () => void; waveform?: WaveformPoint[]; waveformError?: string; generateWaveform: () => void; analysisProgress: number;
  asset: MediaAsset; edit: EditSettings; current: number; seek: (value: number) => void;
  update: (patch: Partial<EditSettings>) => void; undo: () => void; redo: () => void;
  canUndo: boolean; canRedo: boolean; disabled: boolean; notify: (message: string) => void;
}) {
  const slider = useRef<HTMLInputElement>(null);
  const scroll = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<TrackFilter>('all'), [compact, setCompact] = useState(true), [fraction, setFraction] = useState(0), [scrollLeft, setScrollLeft] = useState(0);
  const sequence = !!edit.clips, total = sequence ? editedDuration(edit) : asset.duration, position = sequence ? outputTimeAtSource(edit, current) : current;
  const clips = editClips(edit), positions = clipPositions(edit);
  const [zoom, setZoom] = useState(1);
  useEffect(() => { setZoom(1); if (scroll.current) { scroll.current.scrollLeft = 0; scroll.current.scrollTop = 0; } }, [asset.id]);
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
    const value = Math.max(0, Math.min(total, (event.clientX - bounds.left) / bounds.width * total));
    seek(sequence ? sourceTimeAtOutput(edit, value) : value);
  }
  function split() {
    if (!active || current - active.start < 0.05 || active.end - current < 0.05) { notify('Move the playhead inside a section to split it.'); return; }
    const clip = clips.find(clip => current >= clip.start && current < clip.end)!;
    update(splitClip(edit, clip.id, current)); selectClip(clip.id);
  }
  function remove() {
    if (clips.length < 2) { notify('Keep at least one section in the timeline.'); return; }
    const clip = selectedClip ? clips.find(c => c.id === selectedClip) : clips.find(c => c.start === active?.start && c.end === active?.end);
    if (clip) { update({ clips: clips.filter(c => c.id !== clip.id) }); seek(clips.find(c => c.id !== clip.id)!.start); }
  }
  return <section id="media-timeline" className="timeline panel" aria-label="Timeline">
    <div className="timeline-toolbar"><div><h2>Timeline</h2><span className="badge">{sections.length} {sections.length === 1 ? 'section' : 'sections'}</span></div><div className="timeline-actions"><button className="icon-button" aria-label="Undo edit" disabled={disabled || !canUndo} onClick={undo}><Undo2 size={16} /></button><button className="icon-button" aria-label="Redo edit" disabled={disabled || !canRedo} onClick={redo}><Redo2 size={16} /></button><span className="separator" /><button className="button small subtle" disabled={disabled} onClick={split}><Scissors size={14} />Split</button><button className="icon-button" aria-label="Remove selected section" disabled={disabled || (!active && !selectedClip) || sections.length < 2} onClick={remove}><Trash2 size={15} /></button></div></div>
    <TimelineNavigator tools={<TimelineViewTools zoom={zoom} setZoom={setZoom} />} zoom={zoom} edit={edit} position={outputTimeAtSource(edit, current)} fraction={fraction} pan={value => { if (scroll.current) scroll.current.scrollLeft = value * (scroll.current.scrollWidth - scroll.current.clientWidth); setFraction(value); }} filter={filter} setFilter={setFilter} compact={compact} setCompact={setCompact} locate={locate} />
    <div className="timeline-analysis">
      {asset.kind === 'video' && !thumbnails && <><button className="button small" disabled={disabled} onClick={generateThumbnails}>{thumbnailLoading ? `Reading frames ${Math.round(thumbnailProgress * 100)}%` : 'Generate thumbnails'}</button>{thumbnailLoading && <button className="button subtle small" onClick={cancelAnalysis}>Cancel thumbnails</button>}</>}
      {asset.hasAudio && !waveform && <>{asset.kind === 'audio' && autoWaveforms && !waveformError ? <span className="waveform-status" role="status">{waveformLoading ? `Reading waveform ${Math.round(analysisProgress * 100)}%` : 'Preparing waveform…'}</span> : <button className="button small" disabled={disabled} onClick={generateWaveform}>{waveformLoading ? `Reading peaks ${Math.round(analysisProgress * 100)}%` : waveformError ? 'Retry waveform' : 'Generate waveform'}</button>}{waveformLoading && <button className="button subtle small" onClick={cancelAnalysis}>Cancel waveform</button>}{waveformError && <span className="waveform-error" role="alert">{waveformError}</span>}</>}
      </div>
    <div ref={scroll} className="timeline-body" onScroll={event => { const node = event.currentTarget; setScrollLeft(node.scrollLeft); setFraction(node.scrollWidth > node.clientWidth ? node.scrollLeft / (node.scrollWidth - node.clientWidth) : 0); }} role="region" aria-label="Timeline tracks" tabIndex={0}><div ref={content} className="timeline-content" style={{ width: `${zoom * 100}%` }}><div className="timeline-ruler">{[0, 1, 2, 3, 4].map(i => <span key={i}>{time(total * i / 4)}</span>)}</div>
      <TimelineMarkers edit={edit} current={current} total={total} sequence={sequence} zoom={1} scrollLeft={0} disabled={disabled} seek={seek} update={update} notify={notify} />
      {thumbnails && <ThumbnailStrip url={thumbnails} duration={asset.duration} edit={edit} seek={seek} disabled={disabled} />}
      <TimedLanes compact={compact} filter={filter} selectClip={selectClip} asset={asset} edit={edit} update={update} disabled={disabled} seek={seek} />
    </div></div>
    <div className="timeline-clip-viewport">      <div className="timeline-track timeline-lane" style={{ width: `${zoom * 100}%`, transform: `translateX(${-scrollLeft}px)` }} onPointerDown={event => {
        if (disabled || event.button !== 0) return;
        event.preventDefault();
        slider.current?.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        scrub(event);
      }} onPointerMove={event => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) scrub(event);
      }} onPointerUp={event => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          scrub(event);
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}><div className="track-baseline" />{clips.map((clip, i) => <TimelineClip key={clip.id} clip={clip} index={i} edit={edit} asset={asset} duration={total} position={sequence ? positions[i] : clip} speed={sequence ? positions[i].speed : 1} disabled={disabled} selected={selectedClip === clip.id || !selectedClip && active?.start === clip.start} select={selectClip} seek={seek} update={update} waveform={waveform}
        dropIndex={x => { const bounds = content.current!.getBoundingClientRect(), value = Math.max(0, Math.min(total, (x - bounds.left) / bounds.width * total)); const index = (sequence ? positions : clips).findIndex(item => value < item.end); return index < 0 ? clips.length - 1 : index; }} />)}
        <div className="playhead" style={{ left: `${position / total * 100}%` }}><span /></div>
      <input ref={slider} className="seek-slider" type="range" aria-label="Seek playhead" aria-valuetext={`${current.toFixed(2)} of ${asset.duration.toFixed(2)} seconds`} min={0} max={asset.duration} step={0.01} value={current} disabled={disabled} onChange={event => seek(Number(event.target.value))} /></div>
    </div>
    <div className="timeline-summary"><span><CornerDownLeft size={13} /> Drag clips to reorder · edges to trim · Alt + arrows to move.</span><strong>{time(editedDuration(edit))} <span>output</span></strong></div>
  </section>;
}
