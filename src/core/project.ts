import { parseAddedEffects } from './effect-ids';
import { parseCoverArtwork } from './cover-art';
import { parseTagOverrides } from './media-tags';
import { audioLayerSource, parseAudioLayers, sameLayerSource } from './audio-layers';
import { parseMarkers } from './markers';
import { clipEffectKeys, type TimelineClip } from './clips';
import { parseAcceleration } from './hardware';
import { parseColor } from './color';
import { parseGeometry } from './geometry';
import { parseOverlays } from './overlays';
import { parseSubtitles } from './subtitles';
import { validateEdit } from './export-plan';
import { type EditSettings, type MediaAsset } from './types';
import { MAX_IMPORT_FILES } from './imports';
export type SourceIdentity = Pick<MediaAsset, 'name' | 'size' | 'kind' | 'duration' | 'width' | 'height' | 'hasAudio' | 'fingerprint'>;
export interface ProjectDocument {
  version: 1;
  name: string;
  selectedSource: number;
  sources: { source: SourceIdentity; edit: EditSettings }[];
}
const fail = () => { throw new Error('Invalid project file. Choose a supported .frame.json project.'); };
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
}
function number(value: unknown): number { if (typeof value !== 'number' || !Number.isFinite(value)) return fail(); return value; }
function boolean(value: unknown): boolean { if (typeof value !== 'boolean') return fail(); return value; }
function text(value: unknown, max: number): string { if (typeof value !== 'string' || !value.trim() || value.length > max) return fail(); return value; }
export function sourceIdentity(asset: MediaAsset): SourceIdentity {
  const { name, size, kind, duration, width, height, hasAudio, fingerprint } = asset;
  return { name, size, kind, duration, width, height, hasAudio, ...(fingerprint ? { fingerprint } : {}) };
}
export function parseEdit(value: unknown, asset: MediaAsset): EditSettings {
  const e = record(value);
  if (!Array.isArray(e.cuts) || e.cuts.length > 1000 || !Array.isArray(e.splits) || e.splits.length > 1000) return fail();
  const c = e.crop === null ? null : record(e.crop);
  const eq = e.equalizer === undefined ? { bass: 0, mid: 0, treble: 0 } : record(e.equalizer);
  const edit: EditSettings = {
    addedEffects: parseAddedEffects(e.addedEffects),
    audioDucking: e.audioDucking === undefined ? false : boolean(e.audioDucking), audioLayers: parseAudioLayers(e.audioLayers), audioMixProtectPeaks: e.audioMixProtectPeaks === undefined ? true : boolean(e.audioMixProtectPeaks),
    markers: parseMarkers(e.markers, asset.duration),
    color: parseColor(e.color),
    geometry: parseGeometry(e.geometry),
    overlays: parseOverlays(e.overlays),
    subtitles: parseSubtitles(e.subtitles),
    normalizeLoudness: e.normalizeLoudness === undefined ? false : boolean(e.normalizeLoudness), targetLufs: e.targetLufs === undefined ? -16 : number(e.targetLufs),
    reduceNoise: e.reduceNoise === undefined ? false : boolean(e.reduceNoise), noiseStrength: e.noiseStrength === undefined ? 12 : number(e.noiseStrength), noiseFloor: e.noiseFloor === undefined ? -50 : number(e.noiseFloor),
    equalizer: { bass: number(eq.bass), mid: number(eq.mid), treble: number(eq.treble) },
    audioFadeIn: e.audioFadeIn === undefined ? 0 : number(e.audioFadeIn), audioFadeOut: e.audioFadeOut === undefined ? 0 : number(e.audioFadeOut),
    videoFadeIn: e.videoFadeIn === undefined ? 0 : number(e.videoFadeIn), videoFadeOut: e.videoFadeOut === undefined ? 0 : number(e.videoFadeOut),
    speed: e.speed === undefined ? 1 : number(e.speed), preservePitch: e.preservePitch === undefined ? true : boolean(e.preservePitch),
    start: number(e.start), end: number(e.end), volume: number(e.volume),
    cuts: e.cuts.map(value => { const r = record(value); return { start: number(r.start), end: number(r.end) }; }),
    splits: e.splits.map(number),
    crop: c ? { x: number(c.x), y: number(c.y), width: number(c.width), height: number(c.height) } : null,
    format: text(e.format, 10) as EditSettings['format'], quality: text(e.quality, 10) as EditSettings['quality'],
    acceleration: parseAcceleration(e.acceleration),
    targetSizeMb: e.targetSizeMb === undefined || e.targetSizeMb === null ? null : number(e.targetSizeMb),
    gifLoop: e.gifLoop === undefined ? 0 : number(e.gifLoop), gifColors: e.gifColors === undefined ? 256 : number(e.gifColors),
    gifDither: (e.gifDither === undefined ? 'sierra2_4a' : e.gifDither) as EditSettings['gifDither'],
    gifWidth: e.gifWidth === undefined || e.gifWidth === null ? null : number(e.gifWidth),
    audioSampleRate: e.audioSampleRate === undefined || e.audioSampleRate === null ? null : number(e.audioSampleRate),
    audioChannels: e.audioChannels === undefined || e.audioChannels === null ? null : number(e.audioChannels),
    wavDepth: e.wavDepth === undefined ? 16 : number(e.wavDepth) as EditSettings['wavDepth'],
    videoBitrate: e.videoBitrate === null ? null : number(e.videoBitrate), audioBitrate: number(e.audioBitrate), fps: number(e.fps),
    outputTags: parseTagOverrides(e.outputTags), includeChapters: e.includeChapters === undefined ? false : boolean(e.includeChapters), customArtwork: parseCoverArtwork(e.customArtwork), includeArtwork: boolean(e.includeArtwork), keepMetadata: boolean(e.keepMetadata),
  };
  if (e.clips !== undefined) {
    if (!Array.isArray(e.clips) || !e.clips.length || e.clips.length > 1000) return fail();
    edit.clips = e.clips.map(value => {
      const c = record(value), effects = record(c.effects);
      if (Object.keys(effects).some(key => !clipEffectKeys.includes(key as typeof clipEffectKeys[number]))) return fail();
      const clip: TimelineClip = { id: text(c.id, 120), start: number(c.start), end: number(c.end), effects: { ...effects } };
      if (clip.effects.addedEffects !== undefined) clip.effects.addedEffects = parseAddedEffects(clip.effects.addedEffects);
      if (clip.effects.color) clip.effects.color = parseColor(clip.effects.color);
      if (clip.effects.geometry) clip.effects.geometry = parseGeometry(clip.effects.geometry);
      return clip;
    });
  }
  validateEdit(asset, edit);
  return edit;
}
export function parseProject(value: unknown): ProjectDocument {
  const doc = record(value);
  if (doc.version !== 1) throw new Error('This project version is unsupported. Use a version 1 Frame project.');
  if (!Array.isArray(doc.sources) || doc.sources.length < 1 || doc.sources.length > MAX_IMPORT_FILES) return fail();
  const selectedSource = number(doc.selectedSource);
  if (!Number.isInteger(selectedSource) || selectedSource < 0 || selectedSource >= doc.sources.length) return fail();
  const sources = doc.sources.map(value => {
    const entry = record(value); const s = record(entry.source);
    if (s.kind !== 'audio' && s.kind !== 'video') return fail();
    const source: SourceIdentity = { name: text(s.name, 255), size: number(s.size), kind: s.kind, duration: number(s.duration), hasAudio: boolean(s.hasAudio) };
    if (s.fingerprint !== undefined) { if (typeof s.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(s.fingerprint)) return fail(); source.fingerprint = s.fingerprint; }
    if (!Number.isSafeInteger(source.size) || source.size < 0 || source.duration < 0.05) return fail();
    for (const key of ['width', 'height'] as const) if (s[key] !== undefined) {
      source[key] = number(s[key]); if (!Number.isInteger(source[key]) || source[key]! < 2) return fail();
    }
    if (source.kind === 'video' && (!source.width || !source.height)) return fail();
    const asset: MediaAsset = { ...source, id: '', previewUrl: '' };
    return { source, edit: parseEdit(entry.edit, asset) };
  });
  if (sources.some(entry => entry.edit.audioLayers?.some(layer => layer.sourceIndex !== undefined ? !sources[layer.sourceIndex] || !sameLayerSource(layer.source, sources[layer.sourceIndex].source) : !sources.some(item => sameLayerSource(layer.source, item.source))))) throw new Error('This project is missing a music or voiceover source.');
  return { version: 1, name: text(doc.name, 120), selectedSource, sources };
}
export function createProject(name: string, assets: MediaAsset[], settingsFor: (id: string) => EditSettings, selected: string): ProjectDocument {
  return parseProject({ version: 1, name, selectedSource: Math.max(0, assets.findIndex(a => a.id === selected)),
    sources: assets.map(asset => { const edit = settingsFor(asset.id); return { source: sourceIdentity(asset), edit: { ...edit, audioLayers: edit.audioLayers?.map(layer => {
      const source = audioLayerSource(layer, assets); if (!source) throw new Error(`Restore the source for “${layer.source.name}” before saving this project.`);
      const { sourceId: _sourceId, ...portable } = layer; return { ...portable, sourceIndex: assets.findIndex(item => item.id === source.id) };
    }) } }; }) });
}
export function matchSources(project: ProjectDocument, assets: MediaAsset[]): (string | null)[] {
  const used = new Set<string>();
  return project.sources.map(({ source }) => {
    const match = assets.find(a => !used.has(a.id) && sameLayerSource(source, a));
    if (match) used.add(match.id);
    return match?.id ?? null;
  });
}
export const projectFilename = (name: string) => `${name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\.+$/, '') || 'project'}.frame.json`;
