import { validateEdit } from './export-plan';
import { type EditSettings, type MediaAsset } from './types';
export type SourceIdentity = Pick<MediaAsset, 'name' | 'size' | 'kind' | 'duration' | 'width' | 'height' | 'hasAudio'>;
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
  const { name, size, kind, duration, width, height, hasAudio } = asset;
  return { name, size, kind, duration, width, height, hasAudio };
}
export function parseEdit(value: unknown, asset: MediaAsset): EditSettings {
  const e = record(value);
  if (!Array.isArray(e.cuts) || e.cuts.length > 1000 || !Array.isArray(e.splits) || e.splits.length > 1000) return fail();
  const c = e.crop === null ? null : record(e.crop);
  const edit: EditSettings = {
    speed: e.speed === undefined ? 1 : number(e.speed), preservePitch: e.preservePitch === undefined ? true : boolean(e.preservePitch),
    start: number(e.start), end: number(e.end), volume: number(e.volume),
    cuts: e.cuts.map(value => { const r = record(value); return { start: number(r.start), end: number(r.end) }; }),
    splits: e.splits.map(number),
    crop: c ? { x: number(c.x), y: number(c.y), width: number(c.width), height: number(c.height) } : null,
    format: text(e.format, 10) as EditSettings['format'], quality: text(e.quality, 10) as EditSettings['quality'],
    videoBitrate: e.videoBitrate === null ? null : number(e.videoBitrate), audioBitrate: number(e.audioBitrate), fps: number(e.fps),
    includeArtwork: boolean(e.includeArtwork), keepMetadata: boolean(e.keepMetadata),
  };
  validateEdit(asset, edit);
  return edit;
}
export function parseProject(value: unknown): ProjectDocument {
  const doc = record(value);
  if (doc.version !== 1) throw new Error('This project version is unsupported. Use a version 1 Frame project.');
  if (!Array.isArray(doc.sources) || doc.sources.length < 1 || doc.sources.length > 100) return fail();
  const selectedSource = number(doc.selectedSource);
  if (!Number.isInteger(selectedSource) || selectedSource < 0 || selectedSource >= doc.sources.length) return fail();
  const sources = doc.sources.map(value => {
    const entry = record(value); const s = record(entry.source);
    if (s.kind !== 'audio' && s.kind !== 'video') return fail();
    const source: SourceIdentity = { name: text(s.name, 255), size: number(s.size), kind: s.kind, duration: number(s.duration), hasAudio: boolean(s.hasAudio) };
    if (!Number.isSafeInteger(source.size) || source.size < 0 || source.duration < 0.05) return fail();
    for (const key of ['width', 'height'] as const) if (s[key] !== undefined) {
      source[key] = number(s[key]); if (!Number.isInteger(source[key]) || source[key]! < 2) return fail();
    }
    if (source.kind === 'video' && (!source.width || !source.height)) return fail();
    const asset: MediaAsset = { ...source, id: '', previewUrl: '' };
    return { source, edit: parseEdit(entry.edit, asset) };
  });
  return { version: 1, name: text(doc.name, 120), selectedSource, sources };
}
export function createProject(name: string, assets: MediaAsset[], settingsFor: (id: string) => EditSettings, selected: string): ProjectDocument {
  return parseProject({ version: 1, name, selectedSource: Math.max(0, assets.findIndex(a => a.id === selected)),
    sources: assets.map(asset => ({ source: sourceIdentity(asset), edit: settingsFor(asset.id) })) });
}
export function matchSources(project: ProjectDocument, assets: MediaAsset[]): (string | null)[] {
  const used = new Set<string>();
  return project.sources.map(({ source }) => {
    const match = assets.find(a => !used.has(a.id) && a.name === source.name && a.size === source.size && a.kind === source.kind && a.hasAudio === source.hasAudio && Math.abs(a.duration - source.duration) < 0.05 && a.width === source.width && a.height === source.height);
    if (match) used.add(match.id);
    return match?.id ?? null;
  });
}
export const projectFilename = (name: string) => `${name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\.+$/, '') || 'project'}.frame.json`;
