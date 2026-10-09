import { useContext, useEffect, useRef, useState } from 'react';
import { Bookmark, BookmarkPlus, Pencil, Trash2, X } from 'lucide-react';
import { TimelineSnapContext } from './TimelineSnapContext';
import { snapTime } from '../core/snapping';
import { addMarker, markerColors, markerInSequence, orderedMarkers, type TimelineMarker } from '../core/markers';
import { outputTimeAtSource, sourceTimeAtOutput } from '../core/fades';
import { preciseTimecode } from '../core/playhead';
import type { EditSettings } from '../core/types';

interface Props { edit: EditSettings; current: number; total: number; sequence: boolean; zoom: number; scrollLeft: number; disabled: boolean; seek: (time: number) => void; update: (patch: Partial<EditSettings>) => void; notify: (text: string) => void }
export function TimelineMarkers(props: Props) {
  const snap = useContext(TimelineSnapContext);
  const { edit, current, total, sequence, zoom, scrollLeft, disabled, seek, update, notify } = props;
  const [open, setOpen] = useState(false), [selected, setSelected] = useState<string | null>(null), [draft, setDraft] = useState<{ id: string; time: number } | null>(null);
  const gesture = useRef<{ id: string; pointer: number; x: number; left: number; width: number; time: number; moved: boolean } | null>(null);
  function add() { try { const markers = addMarker(edit, current); update({ markers }); setSelected(markers.find(marker => Math.abs(marker.time - current) < .002)!.id); setOpen(true); } catch (issue) { notify((issue as Error).message); } }
  const markers = edit.markers ?? [], visible = sequence ? orderedMarkers(edit) : [...markers].sort((a, b) => a.time - b.time);
  return <div className="timeline-markers"><div className="marker-tools"><button className="icon-button" aria-label="Add timeline marker" title="Bookmark this moment · M" disabled={disabled || markers.length >= 500} onClick={add}><BookmarkPlus size={14} /></button><button className="marker-manager-button" disabled={!markers.length} onClick={() => setOpen(true)}><Bookmark size={12} />{markers.length ? `${markers.length} ${markers.length === 1 ? 'marker' : 'markers'}` : 'Markers'}</button></div><div className="marker-track-viewport"><div className="marker-track" style={{ width: `${zoom * 100}%`, transform: `translateX(${-scrollLeft}px)` }}>{visible.map(marker => {
    const source = draft?.id === marker.id ? draft.time : marker.time, position = sequence ? outputTimeAtSource(edit, source) : source;
    return <button key={marker.id} className={`timeline-marker marker-${marker.color}`} style={{ left: `${position / total * 100}%` }} aria-label={`Marker: ${marker.name}`} title={`${marker.name} · ${preciseTimecode(position)} · drag to move, double-click to rename`} disabled={disabled} onClick={event => { if (event.detail === 0 || !gesture.current?.moved) seek(marker.time); }} onDoubleClick={() => { setSelected(marker.id); setOpen(true); }} onPointerDown={event => {
      if (event.button !== 0) return; event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
      const bounds = event.currentTarget.parentElement!.getBoundingClientRect(); gesture.current = { id: marker.id, pointer: event.pointerId, x: event.clientX, left: bounds.left, width: bounds.width, time: marker.time, moved: false }; event.currentTarget.setPointerCapture(event.pointerId);
    }} onPointerMove={event => {
      const g = gesture.current; if (!g || g.pointer !== event.pointerId) return;
      if (Math.abs(event.clientX - g.x) > 3) g.moved = true;
      if (!g.moved) return;
      const raw = Math.max(0, Math.min(total, (event.clientX - g.left) / g.width * total));
      const own = sequence ? outputTimeAtSource(edit, marker.time) : marker.time;
      const position = snap.enabled && !event.altKey ? snapTime(raw, snap.targets[sequence ? 'output' : 'source'].filter(time => time !== own), 8 / g.width * total, sequence ? undefined : snap.frameRate) : raw;
      g.time = sequence ? sourceTimeAtOutput(edit, position) : position; setDraft({ id: marker.id, time: g.time });
    }} onPointerUp={event => {
      const g = gesture.current; if (!g || g.pointer !== event.pointerId) return;
      if (g.moved) update({ markers: markers.map(item => item.id === g.id ? { ...item, time: g.time } : item) });
      setDraft(null); event.currentTarget.releasePointerCapture(event.pointerId);
    }} onPointerCancel={() => { gesture.current = null; setDraft(null); }} onKeyDown={event => { if (event.key === 'Enter') seek(marker.time); }}><Bookmark size={14} fill="currentColor" /><span>{marker.name}</span></button>;
  })}</div></div>{open && <MarkerManager edit={edit} selected={selected} select={setSelected} disabled={disabled} seek={time => { seek(time); setOpen(false); }} update={update} close={() => setOpen(false)} />}</div>;
}
function MarkerManager({ edit, selected, select, disabled, seek, update, close }: { edit: EditSettings; selected: string | null; select: (id: string | null) => void; disabled: boolean; seek: (time: number) => void; update: (patch: Partial<EditSettings>) => void; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), [name, setName] = useState(''), [color, setColor] = useState<TimelineMarker['color']>('violet');
  const markers = edit.markers ?? [], marker = markers.find(item => item.id === selected);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => { setName(marker?.name ?? ''); setColor(marker?.color ?? 'violet'); }, [marker?.id]);
  return <dialog ref={dialog} className="shortcuts-dialog marker-dialog" aria-label="Timeline markers" onCancel={close}><div className="dialog-heading"><h2><Bookmark size={18} />Timeline markers</h2><button className="icon-button" aria-label="Close markers" onClick={close}><X size={18} /></button></div><p>Markers stay attached to their original footage when clips move.</p><div className="marker-list">{markers.map(item => <div className={selected === item.id ? 'selected' : ''} key={item.id}><button className={`marker-${item.color}`} title="Go to this marker" onClick={() => seek(item.time)}><Bookmark size={13} /><span>{item.name}<small>{markerInSequence(edit, item) ? preciseTimecode(outputTimeAtSource(edit, item.time)) : 'Outside retained clips'}</small></span></button><button className="icon-button" aria-label={`Rename ${item.name}`} disabled={disabled} onClick={() => select(item.id)}><Pencil size={13} /></button><button className="icon-button" aria-label={`Delete ${item.name}`} disabled={disabled} onClick={() => { update({ markers: markers.filter(marker => marker.id !== item.id) }); if (selected === item.id) select(null); }}><Trash2 size={13} /></button></div>)}</div>{marker && <form className="marker-edit-form" onSubmit={event => { event.preventDefault(); if (name.trim()) { update({ markers: markers.map(item => item.id === marker.id ? { ...item, name: name.trim(), color } : item) }); select(null); } }}><label>Marker name<input type="text" aria-label="Marker name" maxLength={80} value={name} disabled={disabled} onChange={event => setName(event.target.value)} /></label><label>Color<select aria-label="Marker color" value={color} disabled={disabled} onChange={event => setColor(event.target.value as TimelineMarker['color'])}>{markerColors.map(value => <option key={value} value={value}>{value}</option>)}</select></label><button className="button primary small" disabled={disabled || !name.trim()}>Save marker</button></form>}</dialog>;
}
