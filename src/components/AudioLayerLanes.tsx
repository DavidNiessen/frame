import { allAudioLayers, updateAudioLayers, sourceRecipes } from '../core/effect-instances';
import { Waveform } from './Waveform';
import { layerWaveformPoints, audioLayerSource } from '../core/audio-layers';
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
export function AudioLayerLanes({ axisDuration, openEffect, edit, assets, waveforms, compact, disabled, update, seek, generatingId }: { axisDuration: number; openEffect: (id: 'mix', instanceId?: string, keepView?: boolean) => void; generatingId: string | null; assets: MediaAsset[]; waveforms: Record<string, WaveformPoint[]>; edit: EditSettings; compact: boolean; disabled: boolean; update: (patch: Partial<EditSettings>) => void; seek: (source: number) => void }) {
  const tracks = allAudioLayers(edit), duration = editedDuration(edit);
  if (!tracks.length) return null;
  function patch(id: string, values: Partial<AudioLayer>) { update(updateAudioLayers(edit, tracks.map(layer => { if (layer.id !== id) return layer; const next = { ...layer, ...values }, length = next.end - next.start; return { ...next, fadeIn: Math.min(next.fadeIn, length), fadeOut: Math.min(next.fadeOut, length) }; }))); }
  return <details aria-label="Music & voiceover tracks" className="timeline-lane-group" open={!compact}><summary><AudioLines size={14} />Music & voiceover <span>{tracks.length}</span><ChevronDown size={14} /></summary>{tracks.map((layer, index) => <AudioLayerBar select={() => openEffect('mix', sourceRecipes(edit, 'mix').find(({ recipe }) => recipe.audioLayers?.some(item => item.id === layer.id))?.id, true)} key={layer.id} layer={layer} index={index} duration={duration} axisDuration={axisDuration} source={audioLayerSource(layer, assets)} points={waveforms[audioLayerSource(layer, assets)?.id ?? '']} generatingId={generatingId} disabled={disabled} patch={patch} remove={() => update(updateAudioLayers(edit, tracks.filter(track => track.id !== layer.id)))} seek={output => seek(sourceTimeAtOutput(edit, output))} />)}</details>;
}
function AudioLayerBar({ axisDuration, layer, index, duration, points, disabled, patch, seek, source, generatingId, remove, select }: { axisDuration: number; select: () => void; remove: () => void; source?: MediaAsset; generatingId: string | null; points?: WaveformPoint[]; layer: AudioLayer; index: number; duration: number; disabled: boolean; patch: (id: string, values: Partial<AudioLayer>) => void; seek: (output: number) => void }) {
  const snap = useContext(TimelineSnapContext);
  const gesture = useRef<{ pointer: number; origin: number; width: number; moved: boolean } | null>(null), [offset, setOffset] = useState(0), pending = useRef(0);
  function cancel() { gesture.current = null; setOffset(0); }
  const shown = { start: layer.start + offset, end: Math.min(duration, layer.end + offset) };
  if (layer.start >= duration) return <div className="audio-track-outside">{index + 1}. {layer.source.name} · outside current edit</div>;
  return <div className="audio-layer-entry">{source && !points && generatingId === source.id && <span className="waveform-status" role="status">Reading track waveform…</span>}<div className="timeline-lane audio-layer-lane"><TimelineRange wideHandles selectOnPointer range={shown} limits={{ start: Math.max(0, layer.start - (layer.loop ? layer.start : layer.sourceStart)), end: duration }} duration={axisDuration} snapSpace="output" label={`Audio track ${index + 1}: ${layer.source.name}`} text={`${layer.muted ? 'Muted · ' : ''}${layer.source.name}`} className={`audio-layer-bar ${layer.muted ? 'inactive' : ''} ${points ? 'with-waveform' : ''}`} disabled={disabled} onSelect={() => { select(); seek(layer.start); }} onChange={range => { const delta = range.start - layer.start; patch(layer.id, { start: range.start, end: range.end, sourceStart: layer.loop ? layer.sourceStart : Math.min(layer.sourceEnd - .05, Math.max(0, layer.sourceStart + delta)) }); }} renderContent={range => {
    if (!points) return null;
    return <LayerWaveform layer={layer} range={range} offset={offset} points={points} />;
  }} remove={{ label: `Remove audio track ${index + 1}`, run: remove }} bodyProps={{
    onPointerDown: event => { if (disabled || event.button !== 0) return; event.stopPropagation(); event.preventDefault(); select(); const bounds = event.currentTarget.closest('.timeline-lane')!.getBoundingClientRect(); gesture.current = { pointer: event.pointerId, origin: event.clientX, width: bounds.width, moved: false }; pending.current = 0; event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId); },
    onPointerMove: event => { const g = gesture.current; if (!g || g.pointer !== event.pointerId) return; const raw = (event.clientX - g.origin) / g.width * axisDuration; g.moved ||= Math.abs(event.clientX - g.origin) > 3; const target = snap.enabled && !event.altKey ? snapTime(layer.start + raw, snap.targets.output.filter(value => Math.abs(value - layer.start) > .00001 && Math.abs(value - layer.end) > .00001), 8 / g.width * axisDuration) - layer.start : raw; pending.current = Math.max(-layer.start, Math.min(Math.max(0, duration - layer.end), target)); setOffset(pending.current); },
    onPointerUp: event => { const g = gesture.current; if (!g || g.pointer !== event.pointerId) return; if (g.moved) patch(layer.id, { start: layer.start + pending.current, end: layer.end + pending.current }); else seek(layer.start); gesture.current = null; setOffset(0); event.currentTarget.releasePointerCapture(event.pointerId); },
    onPointerCancel: cancel, onLostPointerCapture: cancel,
    onKeyDown: event => { if (event.key === 'Escape') { event.preventDefault(); cancel(); return; } if (!event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); event.stopPropagation(); select(); const delta = (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? .1 : .01), next = Math.max(0, Math.min(duration - (layer.end - layer.start), layer.start + delta)); patch(layer.id, { start: next, end: next + layer.end - layer.start }); },
  }} /></div></div>;
}

function LayerWaveform({ layer, range, offset, points }: { layer: AudioLayer; range: { start: number; end: number }; offset: number; points: WaveformPoint[] }) {
  const length = range.end - range.start, sourceStart = layer.loop ? layer.sourceStart : Math.max(0, layer.sourceStart + range.start - layer.start - offset), fadeIn = Math.min(layer.fadeIn, length), fadeOut = Math.min(layer.fadeOut, length);
  const peaks = useMemo(() => layerWaveformPoints({ ...layer, start: 0, end: length, sourceStart, fadeIn, fadeOut }, points), [points, length, sourceStart, layer.sourceEnd, layer.loop, layer.muted, layer.volume, fadeIn, fadeOut]);
  return <div className="clip-waveform"><Waveform points={peaks} duration={length} range={{ start: 0, end: length }} /></div>;
}
