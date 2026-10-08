import { filterPath, resourcePaths, type RecipeResources } from './resources';
import { outputCues } from './subtitles';
import { cleanupFilters } from './audio-effects';
import { fadeFilters } from './fades';
import { editedDuration } from './timeline';
import type { EditSettings, MediaAsset } from './types';
export function videoFilters(_asset: MediaAsset, edit: EditSettings, resources: RecipeResources = resourcePaths()): string[] {
  const c = edit.crop; const filters = c ? [`crop=${c.width}:${c.height}:${c.x}:${c.y}`] : [];
  if (edit.speed !== 1) filters.push(`setpts=(PTS-STARTPTS)/${edit.speed}`);
  if (edit.subtitles.mode === 'burn' && outputCues(edit).length) filters.push(`subtitles=filename=${filterPath(resources.captions)}:fontsdir=${filterPath(resources.fonts)}:force_style='FontName=DejaVu Sans,FontSize=22'`);
  return [...filters, ...fadeFilters(edit, 'video')];
}
export function audioFilters(edit: EditSettings, asset?: MediaAsset): string[] {
  const filters: string[] = [];
  if (edit.speed !== 1) {
    if (!edit.preservePitch) filters.push('aresample=48000', `asetrate=${Math.round(48000 * edit.speed)}`, 'aresample=48000');
    else {
      let tempo = edit.speed;
      while (tempo < 0.5) { filters.push('atempo=0.5'); tempo *= 2; }
      while (tempo > 2) { filters.push('atempo=2'); tempo /= 2; }
      if (tempo !== 1) filters.push(`atempo=${tempo}`);
    }
    filters.push(`apad=whole_dur=${editedDuration(edit)}`);
  }
  return [...filters, ...cleanupFilters(edit, asset), `volume=${edit.volume}`, ...fadeFilters(edit, 'audio')];
}
