import { TransientMessage } from './TransientMessage';
import { allAudioLayers, extraInstances } from '../core/effect-instances';
import { useEffect, useRef, useState } from 'react';
import { audioLayerSource, type AudioLayer } from '../core/audio-layers';
import type { EditSettings, MediaAsset } from '../core/types';
import { editedDuration } from '../core/timeline';
import { fadeGain, outputTimeAtSource } from '../core/fades';
import { timelineFadeGain } from '../core/timeline-effects';
export function AudioMixPreview({ outputPosition, assets, edit, current, playing }: { outputPosition?: number; assets: MediaAsset[]; edit: EditSettings; current: number; playing: boolean }) {
  const position = (outputPosition ?? outputTimeAtSource(edit, current));
  return <div className="audio-mix-preview" aria-label="Audio track playback">{allAudioLayers(edit).map(layer => { const source = audioLayerSource(layer, assets); return source && <TrackPreview key={layer.id} layer={{ ...layer, end: Math.min(layer.end, editedDuration(edit)) }} source={source} position={position} playing={playing} outputFade={extraInstances(edit).filter(instance => instance.effect.startsWith('audioFade')).reduce((gain, instance) => gain * (instance.timeSpace === 'output' ? timelineFadeGain(instance, position) : fadeGain(position, editedDuration(edit), instance.settings.audioFadeIn ?? 0, instance.settings.audioFadeOut ?? 0)), fadeGain(position, editedDuration(edit), edit.audioFadeIn, edit.audioFadeOut))} />; })}</div>;
}
function TrackPreview({ layer, source, position, playing, outputFade }: { layer: AudioLayer; source: MediaAsset; position: number; playing: boolean; outputFade: number }) {
  const ref = useRef<HTMLAudioElement>(null), [error, setError] = useState(false);
  const elapsed = position - layer.start, segment = layer.sourceEnd - layer.sourceStart, active = !layer.muted && elapsed >= 0 && position < layer.end && (layer.loop || elapsed < segment);
  const clock = layer.sourceStart + (layer.loop ? Math.max(0, elapsed) % segment : Math.max(0, elapsed));
  useEffect(() => {
    const media = ref.current; if (!media || error) return;
    media.volume = Math.min(1, layer.volume * fadeGain(Math.max(0, elapsed), layer.end - layer.start, layer.fadeIn, layer.fadeOut) * outputFade);
    if (!active || !playing) media.pause();
    if (active && Number.isFinite(media.duration) && Math.abs(media.currentTime - clock) > .1) media.currentTime = clock;
    if (active && playing && media.paused) void media.play().catch(() => setError(true));
  }, [playing, position, layer, source, error]);
  useEffect(() => () => { ref.current?.pause(); }, []);
  return <><audio ref={ref} data-frame-source={source.id} data-frame-mix-layer src={source.previewUrl} preload="metadata" onError={() => setError(true)} aria-label={`Preview track ${source.name}`} />{error && <TransientMessage role="status">{source.name} cannot play live here; it still mixes on export.</TransientMessage>}</>;
}
