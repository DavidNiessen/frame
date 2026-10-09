import { useRef, type PointerEvent } from 'react';
import { resizeSection, sectionLimits } from '../core/timeline-edit';
import { TimedLanes } from './TimedLanes';
import { TimelineRange } from './TimelineRange';
import { ThumbnailStrip } from './ThumbnailStrip';
import { Waveform } from './Waveform';
import type { WaveformPoint } from '../core/waveform';
import { Scissors, Trash2, Undo2, Redo2, CornerDownLeft } from 'lucide-react';
import { editedDuration, timelineSections } from '../core/timeline';
import { time } from '../core/format';
import type { EditSettings, MediaAsset } from '../core/types';
export function Timeline({ asset, edit, current, seek, update, undo, redo, canUndo, canRedo, disabled, notify, waveform, waveformError, generateWaveform, analysisProgress, waveformLoading, cancelAnalysis, thumbnails, generateThumbnails, thumbnailLoading, thumbnailProgress, autoWaveforms = true }: {
  autoWaveforms?: boolean;
  thumbnails?: string; generateThumbnails: () => void; thumbnailLoading: boolean; thumbnailProgress: number;
  waveformLoading: boolean; cancelAnalysis: () => void; waveform?: WaveformPoint[]; waveformError?: string; generateWaveform: () => void; analysisProgress: number;
  asset: MediaAsset; edit: EditSettings; current: number; seek: (value: number) => void;
  update: (patch: Partial<EditSettings>) => void; undo: () => void; redo: () => void;
  canUndo: boolean; canRedo: boolean; disabled: boolean; notify: (message: string) => void;
}) {
  const slider = useRef<HTMLInputElement>(null);
  const sections = timelineSections(edit);
  const active = sections.find(s => current >= s.start && current < s.end) ?? (current === sections.at(-1)?.end ? sections.at(-1) : undefined);
  function scrub(event: PointerEvent<HTMLDivElement>) {
    const track = event.currentTarget;
    const bounds = track.getBoundingClientRect();
    if (disabled || bounds.width === 0) return;
    seek(Math.max(0, Math.min(asset.duration, (event.clientX - bounds.left) / bounds.width * asset.duration)));
  }
  function split() {
    if (!active || current - active.start < 0.05 || active.end - current < 0.05) { notify('Move the playhead inside a section to split it.'); return; }
    update({ splits: [...edit.splits, current] });
  }
  function remove() {
    if (!active || editedDuration(edit) - (active.end - active.start) / edit.speed < 0.05) { notify('Keep at least one section in the timeline.'); return; }
    update({ cuts: [...edit.cuts, active] });
  }
  return <section className="timeline panel">
    <div className="timeline-toolbar"><div><h2>Timeline</h2><span className="badge">{sections.length} {sections.length === 1 ? 'section' : 'sections'}</span></div><div className="timeline-actions"><button className="icon-button" aria-label="Undo edit" disabled={disabled || !canUndo} onClick={undo}><Undo2 size={16} /></button><button className="icon-button" aria-label="Redo edit" disabled={disabled || !canRedo} onClick={redo}><Redo2 size={16} /></button><span className="separator" /><button className="button small subtle" disabled={disabled} onClick={split}><Scissors size={14} />Split</button><button className="icon-button" aria-label="Remove selected section" disabled={disabled || !active || sections.length < 2} onClick={remove}><Trash2 size={15} /></button></div></div>
    <div className="timeline-body"><div className="timeline-analysis">
      {asset.kind === 'video' && !thumbnails && <><button className="button small" disabled={disabled} onClick={generateThumbnails}>{thumbnailLoading ? `Reading frames ${Math.round(thumbnailProgress * 100)}%` : 'Generate thumbnails'}</button>{thumbnailLoading && <button className="button subtle small" onClick={cancelAnalysis}>Cancel thumbnails</button>}</>}
      {asset.hasAudio && !waveform && <>{asset.kind === 'audio' && autoWaveforms && !waveformError ? <span className="waveform-status" role="status">{waveformLoading ? `Reading waveform ${Math.round(analysisProgress * 100)}%` : 'Preparing waveform…'}</span> : <button className="button small" disabled={disabled} onClick={generateWaveform}>{waveformLoading ? `Reading peaks ${Math.round(analysisProgress * 100)}%` : waveformError ? 'Retry waveform' : 'Generate waveform'}</button>}{waveformLoading && <button className="button subtle small" onClick={cancelAnalysis}>Cancel waveform</button>}{waveformError && <span className="waveform-error" role="alert">{waveformError}</span>}</>}
      </div><div className="timeline-ruler">{[0, 1, 2, 3, 4].map(i => <span key={i}>{time(asset.duration * i / 4)}</span>)}</div>
      {thumbnails && <ThumbnailStrip url={thumbnails} duration={asset.duration} seek={seek} disabled={disabled} />}
      <TimedLanes asset={asset} edit={edit} update={update} disabled={disabled} seek={seek} />
      <div className="timeline-track timeline-lane" onPointerDown={event => {
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
      }}><div className="track-baseline" />{sections.map((section, i) => <TimelineRange key={i} range={section} limits={sectionLimits(edit, i, asset.duration)} duration={asset.duration}
        text={asset.name} label={`Select section ${i + 1}, ${time(section.start)} to ${time(section.end)}`} startLabel={i === 0 ? 'Trim start' : `Section ${i + 1} start`} endLabel={i === sections.length - 1 ? 'Trim end' : `Section ${i + 1} end`}
        className={`timeline-clip ${active === section ? 'active' : ''} ${asset.kind} ${waveform ? 'with-waveform' : ''}`} disabled={disabled}
        renderContent={waveform ? range => <div className="clip-waveform"><Waveform points={waveform} duration={asset.duration} range={range} /></div> : undefined}
        onSelect={() => seek((section.start + section.end) / 2)} onChange={range => update(resizeSection(edit, i, range, asset.duration))} />)}
        <div className="playhead" style={{ left: `${current / asset.duration * 100}%` }}><span /></div>
      <input ref={slider} className="seek-slider" type="range" aria-label="Seek playhead" aria-valuetext={`${current.toFixed(2)} of ${asset.duration.toFixed(2)} seconds`} min={0} max={asset.duration} step={0.01} value={current} disabled={disabled} onChange={event => seek(Number(event.target.value))} /></div>
      <div className="timeline-summary"><span><CornerDownLeft size={13} /> Drag clip edges to trim. Click or drag inside to seek.</span><strong>{time(editedDuration(edit))} <span>output</span></strong></div>
    </div>
  </section>;
}
