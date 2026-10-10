import { orderedMarkers } from './markers';
import { outputTimeAtSource } from './fades';
import { editedDuration } from './timeline';
import type { EditSettings } from './types';
import type { MediaClip } from './composition';
import { defaultTransition, validateTransition, type TransitionSettings } from './transitions';
export interface Chapter { title: string; start: number; end: number }
export const chapterFormats = ['mp4', 'mov', 'mkv', 'm4a'];
function intervals(points: { title: string; start: number }[], duration: number): Chapter[] {
  const sorted = points.filter(point => Number.isFinite(point.start) && point.start >= 0 && Math.round(point.start * 1000) < Math.round(duration * 1000)).sort((a, b) => a.start - b.start);
  const distinct = sorted.filter((point, index) => !index || Math.round(point.start * 1000) > Math.round(sorted[index - 1].start * 1000));
  return distinct.map((point, index) => ({ ...point, end: distinct[index + 1]?.start ?? duration }));
}
export function timelineChapters(edit: EditSettings): Chapter[] {
  const points = orderedMarkers(edit).map(marker => ({ title: marker.name, start: outputTimeAtSource(edit, marker.time) }));
  if (!points.length) return [];
  if (points[0].start > .001) points.unshift({ title: 'Opening', start: 0 });
  return intervals(points, editedDuration(edit));
}
export function mergedChapters(clips: MediaClip[], transition: TransitionSettings = defaultTransition): Chapter[] {
  const blend = validateTransition(clips, transition), points: { title: string; start: number }[] = []; let offset = 0;
  for (const clip of clips) {
    points.push(...(timelineChapters(clip.edit).length ? timelineChapters(clip.edit) : [{ title: clip.asset.name.replace(/\.[^.]+$/, ''), start: 0 }]).map(chapter => ({ title: chapter.title === 'Opening' ? clip.asset.name.replace(/\.[^.]+$/, '') : chapter.title, start: chapter.start + offset })));
    offset += editedDuration(clip.edit) - (blend.type === 'fade' ? blend.duration : 0);
  }
  const duration = offset + (blend.type === 'fade' ? blend.duration : 0);
  return intervals(points, duration);
}
const metadataValue = (value: string) => value.replace(/[\\=;#\n\r]/g, character => character === '\r' ? '' : `\\${character}`);
export function serializeChapters(chapters: Chapter[]): string {
  return ';FFMETADATA1\n' + chapters.map(chapter => `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(chapter.start * 1000)}\nEND=${Math.round(chapter.end * 1000)}\ntitle=${metadataValue(chapter.title)}\n`).join('');
}
export function chapterText(chapters: Chapter[]): string {
  return chapters.map(chapter => {
    const milliseconds = Math.round(chapter.start * 1000), hours = Math.floor(milliseconds / 3600000), minutes = Math.floor(milliseconds / 60000) % 60, seconds = Math.floor(milliseconds / 1000) % 60;
    const timestamp = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds % 1000).padStart(3, '0')}`;
    return `${timestamp} ${chapter.title.replace(/[\r\n]+/g, ' ')}`;
  }).join('\n') + '\n';
}
