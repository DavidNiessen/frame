import { allAudioLayers, extraInstances } from './effect-instances';
import { timelineFadeFilter } from './timeline-effects';
import { duckMusicGraph } from './audio-ducking';
import type { SourceIdentity } from './project';
import type { EditSettings, MediaAsset } from './types';
import { editedDuration } from './timeline';
export interface AudioLayer { id: string; role?: 'music' | 'voiceover'; sourceId?: string; sourceIndex?: number; source: SourceIdentity; start: number; end: number; sourceStart: number; sourceEnd: number; volume: number; fadeIn: number; fadeOut: number; loop: boolean; muted: boolean }
export interface AudioLayerInput { layer: AudioLayer; path: string }
export const sameLayerSource = (source: SourceIdentity, asset: SourceIdentity) => source.name === asset.name && source.size === asset.size && source.kind === asset.kind && source.hasAudio === asset.hasAudio && Math.abs(source.duration - asset.duration) < .05 && source.width === asset.width && source.height === asset.height && (!source.fingerprint || !asset.fingerprint || source.fingerprint === asset.fingerprint);
/** Runtime IDs disambiguate equally named files; portable projects store their source index. */
export function audioLayerSource(layer: AudioLayer, assets: MediaAsset[]): MediaAsset | undefined {
  if (layer.sourceId) { const exact = assets.find(asset => asset.id === layer.sourceId); if (exact) return sameLayerSource(layer.source, exact) ? exact : undefined; }
  const matches = assets.filter(asset => sameLayerSource(layer.source, asset));
  return matches.length === 1 ? matches[0] : undefined;
}
export function parseAudioLayers(value: unknown): AudioLayer[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 16) throw new Error('Use up to 16 audio layers.');
  const ids = new Set<string>();
  return value.map(item => {
    if (!item || typeof item !== 'object') throw new Error('Invalid audio track.'); const layer = item as AudioLayer, source = layer.source;
    if (typeof layer.id !== 'string' || !layer.id || layer.id.length > 120 || ids.has(layer.id)) throw new Error('Invalid audio track identifier.'); ids.add(layer.id);
    if (layer.role !== undefined && !['music', 'voiceover'].includes(layer.role)) throw new Error('Choose music or voiceover for this track.');
    if (layer.sourceId !== undefined && (typeof layer.sourceId !== 'string' || !layer.sourceId || layer.sourceId.length > 120) || layer.sourceIndex !== undefined && (!Number.isInteger(layer.sourceIndex) || layer.sourceIndex < 0 || layer.sourceIndex >= 2000)) throw new Error('Invalid audio track source reference.');
    if (!source || typeof source.name !== 'string' || !source.name.trim() || source.name.length > 255 || !Number.isSafeInteger(source.size) || source.size < 0 || !['audio', 'video'].includes(source.kind) || source.hasAudio !== true || !Number.isFinite(source.duration) || source.duration < .05 || source.duration > 86400) throw new Error('Invalid audio track source.');
    if (source.fingerprint !== undefined && (typeof source.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(source.fingerprint))) throw new Error('Invalid audio source fingerprint.');
    if ([source.width, source.height].some(value => value !== undefined && (!Number.isInteger(value) || value < 2 || value > 65536))) throw new Error('Invalid audio track source dimensions.');
    if (source.kind === 'video' && (![source.width, source.height].every(value => Number.isInteger(value) && value! >= 2 && value! <= 65536))) throw new Error('Invalid audio track source dimensions.');
    if (![layer.start, layer.end, layer.sourceStart, layer.sourceEnd, layer.volume, layer.fadeIn, layer.fadeOut].every(Number.isFinite) || layer.start < 0 || layer.end > 86400 || layer.end - layer.start < .05 || layer.sourceStart < 0 || layer.sourceEnd > source.duration + .001 || layer.sourceEnd - layer.sourceStart < .05 || layer.volume < 0 || layer.volume > 3 || layer.fadeIn < 0 || layer.fadeOut < 0 || layer.fadeIn > layer.end - layer.start || layer.fadeOut > layer.end - layer.start || typeof layer.loop !== 'boolean' || typeof layer.muted !== 'boolean') throw new Error('Invalid audio track timing, fades or volume.');
    if (layer.loop && layer.sourceEnd - layer.sourceStart > 300) throw new Error('Loop a source segment of up to five minutes to limit memory use.');
    const { name, size, kind, duration, hasAudio, width, height, fingerprint } = source;
    return { id: layer.id, ...(layer.role ? { role: layer.role } : {}), ...(layer.sourceId !== undefined ? { sourceId: layer.sourceId } : {}), ...(layer.sourceIndex !== undefined ? { sourceIndex: layer.sourceIndex } : {}), source: { name, size, kind, duration, hasAudio, width, height, ...(fingerprint ? { fingerprint } : {}) }, start: layer.start, end: layer.end, sourceStart: layer.sourceStart, sourceEnd: layer.sourceEnd, volume: layer.volume, fadeIn: layer.fadeIn, fadeOut: layer.fadeOut, loop: layer.loop, muted: layer.muted };
  });
}
export function resolveAudioLayers(edit: EditSettings, sources: { asset: MediaAsset; path: string }[]): AudioLayerInput[] {
  return parseAudioLayers(allAudioLayers(edit)).map(layer => { const asset = audioLayerSource(layer, sources.map(item => item.asset)), source = asset && sources.find(item => item.asset.id === asset.id); if (!source) throw new Error(`Import “${layer.source.name}” to restore its audio track. If several sources share this name, remove the track and select its source again.`); return { layer, path: source.path }; });
}
export const hasEditedAudio = (asset: MediaAsset, edit: EditSettings) => asset.hasAudio || !!allAudioLayers(edit).length;
export function audioMixGraph(edit: EditSettings, inputs: AudioLayerInput[], firstInput: number, base: string | null, prefix = 'mix') {
  const graph: string[] = [], labels: string[] = [], music: string[] = [], dialogue: string[] = [], duration = editedDuration(edit);
  if (base) { graph.push(`${base}aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[${prefix}base]`); labels.push(`[${prefix}base]`); dialogue.push(`[${prefix}base]`); }
  inputs.forEach(({ layer }, index) => {
    if (layer.muted || layer.start >= duration) return;
    const length = Math.min(layer.end, duration) - layer.start, segment = layer.sourceEnd - layer.sourceStart;
    const filters = [`atrim=start=${layer.sourceStart}:end=${layer.sourceEnd}`, 'asetpts=PTS-STARTPTS', 'aresample=48000', 'aformat=sample_fmts=fltp:channel_layouts=stereo'];
    if (layer.loop) filters.push(`aloop=loop=-1:size=${Math.round(segment * 48000)}`);
    filters.push(`atrim=duration=${length}`, `volume=${layer.volume}`);
    if (layer.fadeIn) filters.push(`afade=t=in:d=${layer.fadeIn}`);
    if (layer.fadeOut) filters.push(`afade=t=out:st=${Math.max(0, length - layer.fadeOut)}:d=${layer.fadeOut}`);
    // The selected segment plus its delay is already bounded by duration. FFmpeg
    // 6.1 drops the leading silence when atrim follows adelay, shifting the layer.
    filters.push(`adelay=${Math.round(layer.start * 1000)}:all=1`, `apad=whole_dur=${duration}`);
    const label = `${prefix}layer${index}`; graph.push(`[${firstInput + index}:a:0]${filters.join(',')}[${label}]`); labels.push(`[${label}]`); (layer.role === 'voiceover' ? dialogue : music).push(`[${label}]`);
  });
  if (edit.audioDucking && music.length && dialogue.length) { const ducked = duckMusicGraph(music, dialogue, prefix, duration); graph.push(...ducked.graph); labels.splice(0, labels.length, ...ducked.labels); }
  if (!labels.length) { graph.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${duration}[${prefix}silent]`); labels.push(`[${prefix}silent]`); }
  const filters = [`amix=inputs=${labels.length}:duration=longest:dropout_transition=0:normalize=0`, `apad=whole_dur=${duration}`, `atrim=duration=${duration}`];
  if (edit.audioChannels === 1) filters.push('aformat=channel_layouts=mono');
  if (edit.audioMixProtectPeaks !== false) filters.push('alimiter=limit=0.95:level=false:latency=true');
  if (edit.audioFadeIn) filters.push(`afade=t=in:d=${edit.audioFadeIn}`);
  if (edit.audioFadeOut) filters.push(`afade=t=out:st=${duration - edit.audioFadeOut}:d=${edit.audioFadeOut}`);
  for (const instance of extraInstances(edit)) {
    if (instance.timeSpace === 'output' && instance.effect.startsWith('audioFade')) { filters.push(...timelineFadeFilter(instance)); continue; }
    if (instance.effect === 'audioFadeIn' && instance.settings.audioFadeIn) filters.push(`afade=t=in:d=${instance.settings.audioFadeIn}`);
    if (instance.effect === 'audioFadeOut' && instance.settings.audioFadeOut) filters.push(`afade=t=out:st=${duration - instance.settings.audioFadeOut}:d=${instance.settings.audioFadeOut}`);
  }
  graph.push(`${labels.join('')}${filters.join(',')}[${prefix}out]`); return { graph, output: `[${prefix}out]` };
}
/** Sample actual source peaks across the track window, including repeats and independent fades. */
export function layerWaveformPoints(layer: AudioLayer, points: import('./waveform').WaveformPoint[], count = 512) {
  const length = layer.end - layer.start, segment = layer.sourceEnd - layer.sourceStart;
  return Array.from({ length: count }, (_, index) => {
    const elapsed = index / count * length, sourceTime = layer.sourceStart + (layer.loop ? elapsed % segment : elapsed);
    let low = 0, high = points.length - 1;
    while (low < high) { const middle = Math.ceil((low + high) / 2); if (points[middle].time <= sourceTime) low = middle; else high = middle - 1; }
    const fade = Math.min(1, layer.fadeIn ? elapsed / layer.fadeIn : 1, layer.fadeOut ? (length - elapsed) / layer.fadeOut : 1);
    return { time: elapsed, peak: layer.muted || !layer.loop && elapsed >= segment ? 0 : Math.min(1, (points[low]?.peak ?? 0) * layer.volume * fade) };
  });
}
