import { fadeFilters } from './fades';
import { editedDuration } from './timeline';
import type { EditSettings, MediaAsset } from './types';
export function videoFilters(_asset: MediaAsset, edit: EditSettings): string[] {
  const c = edit.crop; const filters = c ? [`crop=${c.width}:${c.height}:${c.x}:${c.y}`] : [];
  if (edit.speed !== 1) filters.push(`setpts=(PTS-STARTPTS)/${edit.speed}`);
  return [...filters, ...fadeFilters(edit, 'video')];
}
export function audioFilters(edit: EditSettings): string[] {
  const filters = [`volume=${edit.volume}`];
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
  return [...filters, ...fadeFilters(edit, 'audio')];
}
