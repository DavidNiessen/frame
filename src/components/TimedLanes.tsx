import { effectAction } from '../core/effect-actions';
import { memo, useMemo } from 'react';
import { ChevronDown, Captions, AudioLines } from 'lucide-react';
import { fadeKeys, fadeLabel, fadeRange, resizeFade } from '../core/timed-effects';
import { keptRanges, editedDuration } from '../core/timeline';
import { clipPositions, clipRecipe, patchClip } from '../core/clips';
import { clipEffectRows } from '../core/effect-timeline';
import { effectLibrary, type EffectId } from '../core/effect-library';
import { ClipEffectLanes } from './ClipEffectLanes';
import type { EditSettings, MediaAsset } from '../core/types';
import type { TrackFilter } from './layout/TimelineNavigator';
import { TimelineRange } from './TimelineRange';
interface Props { total: number; openEffect: (id: EffectId) => void; compact: boolean; filter: TrackFilter; selectClip: (id: string | null) => void; asset: MediaAsset; edit: EditSettings; disabled: boolean; update: (patch: Partial<EditSettings>) => void; seek: (time: number) => void }
export const TimedLanes = memo(function TimedLanes({ asset, edit, disabled, update, seek, compact, filter, selectClip, openEffect, total }: Props) {
  const outputDuration = editedDuration(edit);
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
  const effectRows = clipEffectRows(asset, edit);
  const clipFades = edit.clips ? positions.flatMap(position => fadeKeys(asset).filter(key => (position.clip.effects[key] ?? 0) > 0).map(key => ({ ...position, key }))) : [];
  const effectCount = fades.length + clipFades.length + effectRows.reduce((count, row) => count + row.items.length, 0);
  const watermark = effectLibrary.find(effect => effect.id === 'watermark')!;
  const hasWatermark = asset.kind === 'video' && !!(edit.overlays.text || edit.overlays.image);
  return <div className={`timed-lanes ${compact ? 'compact' : ''}`}>
    {filter !== 'clips' && filter !== 'effects' && captionRows.length > 0 && <details data-timeline-kind="captions" className="timeline-lane-group" open={!compact || filter === 'captions'}>
      <summary><Captions size={14} />Captions <span>{edit.subtitles.cues.length}{edit.subtitles.mode === 'none' ? ' · off' : ''}</span><ChevronDown size={14} /></summary>
      {captionRows.map((row, rowIndex) => <div className="timeline-lane caption-lane" key={rowIndex}>
        {row.map((cue, index) => <TimelineRange selectOnPointer key={`${cue.index}-${index}`} range={cue} displayRange={cue.shown} displaySpeed={cue.speed} limits={{ start: 0, end: asset.duration }} duration={total}
          label={`Caption ${cue.index + 1}`} text={cue.text} className={`caption-bar ${edit.subtitles.mode === 'none' ? 'inactive' : ''}`} disabled={disabled}
          remove={{ label: `Remove caption ${cue.index + 1}`, run: () => update({ subtitles: { ...edit.subtitles, cues: edit.subtitles.cues.filter((_, i) => i !== cue.index) } }) }}
          onSelect={() => seek(cue.start)} onChange={range => update({ subtitles: { ...edit.subtitles,
            cues: edit.subtitles.cues.map((original, i) => i === cue.index ? { ...original, start: range.start === cue.start ? original.start : range.start, end: range.end === cue.end ? original.end : range.end } : original) } })} />)}
      </div>)}
    </details>}
    {filter !== 'clips' && filter !== 'captions' && (effectCount > 0 || hasWatermark) && <details data-timeline-kind="effects" className="timeline-lane-group" open={!compact || filter === 'effects'}>
      <summary><AudioLines size={14} />Effects <span>{effectCount + Number(hasWatermark)}</span><ChevronDown size={14} /></summary>
      <ClipEffectLanes asset={asset} edit={edit} total={total} disabled={disabled} update={update} seek={seek} selectClip={selectClip} openEffect={openEffect} />
      {hasWatermark && <div className="timeline-lane effect-lane"><TimelineRange selectOnPointer range={edit.clips ? { start: 0, end: outputDuration } : edit} limits={{ start: 0, end: total }} duration={total} label="Watermark effect" text="Watermark · Source" edges={[]} disabled={disabled} onChange={() => {}} onSelect={() => openEffect('watermark')} remove={{ label: 'Remove Watermark from source', run: () => update(effectAction(edit, asset, watermark, null, 'remove')) }} /></div>}
      {fades.map(key => {
        const sequence = !!edit.clips, range = sequence ? key.endsWith('In') ? { start: 0, end: edit[key] } : { start: outputDuration - edit[key], end: outputDuration } : fadeRange(edit, key);
        return <div className="timeline-lane effect-lane" key={key}>
          <TimelineRange selectOnPointer range={range} limits={sequence ? { start: 0, end: outputDuration } : { start: retained[0]?.start ?? edit.start, end: retained.at(-1)?.end ?? edit.end }}
            duration={total} snapSpace={sequence ? 'output' : 'source'} label={fadeLabel(key)} text={`${fadeLabel(key)} · ${edit[key].toFixed(2)}s`} className={`fade-bar ${key.endsWith('In') ? 'fade-in' : 'fade-out'}`} minimum={.01}
            edges={[key.endsWith('In') ? 'end' : 'start']} disabled={disabled} onSelect={() => { selectClip(null); seek(retained[0]?.start ?? edit.start); openEffect(key); }}
            remove={{ label: `Remove ${fadeLabel(key)} from sequence`, run: () => update({ [key]: 0, addedEffects: edit.addedEffects?.filter(id => id !== key), ...(edit.clips ? { clips: edit.clips.map(clip => ({ ...clip, effects: { ...clip.effects, addedEffects: (clip.effects[key] ?? 0) > 0 ? clip.effects.addedEffects : clip.effects.addedEffects?.filter(id => id !== key) } })) } : {}) }) }}
            onChange={range => update(sequence ? { [key]: key.endsWith('In') ? range.end : outputDuration - range.start } : resizeFade(edit, key, range))} />
          <span className="effect-lane-label">{fadeLabel(key)} · {edit[key].toFixed(2)}s</span>
        </div>;
      })}
      {clipFades.map(({ clip, start, key }) => {
        const recipe = clipRecipe(edit, clip), localDuration = editedDuration(recipe), value = recipe[key];
        const range = key.endsWith('In') ? { start, end: start + value } : { start: start + localDuration - value, end: start + localDuration };
        return <div className="timeline-lane effect-lane" key={`${clip.id}-${key}`}><TimelineRange selectOnPointer range={range} limits={{ start, end: start + localDuration }} duration={total} snapSpace="output" label={`${fadeLabel(key)} clip ${positions.findIndex(p => p.clip.id === clip.id) + 1}`} text={`${fadeLabel(key)} · clip`} edges={[key.endsWith('In') ? 'end' : 'start']} minimum={.01} disabled={disabled} onSelect={() => { selectClip(clip.id); seek(clip.start); openEffect(key); }}
          remove={{ label: `Remove ${fadeLabel(key)} from clip ${positions.findIndex(p => p.clip.id === clip.id) + 1}`, run: () => update(effectAction(edit, asset, effectLibrary.find(effect => effect.id === key)!, clip.id, 'remove')) }}
          onChange={range => update(patchClip(edit, clip.id, { [key]: key.endsWith('In') ? range.end - start : start + localDuration - range.start }))} /></div>;
      })}
    </details>}
  </div>;
});
