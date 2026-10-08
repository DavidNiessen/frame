import { ThumbnailStrip } from './ThumbnailStrip';
import { Waveform } from './Waveform';
import type { WaveformPoint } from '../core/waveform';
import { Scissors, Trash2, Undo2, Redo2, CornerDownLeft } from 'lucide-react';
import { editedDuration, timelineSections } from '../core/timeline';
import { time } from '../core/format';
import type { EditSettings, MediaAsset } from '../core/types';
export function Timeline({ asset, edit, current, seek, update, undo, redo, canUndo, canRedo, disabled, notify, waveform, generateWaveform, analysisProgress, waveformLoading, cancelAnalysis, thumbnails, generateThumbnails, thumbnailLoading, thumbnailProgress }: {
  thumbnails?: string; generateThumbnails: () => void; thumbnailLoading: boolean; thumbnailProgress: number;
  waveformLoading: boolean; cancelAnalysis: () => void; waveform?: WaveformPoint[]; generateWaveform: () => void; analysisProgress: number;
  asset: MediaAsset; edit: EditSettings; current: number; seek: (value: number) => void;
  update: (patch: Partial<EditSettings>) => void; undo: () => void; redo: () => void;
  canUndo: boolean; canRedo: boolean; disabled: boolean; notify: (message: string) => void;
}) {
  const sections = timelineSections(edit);
  const active = sections.find(s => current >= s.start && current < s.end) ?? sections.at(-1);
  function split() {
    if (!active || current - active.start < 0.05 || active.end - current < 0.05) { notify('Move the playhead inside a section to split it.'); return; }
    update({ splits: [...edit.splits, current] });
  }
  function remove() {
    if (!active || editedDuration(edit) - (active.end - active.start) < 0.05) { notify('Keep at least one section in the timeline.'); return; }
    update({ cuts: [...edit.cuts, active] });
  }
  return <section className="timeline panel">
    <div className="timeline-toolbar"><div><h2>Timeline</h2><span className="badge">{sections.length} {sections.length === 1 ? 'section' : 'sections'}</span></div><div className="timeline-actions"><button className="icon-button" aria-label="Undo edit" disabled={disabled || !canUndo} onClick={undo}><Undo2 size={16} /></button><button className="icon-button" aria-label="Redo edit" disabled={disabled || !canRedo} onClick={redo}><Redo2 size={16} /></button><span className="separator" /><button className="button small subtle" disabled={disabled} onClick={split}><Scissors size={14} />Split</button><button className="icon-button" aria-label="Remove selected section" disabled={disabled || sections.length < 2} onClick={remove}><Trash2 size={15} /></button></div></div>
    <div className="timeline-body">{asset.kind === 'video' && <div className="timeline-analysis"><button className="button subtle small" disabled={disabled || !!thumbnails} onClick={generateThumbnails}>{thumbnails ? 'Thumbnails ready' : thumbnailLoading ? `Reading frames ${Math.round(thumbnailProgress * 100)}%` : 'Generate thumbnails'}</button>{thumbnailLoading && <button className="button subtle small" onClick={cancelAnalysis}>Cancel thumbnails</button>}</div>}{asset.hasAudio && <div className="timeline-analysis"><button className="button subtle small" disabled={disabled || !!waveform} onClick={generateWaveform}>{waveform ? 'Waveform ready' : waveformLoading ? `Reading peaks ${Math.round(analysisProgress * 100)}%` : 'Generate waveform'}</button>{waveformLoading && <button className="button subtle small" onClick={cancelAnalysis}>Cancel waveform</button>}<small>Original audio peaks</small></div>}<div className="timeline-ruler">{[0, 1, 2, 3, 4].map(i => <span key={i}>{time(asset.duration * i / 4)}</span>)}</div>
      {thumbnails && <ThumbnailStrip url={thumbnails} duration={asset.duration} seek={seek} disabled={disabled} />}
      <div className="timeline-track"><div className="track-baseline" />{waveform && <Waveform points={waveform} duration={asset.duration} />}{sections.map((section, i) => <button key={`${section.start}-${section.end}`} className={`timeline-clip ${active === section ? 'active' : ''} ${asset.kind}`} disabled={disabled}
        style={{ left: `${section.start / asset.duration * 100}%`, width: `${(section.end - section.start) / asset.duration * 100}%` }} onClick={() => seek((section.start + section.end) / 2)} aria-label={`Select section ${i + 1}, ${time(section.start)} to ${time(section.end)}`}>
        <span className="clip-text">{asset.name}</span><span className="clip-lines" aria-hidden="true" /></button>)}
        <div className="playhead" style={{ left: `${current / asset.duration * 100}%` }}><span /></div>
      </div><input className="seek-slider" type="range" aria-label="Seek playhead" min={0} max={asset.duration} step={0.01} value={current} disabled={disabled} onChange={event => seek(Number(event.target.value))} />
      <div className="timeline-summary"><span><CornerDownLeft size={13} /> Click a section to select it. Split, then remove what you don’t need.</span><strong>{time(editedDuration(edit))} <span>output</span></strong></div>
    </div>
  </section>;
}
