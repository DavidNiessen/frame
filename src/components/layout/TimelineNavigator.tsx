import type { ReactNode } from 'react';
import { LocateFixed } from 'lucide-react';
import { clipPositions } from '../../core/clips';
import { editedDuration } from '../../core/timeline';
import type { EditSettings } from '../../core/types';
export type TrackFilter = 'all' | 'clips' | 'captions' | 'effects';
export function TimelineNavigator({ edit, position, fraction, zoom, pan, filter, setFilter, compact, setCompact, locate, tools, extent, showPreview = true }: {
  showPreview?: boolean; extent?: number;
  edit: EditSettings; position: number; fraction: number; zoom: number; pan: (value: number) => void; filter: TrackFilter; setFilter: (value: TrackFilter) => void; compact: boolean; setCompact: (value: boolean) => void; locate: () => void; tools: ReactNode;
}) {
  const duration = extent ?? editedDuration(edit);
  return <div className="timeline-navigation">
    <div className="timeline-navigation-top"><div className="timeline-track-filters" aria-label="Visible timeline tracks">{(['all', 'clips', 'captions', 'effects'] as const).map(value => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'all' ? 'All tracks' : value}</button>)}<button className="compact-tracks" aria-pressed={compact} onClick={() => setCompact(!compact)}>Compact</button><button className="icon-button" aria-label="Locate playhead" onClick={locate}><LocateFixed size={14} /></button></div>{tools}</div>
    {showPreview && <div className="timeline-overview">{clipPositions(edit).map(({ clip, start, end }, i) => <span key={clip.id} style={{ left: `${start / duration * 100}%`, width: `${(end - start) / duration * 100}%` }}>{i + 1}</span>)}<b aria-hidden="true" style={{ left: `${fraction * (1 - 1 / zoom) * 100}%`, width: `${100 / zoom}%` }} /><i aria-hidden="true" style={{ left: `${position / duration * 100}%` }} /><label className="timeline-pan"><span className="sr-only">Navigate timeline</span><input type="range" aria-label="Timeline horizontal position" aria-valuetext={`${Math.round(fraction * 100)} percent`} min={0} max={1} step={.001} value={fraction} onChange={event => pan(Number(event.target.value))} /></label></div>}
  </div>;
}
