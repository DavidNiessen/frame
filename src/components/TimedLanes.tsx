import { memo, useMemo } from 'react';
import { ChevronDown, Captions, AudioLines } from 'lucide-react';
import { fadeKeys, fadeLabel, fadeRange, resizeFade } from '../core/timed-effects';
import { keptRanges, editedDuration } from '../core/timeline';
import { clipPositions, clipRecipe } from '../core/clips';
import { availableEffects, effectActive } from '../core/effect-library';
import type { EditSettings, MediaAsset } from '../core/types';
import type { TrackFilter } from './layout/TimelineNavigator';
import { TimelineRange } from './TimelineRange';
interface Props { compact: boolean; filter: TrackFilter; selectClip: (id: string) => void; asset: MediaAsset; edit: EditSettings; disabled: boolean; update: (patch: Partial<EditSettings>) => void; seek: (time: number) => void }
export const TimedLanes = memo(function TimedLanes({ asset, edit, disabled, update, seek, compact, filter, selectClip }: Props) {
  const total = edit.clips ? editedDuration(edit) : asset.duration;
  const positions = clipPositions(edit);
  const captionRows = useMemo(() => {
    const rows: { index: number; start: number; end: number; text: string; shown: { start: number; end: number }; speed: number }[][] = [];
    const cues = edit.subtitles.cues.flatMap((cue, index) => edit.clips ? clipPositions(edit).flatMap(({ clip, start, speed }) => {
      const from = Math.max(clip.start, cue.start), to = Math.min(clip.end, cue.end);
      return to > from ? [{ ...cue, index, start: from, end: to, speed, shown: { start: start + (from - clip.start) / speed, end: start + (to - clip.start) / speed } }] : [];
    }) : [{ ...cue, index, speed: 1, shown: { start: cue.start, end: cue.end } }]);
    cues.filter(cue => cue.end > cue.start).sort((a, b) => a.shown.start - b.shown.start).forEach(cue => {
      const row = rows.find(r => r.at(-1)!.shown.end <= cue.shown.start);
      if (row) row.push(cue); else rows.push([cue]);
    });
    return rows;
  }, [edit.subtitles.cues, edit.clips, edit.speed]);
  const fades = fadeKeys(asset).filter(key => edit[key] > 0), retained = keptRanges(edit);
  const clipEffects = edit.clips ? positions.filter(({ clip }) => Object.keys(clip.effects).length > 0) : [];
  return <div className={`timed-lanes ${compact ? 'compact' : ''}`}>
    {filter !== 'clips' && filter !== 'effects' && captionRows.length > 0 && <details className="timeline-lane-group" open={!compact || filter === 'captions'}>
      <summary><Captions size={14} />Captions <span>{edit.subtitles.cues.length}{edit.subtitles.mode === 'none' ? ' · off' : ''}</span><ChevronDown size={14} /></summary>
      {captionRows.map((row, rowIndex) => <div className="timeline-lane caption-lane" key={rowIndex}>
        {row.map((cue, index) => <TimelineRange selectOnPointer key={`${cue.index}-${index}`} range={cue} displayRange={cue.shown} displaySpeed={cue.speed} limits={{ start: 0, end: asset.duration }} duration={total}
          label={`Caption ${cue.index + 1}`} text={cue.text} className={`caption-bar ${edit.subtitles.mode === 'none' ? 'inactive' : ''}`} disabled={disabled}
          onSelect={() => seek(cue.start)} onChange={range => update({ subtitles: { ...edit.subtitles,
            cues: edit.subtitles.cues.map((original, i) => i === cue.index ? { ...original, start: range.start, end: range.end } : original) } })} />)}
      </div>)}
    </details>}
    {filter !== 'clips' && filter !== 'captions' && (fades.length > 0 || clipEffects.length > 0) && <details className="timeline-lane-group" open={!compact || filter === 'effects'}>
      <summary><AudioLines size={14} />Effects <span>{fades.length + clipEffects.length}</span><ChevronDown size={14} /></summary>
      {clipEffects.length > 0 && <div className="timeline-lane effect-lane">{clipEffects.map(({ clip, start, end, speed }) => {
        const names = availableEffects(asset).filter(effect => effect.scope === 'clip' && effectActive(effect, clipRecipe(edit, clip), asset)).map(effect => effect.name).join(' · ');
        return <TimelineRange key={clip.id} selectOnPointer range={clip} displayRange={{ start, end }} displaySpeed={speed} edges={[]} limits={{ start: 0, end: asset.duration }} duration={total} label={`Clip effects: ${names}`} text={`✦ ${names}`} disabled={disabled} onChange={() => {}} onSelect={() => { selectClip(clip.id); seek(clip.start); }} />;
      })}</div>}
      {fades.map(key => {
        const sequence = !!edit.clips, range = sequence ? key.endsWith('In') ? { start: 0, end: edit[key] } : { start: total - edit[key], end: total } : fadeRange(edit, key);
        return <div className="timeline-lane effect-lane" key={key}>
          <TimelineRange selectOnPointer range={range} limits={sequence ? { start: 0, end: total } : { start: retained[0]?.start ?? edit.start, end: retained.at(-1)?.end ?? edit.end }}
            duration={total} label={fadeLabel(key)} text={`${fadeLabel(key)} · ${edit[key].toFixed(2)}s`} className={`fade-bar ${key.endsWith('In') ? 'fade-in' : 'fade-out'}`} minimum={.01}
            edges={[key.endsWith('In') ? 'end' : 'start']} disabled={disabled} onSelect={() => seek(retained[0]?.start ?? edit.start)}
            onChange={range => update(sequence ? { [key]: key.endsWith('In') ? range.end : total - range.start } : resizeFade(edit, key, range))} />
          <span className="effect-lane-label">{fadeLabel(key)} · {edit[key].toFixed(2)}s</span>
        </div>;
      })}
      {clipEffects.map(({ clip, start, speed }) => fadeKeys(asset).filter(key => (clip.effects[key] ?? 0) > 0).map(key => {
        const recipe = clipRecipe(edit, clip), localDuration = editedDuration(recipe), value = recipe[key];
        const range = key.endsWith('In') ? { start, end: start + value } : { start: start + localDuration - value, end: start + localDuration };
        return <div className="timeline-lane effect-lane" key={`${clip.id}-${key}`}><TimelineRange selectOnPointer range={range} limits={{ start, end: start + localDuration }} duration={total} label={`${fadeLabel(key)} clip ${positions.findIndex(p => p.clip.id === clip.id) + 1}`} text={`${fadeLabel(key)} · clip`} edges={[key.endsWith('In') ? 'end' : 'start']} minimum={.01} disabled={disabled} onSelect={() => { selectClip(clip.id); seek(clip.start); }} onChange={range => update({ clips: edit.clips!.map(item => item.id === clip.id ? { ...item, effects: { ...item.effects, [key]: key.endsWith('In') ? range.end - start : start + localDuration - range.start } } : item) })} /></div>;
      }))}
    </details>}
  </div>;
});
