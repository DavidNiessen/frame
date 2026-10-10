import { Waveform } from './Waveform';
import { layerWaveformPoints, sameLayerSource } from '../core/audio-layers';
import type { WaveformPoint } from '../core/waveform';
import { TimelineSnapContext } from './TimelineSnapContext';
import { snapTime } from '../core/snapping';
import { useContext, useMemo, useRef, useState } from 'react';
import { AudioLines, ChevronDown } from 'lucide-react';
import type { EditSettings, MediaAsset } from '../core/types';
import type { AudioLayer } from '../core/audio-layers';
import { editedDuration } from '../core/timeline';
import { sourceTimeAtOutput } from '../core/fades';
import { TimelineRange } from './TimelineRange';
export function AudioLayerLanes({ edit, assets, waveforms, compact, disabled, update, seek }: { assets: MediaAsset[]; waveforms: Record<string, WaveformPoint[]>; edit: EditSettings; compact: boolean; disabled: boolean; update: (patch: Partial<EditSettings>) => void; seek: (source: number) => void }) {
  const tracks = edit.audioLayers ?? [], duration = editedDuration(edit);
  if (!tracks.length) return null;
  function patch(id: string, values: Partial<AudioLayer>) { update({ audioLayers: tracks.map(layer => { if (layer.id !== id) return layer; const next = { ...layer, ...values }, length = next.end - next.start; return { ...next, fadeIn: Math.min(next.fadeIn, length), fadeOut: Math.min(next.fadeOut, length) }; }) }); }
  return <details className="timeline-lane-group" open={!compact}><summary><AudioLines size={14} />Music & voiceover <span>{tracks.length}</span><ChevronDown size={14} /></summary>{tracks.map((layer, index) => <AudioLayerBar key={layer.id} layer={layer} index={index} duration={duration} points={waveforms[assets.find(asset => sameLayerSource(layer.source, asset))?.id ?? '']} disabled={disabled} patch={patch} seek={output => seek(sourceTimeAtOutput(edit, output))} />)}</details>;
}
function AudioLayerBar({ layer, index, duration, points, disabled, patch, seek }: { points?: WaveformPoint[]; layer: AudioLayer; index: number; duration: number; disabled: boolean; patch: (id: string, values: Partial<AudioLayer>) => void; seek: (output: number) => void }) {
  const snap = useContext(TimelineSnapContext);
  const gesture = useRef<{ pointer: number; origin: number; width: number; moved: boolean } | null>(null), [offset, setOffset] = useState(0), pending = useRef(0);
  const peaks = useMemo(() => points ? layerWaveformPoints({ ...layer, end: Math.min(layer.end, duration) }, points) : undefined, [layer, points, duration]);
  const shown = { start: layer.start + offset, end: Math.min(duration, layer.end + offset) };
  if (layer.start >= duration) return <div className="audio-track-outside">{index + 1}. {layer.source.name} · outside current edit</div>;
  return <div className="timeline-lane audio-layer-lane"><TimelineRange range={shown} limits={{ start: Math.max(0, layer.start - (layer.loop ? layer.start : layer.sourceStart)), end: duration }} duration={duration} snapSpace="output" label={`Audio track ${index + 1}: ${layer.source.name}`} text={`${layer.muted ? 'Muted · ' : ''}${layer.source.name}`} className={`audio-layer-bar ${layer.muted ? 'inactive' : ''} ${peaks ? 'with-waveform' : ''}`} disabled={disabled} onSelect={() => seek(layer.start)} onChange={range => { const delta = range.start - layer.start; patch(layer.id, { start: range.start, end: range.end, sourceStart: layer.loop ? layer.sourceStart : Math.min(layer.sourceEnd - .05, Math.max(0, layer.sourceStart + delta)) }); }} renderContent={() => peaks && <div className="clip-waveform"><Waveform points={peaks} duration={Math.min(layer.end, duration) - layer.start} range={{ start: 0, end: Math.min(layer.end, duration) - layer.start }} /></div>} bodyProps={{
    onPointerDown: event => { if (disabled || event.button !== 0) return; event.stopPropagation(); event.preventDefault(); const bounds = event.currentTarget.closest('.timeline-lane')!.getBoundingClientRect(); gesture.current = { pointer: event.pointerId, origin: event.clientX, width: bounds.width, moved: false }; pending.current = 0; event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId); },
    onPointerMove: event => { const g = gesture.current; if (!g || g.pointer !== event.pointerId) return; const raw = (event.clientX - g.origin) / g.width * duration; g.moved ||= Math.abs(event.clientX - g.origin) > 3; const target = snap.enabled && !event.altKey ? snapTime(layer.start + raw, snap.targets.output.filter(value => Math.abs(value - layer.start) > .00001 && Math.abs(value - layer.end) > .00001), 8 / g.width * duration) - layer.start : raw; pending.current = Math.max(-layer.start, Math.min(Math.max(0, duration - layer.end), target)); setOffset(pending.current); },
    onPointerUp: event => { const g = gesture.current; if (!g || g.pointer !== event.pointerId) return; if (g.moved) patch(layer.id, { start: layer.start + pending.current, end: layer.end + pending.current }); else seek(layer.start); gesture.current = null; setOffset(0); event.currentTarget.releasePointerCapture(event.pointerId); },
    onPointerCancel: () => { gesture.current = null; setOffset(0); }, onLostPointerCapture: () => { gesture.current = null; setOffset(0); },
    onKeyDown: event => { if (!event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); event.stopPropagation(); const delta = (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? .1 : .01), next = Math.max(0, Math.min(duration - (layer.end - layer.start), layer.start + delta)); patch(layer.id, { start: next, end: next + layer.end - layer.start }); },
  }} /></div>;
}
